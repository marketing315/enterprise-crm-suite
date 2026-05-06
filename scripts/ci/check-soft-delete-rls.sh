#!/usr/bin/env bash
# H4 — Verifica che le policy SELECT delle tabelle soft-delete contengano
# il predicato che esclude i record archiviati / mergiati / soft-deleted.
#
# Richiede: PGHOST/PGUSER/PGPASSWORD/PGDATABASE oppure SUPABASE_DB_URL.
# Se nessuno è disponibile, esce 0 (skip) — il gate vero gira in CI con creds.
set -euo pipefail

if [[ -z "${PGHOST:-}" && -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "[check-soft-delete-rls] skip: no DB credentials in env"
  exit 0
fi

PSQL=(psql -At -v ON_ERROR_STOP=1)
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  PSQL+=("$SUPABASE_DB_URL")
fi

# table | required predicate (regex, case-insensitive)
declare -A REQUIRED=(
  ["contacts"]="merged_into_contact_id[[:space:]]+is[[:space:]]+null"
  ["lead_events"]="archived[[:space:]]*=[[:space:]]*false|archived[[:space:]]+is[[:space:]]+not[[:space:]]+true"
  ["tickets"]="archived[[:space:]]*=[[:space:]]*false|archived[[:space:]]+is[[:space:]]+not[[:space:]]+true"
  ["chat_threads"]="archived_at[[:space:]]+is[[:space:]]+null"
  ["chat_messages"]="deleted_at[[:space:]]+is[[:space:]]+null"
)

fail=0
for tbl in "${!REQUIRED[@]}"; do
  pat="${REQUIRED[$tbl]}"
  # Get all SELECT policies on that table
  rows=$("${PSQL[@]}" -c "SELECT policyname || E'\t' || COALESCE(qual,'') FROM pg_policies WHERE schemaname='public' AND tablename='$tbl' AND cmd='SELECT';")
  if [[ -z "$rows" ]]; then
    echo "[check-soft-delete-rls] WARN: no SELECT policy on public.$tbl"
    continue
  fi
  while IFS=$'\t' read -r polname qual; do
    [[ -z "$polname" ]] && continue
    if ! echo "$qual" | grep -Eiq "$pat"; then
      echo "[check-soft-delete-rls] FAIL: policy '$polname' on public.$tbl missing soft-delete predicate (/$pat/)"
      echo "  qual: $qual"
      fail=1
    fi
  done <<< "$rows"
done

if [[ "$fail" -ne 0 ]]; then
  echo "[check-soft-delete-rls] H4 gate FAILED — see above"
  exit 1
fi
echo "[check-soft-delete-rls] OK — all soft-delete tables enforce filter at RLS level"
