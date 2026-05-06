#!/usr/bin/env bash
# H1 CI guard — every public webhook in the wired allowlist MUST keep
# importing _shared/ip-rate-limit.ts. New public webhooks added after this
# guard SHOULD be appended to PUBLIC_WEBHOOKS_WIRED below.
#
# PUBLIC_WEBHOOKS_TODO is a known backlog of public webhooks that still
# need rate-limit wiring (tracked separately). Adding to this list is
# discouraged; removing requires wiring the function first.
#
# See mem://features/h1-ip-rate-limit-public-webhooks.

set -euo pipefail

# Already wired — guard fails if the import disappears.
PUBLIC_WEBHOOKS_WIRED=(
  "keplero-webhook"
  "voispeed-events-webhook"
  "health-check"
  "preview-transactional-email"
)

# Backlog (not yet wired). New entries here trigger a CI warning, not a failure.
PUBLIC_WEBHOOKS_TODO=(
  "meta-leads-webhook"
  "google-forms-webhook"
  "webhook-ingest"
  "webhook-dispatcher"
)

FAILED=0
for fn in "${PUBLIC_WEBHOOKS_WIRED[@]}"; do
  f="supabase/functions/${fn}/index.ts"
  if [[ ! -f "$f" ]]; then
    echo "::error::H1 — wired webhook '${fn}' missing at ${f}"
    FAILED=1
    continue
  fi
  if ! grep -qE "ip-rate-limit|consume_ip_rate_limit|checkIpRateLimit" "$f"; then
    echo "::error::H1 REGRESSION — ${fn} lost its IP rate-limit import. Restore _shared/ip-rate-limit.ts."
    FAILED=1
  fi
done

for fn in "${PUBLIC_WEBHOOKS_TODO[@]}"; do
  f="supabase/functions/${fn}/index.ts"
  [[ -f "$f" ]] || continue
  if ! grep -qE "ip-rate-limit|consume_ip_rate_limit|checkIpRateLimit" "$f"; then
    echo "::warning::H1 TODO — ${fn} still lacks IP rate-limit (tracked backlog)."
  fi
done

if [[ $FAILED -ne 0 ]]; then
  echo "H1 guard failed. See mem://features/h1-ip-rate-limit-public-webhooks."
  exit 1
fi

echo "H1 OK — all wired public webhooks keep IP rate-limit import."
