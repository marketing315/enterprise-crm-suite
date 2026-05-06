#!/usr/bin/env bash
# H6 CI guard — forbid raw `error: err.message` / `error: error.message`
# in edge function responses. Use safeErrorResponse() from
# _shared/safe-error-response.ts which redacts PII and yields a stable shape.
#
# Allowed: structured logging (console.error("...", err)), thrown Error,
# and the inside of safe-error-response.ts itself.
# See mem://technical/h6-safe-error-response.

set -euo pipefail

# Match `error: <something>.message` patterns inside JSON.stringify responses.
# Heuristic but cheap; whitelist the helper file itself.
HITS=$(grep -rnE \
  "JSON\.stringify\([^)]*error:\s*[A-Za-z_][A-Za-z0-9_]*\.message" \
  supabase/functions/ \
  --include="*.ts" \
  | grep -v "_shared/safe-error-response.ts" || true)

# Also catch the common shorthand `{ error: err.message }` near `new Response`
HITS2=$(grep -rnB2 -E "error:\s*(err|error|e)\.message" supabase/functions/ --include="*.ts" \
  | grep -E "new Response|return new Response" \
  | grep -v "_shared/safe-error-response.ts" || true)

if [[ -n "$HITS" || -n "$HITS2" ]]; then
  echo "::error::H6 — raw error.message leaked in edge response. Use safeErrorResponse(err) from _shared/safe-error-response.ts."
  [[ -n "$HITS" ]] && echo "$HITS"
  [[ -n "$HITS2" ]] && echo "$HITS2"
  exit 1
fi

echo "H6 OK — no raw error.message leaks in edge responses."
