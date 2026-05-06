#!/usr/bin/env bash
# H1 CI guard — auto-enumerates every edge function declared with
# `verify_jwt = false` in supabase/config.toml and verifies it either:
#   (a) imports _shared/ip-rate-limit.ts (or equivalent rate-limit helper), OR
#   (b) is explicitly listed in PUBLIC_WEBHOOKS_EXEMPT below with a written reason.
#
# Rationale: a function with verify_jwt=false is reachable without a Supabase
# JWT, so it is internet-exposed unless callers are filtered by HMAC, internal
# mTLS or invoke-only patterns. Those legitimately-not-rate-limited functions
# MUST be added to PUBLIC_WEBHOOKS_EXEMPT with justification — silent drift
# is what this guard prevents.
#
# See mem://features/h1-ip-rate-limit-public-webhooks.

set -euo pipefail

CONFIG="supabase/config.toml"
if [[ ! -f "$CONFIG" ]]; then
  echo "::error::H1 — $CONFIG not found"
  exit 1
fi

# Functions that are verify_jwt=false but are NOT internet-facing public webhooks.
# Each entry MUST have a one-line reason in the comment next to it.
# Categories of legitimate exemptions:
#   - INTERNAL: invoked only by other edge functions / cron-relay (signed via internal-mtls)
#   - CLIENT_AUTH_IN_CODE: client.functions.invoke() with getUser() validation in handler
#   - HMAC_PROTECTED: protected by upstream HMAC signature verification
#   - ADMIN_ONLY: admin-scoped, called from authenticated admin UI
PUBLIC_WEBHOOKS_EXEMPT=(
  # --- INTERNAL / cron-relay invoked ---
  "ads-stats-meta"                # INTERNAL — cron-relay tick
  "automation-jobs-dispatcher"    # INTERNAL — cron-relay tick
  "automation-runner"             # INTERNAL — cron-relay tick
  "capi-event-sender"             # INTERNAL — internal-mtls signed
  "lead-digest-dispatch"          # INTERNAL — cron-relay tick
  "lead-digest-retry-dispatcher"  # INTERNAL — cron-relay tick
  "sheets-export"                 # INTERNAL — cron-relay tick
  "sheets-kpi-refresh"            # INTERNAL — cron-relay tick
  "sheets-leads-export"           # INTERNAL — cron-relay tick
  "scheduled-backup-runner"       # INTERNAL — cron-relay tick
  "sla-breach-checker"            # INTERNAL — cron-relay tick
  "slo-burn-rate-monitor"         # INTERNAL — cron-relay tick
  "ticket-assign-recovery"        # INTERNAL — cron-relay tick
  "audit-alert-dispatcher"        # INTERNAL — cron-relay tick + HMAC outbound
  "send-n8n-webhook"              # INTERNAL — invoked from edge with internal-mtls
  "process-email-queue"           # INTERNAL — cron-relay tick (verify_jwt=true anyway)
  "web-push-dispatcher"           # INTERNAL — cron-relay tick
  "auth-email-hook"               # HMAC_PROTECTED — Supabase auth hook signature

  # --- CLIENT_AUTH_IN_CODE: validate getUser() in handler, not internet-anonymous ---
  "ai-agent"                      # CLIENT_AUTH_IN_CODE
  "ai-chat"                       # CLIENT_AUTH_IN_CODE
  "ai-classify"                   # CLIENT_AUTH_IN_CODE
  "ai-generate-automation"        # CLIENT_AUTH_IN_CODE
  "ai-tag-deals"                  # CLIENT_AUTH_IN_CODE
  "ai-call-apply"                 # CLIENT_AUTH_IN_CODE
  "ai-call-proposals"             # CLIENT_AUTH_IN_CODE
  "ai-generate-webhook-mapping"   # CLIENT_AUTH_IN_CODE
  "calculate-lead-score"          # CLIENT_AUTH_IN_CODE
  "voispeed-call-request"         # CLIENT_AUTH_IN_CODE + idempotency-keys

  # --- ADMIN_ONLY: admin-scoped invocations from authenticated admin UI ---
  "admin-create-user"             # ADMIN_ONLY
  "admin-manage-team"             # ADMIN_ONLY
  "admin-manage-users"            # ADMIN_ONLY
  "google-ads-sync"               # ADMIN_ONLY
  "generate-weekly-report"        # ADMIN_ONLY
  "meta-create-test-lead"         # ADMIN_ONLY
  "meta-subscribe-page"           # ADMIN_ONLY
  "ga4-measurement-protocol"      # INTERNAL — server-to-server CAPI sender

  # --- OAuth start endpoints: protected by oauth_sessions single-use token ---
  "google-oauth-start"            # CSRF-protected by oauth_sessions
  "meta-oauth-start"              # CSRF-protected by oauth_sessions

  # --- Public but with own protection (informational endpoints) ---
  "web-push-public-key"           # PUBLIC by design — returns VAPID public key, no PII
  "keplero-contact-lookup"        # HMAC_PROTECTED — Keplero shared secret

  # --- Additional INTERNAL / cron-relay invoked ---
  "auth-lockout-email"            # INTERNAL — invoked by auth flow
  "ga4-stats-sync"                # INTERNAL — cron-relay tick
  "notification-webhook-dispatcher" # INTERNAL — cron-relay tick
  "payment-overdue-runner"        # INTERNAL — cron-relay tick
  "quick-backup-runner"           # ADMIN_ONLY
  "quick-restore-runner"          # ADMIN_ONLY
  "sales-route-dispatcher"        # INTERNAL — cron-relay tick
  "sales-route-preview"           # CLIENT_AUTH_IN_CODE
  "sheets-advanced-export"        # CLIENT_AUTH_IN_CODE / admin
  "sheets-batch-export"           # CLIENT_AUTH_IN_CODE / admin
  "sheets-export-dispatcher"      # INTERNAL — cron-relay tick
  "sheets-export-slo-check"       # INTERNAL — cron-relay tick
  "sheets-reconciliation"         # INTERNAL — cron-relay tick
  "siem-exporter"                 # INTERNAL — cron-relay tick + HMAC outbound
  "ticket-escalation-runner"      # INTERNAL — cron-relay tick
  "verify-critical-triggers"      # INTERNAL — cron-relay tick
  "webhook-dispatcher"            # INTERNAL — cron-relay tick (NOT internet-facing despite the name)

  # --- AI: CLIENT_AUTH_IN_CODE + AI quota ---
  "parse-sale-document"           # CLIENT_AUTH_IN_CODE + AI quota

  # --- MCP: own auth layer (HMAC + internal-mtls) ---
  "mcp-gateway"                   # HMAC_PROTECTED — MCP HMAC + internal-mtls
  "mcp-server"                    # HMAC_PROTECTED — MCP HMAC + internal-mtls
  "trace-ingest"                  # HMAC_PROTECTED — internal-mtls signed (mcp-otel)

  # --- OAuth callbacks: CSRF-protected by oauth_sessions single-use token ---
  "google-oauth-callback"         # CSRF-protected by oauth_sessions
  "meta-oauth-callback"           # CSRF-protected by oauth_sessions
)

