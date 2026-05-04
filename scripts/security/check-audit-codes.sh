#!/usr/bin/env bash
# CI guard: prevent reintroducing inline audit-fix codes (Bxx/Hxx/Rxx) in source.
# History lives in docs/audit-history.md; new fixes should NOT be annotated with
# legacy ID codes inline — open a tracked ticket instead.
#
# Exempt:
#   - test / spec files (codes are valid as scenario descriptions)
#   - docs/ (this file plus audit-history.md document the codes by design)
#   - scripts/cleanup/strip-audit-codes.mjs (the cleaner itself documents the codes)
#
# Patterns matched (comments only):
#   // B07 fix: ...    // B07 FIX: ...    // SECURITY [B01]: ...
#   // R03: ...        (B01 fix) inline
set -euo pipefail

PATTERN='(\/\/.*\b[BHR][0-9]{1,3}\b.*[Ff][Ii][Xx])|(\/\/.*SECURITY\s*\[[BHR][0-9]{1,3}\])|(\/\/\s*[BHR][0-9]{1,3}\s*:)|(\([BHR][0-9]{1,3}\s+[Ff][Ii][Xx]\))'

# Run ripgrep, exclude tests/specs and the cleanup/doc files
HITS=$(rg -n --no-heading -P "$PATTERN" src/ supabase/functions/ \
  --glob '!**/*.test.*' \
  --glob '!**/*.spec.*' \
  --glob '!**/scripts/cleanup/**' \
  2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "❌ Inline audit-fix codes found (Bxx/Hxx/Rxx). Move history to docs/audit-history.md."
  echo ""
  echo "$HITS"
  echo ""
  echo "See docs/audit-history.md for the canonical audit trail."
  exit 1
fi

echo "✅ No inline audit-fix codes in source."
