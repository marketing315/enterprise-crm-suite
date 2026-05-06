#!/usr/bin/env bash
# H1 CI guard — every public edge function (verify_jwt = false AND in the
# explicit public-webhook allowlist) MUST import _shared/ip-rate-limit.ts
# (which exposes checkIpRateLimit / consume_ip_rate_limit).
#
# When you ship a NEW public webhook, add it to PUBLIC_WEBHOOKS below.
# See mem://features/h1-ip-rate-limit-public-webhooks.

set -euo pipefail

PUBLIC_WEBHOOKS=(
  "keplero-webhook"
  "voispeed-events-webhook"
  "health-check"
  "preview-transactional-email"
  "meta-leads-webhook"
  "google-forms-webhook"
  "webhook-ingest"
  "webhook-dispatcher"
)

FAILED=0
for fn in "${PUBLIC_WEBHOOKS[@]}"; do
  f="supabase/functions/${fn}/index.ts"
  if [[ ! -f "$f" ]]; then
    echo "::warning::H1 — public webhook '${fn}' listed but ${f} not found (skip)"
    continue
  fi
  if ! grep -qE "ip-rate-limit|consume_ip_rate_limit|checkIpRateLimit" "$f"; then
    echo "::error::H1 — ${fn} is a public webhook but does NOT import _shared/ip-rate-limit.ts (or call consume_ip_rate_limit). Add IP rate limiting as the first line of the handler."
    FAILED=1
  fi
done

if [[ $FAILED -ne 0 ]]; then
  echo ""
  echo "H1 guard failed. See mem://features/h1-ip-rate-limit-public-webhooks."
  exit 1
fi

echo "H1 OK — all ${#PUBLIC_WEBHOOKS[@]} public webhooks have IP rate-limit wired."