# Backlog — functions internet-facing that SHOULD eventually be wired.
# Listed here to emit a CI warning (not failure) instead of forcing exemption.
PUBLIC_WEBHOOKS_TODO=(
  "meta-leads-webhook"            # Public webhook, HMAC-verified — wire IP rate-limit Q3 2026
  "webhook-ingest"                # Public webhook, HMAC + idempotency — wire IP rate-limit Q3 2026
)

# Extract list of functions with verify_jwt = false from config.toml
mapfile -t ALL_VERIFY_FALSE < <(
  awk '
    /^[[:space:]]*\[functions\./ {
      gsub(/^[[:space:]]*\[functions\./, "")
      gsub(/\][[:space:]]*$/, "")
      current = $0
      next
    }
    /verify_jwt[[:space:]]*=[[:space:]]*false/ {
      if (current != "") print current
    }
  ' "$CONFIG" | sort -u
)

if [[ ${#ALL_VERIFY_FALSE[@]} -eq 0 ]]; then
  echo "::warning::H1 — no verify_jwt=false functions parsed from $CONFIG (parser broken?)"
  exit 0
fi

# Build associative set of exempt functions for O(1) lookup
declare -A EXEMPT
for fn in "${PUBLIC_WEBHOOKS_EXEMPT[@]}"; do
  EXEMPT["$fn"]=1
done

declare -A TODO_SET
for fn in "${PUBLIC_WEBHOOKS_TODO[@]}"; do
  TODO_SET["$fn"]=1
done

FAILED=0
WIRED_COUNT=0
EXEMPT_COUNT=0
MISSING=()

for fn in "${ALL_VERIFY_FALSE[@]}"; do
  f="supabase/functions/${fn}/index.ts"
  if [[ ! -f "$f" ]]; then
    continue
  fi

  if grep -qE "ip-rate-limit|consume_ip_rate_limit|checkIpRateLimit" "$f"; then
    WIRED_COUNT=$((WIRED_COUNT + 1))
    continue
  fi

  if [[ -n "${TODO_SET[$fn]:-}" ]]; then
    echo "::warning::H1 TODO — ${fn} still lacks IP rate-limit (tracked backlog)."
    continue
  fi

  if [[ -n "${EXEMPT[$fn]:-}" ]]; then
    EXEMPT_COUNT=$((EXEMPT_COUNT + 1))
    continue
  fi

  MISSING+=("$fn")
  FAILED=1
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "::error::H1 — the following verify_jwt=false edge functions are missing IP rate-limit AND are not in PUBLIC_WEBHOOKS_EXEMPT:"
  for fn in "${MISSING[@]}"; do
    echo "::error::  - ${fn}"
  done
  echo ""
  echo "Action required (pick one):"
  echo "  1. Wire _shared/ip-rate-limit.ts at the top of the handler (preferred for internet-facing webhooks)."
  echo "  2. If the function is NOT internet-facing (internal/admin/HMAC-protected), add it to"
  echo "     PUBLIC_WEBHOOKS_EXEMPT in scripts/ci/check-public-webhooks-ratelimit.sh with a one-line reason."
  echo ""
  echo "See mem://features/h1-ip-rate-limit-public-webhooks and docs/security-review-playbook.md §H1."
fi

if [[ $FAILED -ne 0 ]]; then
  exit 1
fi

echo "H1 OK — ${WIRED_COUNT} wired, ${EXEMPT_COUNT} explicitly exempt, 0 unaccounted."
