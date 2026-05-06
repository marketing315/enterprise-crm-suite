#!/usr/bin/env bash
# H8 end-to-end test runner.
# Requires PG* env vars (PGHOST, PGUSER, PGPASSWORD, PGDATABASE) set to a
# Supabase project where migration 20260505164919 (H8) has been applied.
#
# Usage:  bash scripts/tests/h8-idempotency-e2e.sh
# Exits non-zero on any assertion failure.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[h8-e2e] Running idempotency contract tests…"
psql -v ON_ERROR_STOP=1 -f "${SCRIPT_DIR}/h8-idempotency-e2e.sql"
echo "[h8-e2e] OK"
