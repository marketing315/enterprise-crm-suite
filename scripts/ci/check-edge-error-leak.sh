#!/usr/bin/env bash
# H6 CI guard — baseline counter for raw `error: <x>.message` leaks in
# edge function responses. Fails if the count INCREASES vs the baseline
# snapshot. Existing offenders are tech-debt tracked separately (audit Q2).
#
# To intentionally raise the baseline (after a real cleanup PR REDUCES
# the count), regenerate scripts/ci/.h6-baseline with:
#   bash scripts/ci/check-edge-error-leak.sh --update-baseline
#
# Use safeErrorResponse(err) from _shared/safe-error-response.ts in new code.
# See mem://technical/h6-safe-error-response.

set -euo pipefail

BASELINE_FILE="scripts/ci/.h6-baseline"

count_violations() {
  grep -rnE "JSON\.stringify\([^)]*error:\s*[A-Za-z_][A-Za-z0-9_]*\.message" \
    supabase/functions/ --include="*.ts" 2>/dev/null \
    | grep -v "_shared/safe-error-response.ts" \
    | wc -l | tr -d ' '
}

CURRENT=$(count_violations)

if [[ "${1:-}" == "--update-baseline" ]]; then
  echo "$CURRENT" > "$BASELINE_FILE"
  echo "H6 baseline updated to $CURRENT."
  exit 0
fi

if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "$CURRENT" > "$BASELINE_FILE"
  echo "H6 baseline initialized at $CURRENT (first run)."
  exit 0
fi

BASELINE=$(cat "$BASELINE_FILE")

if (( CURRENT > BASELINE )); then
  echo "::error::H6 REGRESSION — raw error.message in edge responses went from ${BASELINE} to ${CURRENT}."
  echo "New offenders must use safeErrorResponse(err) from _shared/safe-error-response.ts."
  echo ""
  echo "Current offenders:"
  grep -rnE "JSON\.stringify\([^)]*error:\s*[A-Za-z_][A-Za-z0-9_]*\.message" \
    supabase/functions/ --include="*.ts" \
    | grep -v "_shared/safe-error-response.ts"
  exit 1
fi

if (( CURRENT < BASELINE )); then
  echo "H6 IMPROVED — count dropped from ${BASELINE} to ${CURRENT}. Run with --update-baseline to lock in."
  exit 0
fi

echo "H6 OK — count stable at ${CURRENT} (baseline ${BASELINE})."
