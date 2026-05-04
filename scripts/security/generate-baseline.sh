#!/usr/bin/env bash
# generate-baseline.sh — rigenera supabase/baseline/{20260601_baseline.sql, policies-summary.md}
#
# Richiede in ambiente:
#   PGHOST, PGUSER, PGPASSWORD, PGPORT (default 5432), PGDATABASE (default postgres)
#
# In CI (.github/workflows/baseline-refresh.yml) le credenziali arrivano dai
# secrets BASELINE_DB_* (sola lettura su preview, MAI produzione).
#
# In locale: chiedere PGHOST/PGUSER/PGPASSWORD del proprio env preview.
#
# Comportamento:
#   1. pg_dump --schema-only --schema=public, esclusioni esplicite ridondanti
#      (anche se --schema=public è già selettivo).
#   2. Anti-leak: fallisce se trova INSERT su tabelle non in SEED_WHITELIST.
#   3. Genera policies-summary.md con conteggi e tabella per (table, command).
#   4. Aggiunge header esplicativo che marca il file come "documentation only".

set -euo pipefail

# ──────────────────────────────────────────────────────────────
# Whitelist seed: tabelle lookup il cui INSERT è ammesso nel dump.
# Vuota di default. Aggiungere SOLO per lookup table seedate (no PII).
# ──────────────────────────────────────────────────────────────
SEED_WHITELIST=(
  # esempio: pipeline_stages_default
  # esempio: app_role_metadata
)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/supabase/baseline"
OUT_SQL="$OUT_DIR/20260601_baseline.sql"
OUT_POLICIES="$OUT_DIR/policies-summary.md"
TMP_RAW="$(mktemp)"
trap 'rm -f "$TMP_RAW"' EXIT

mkdir -p "$OUT_DIR"

# ──────────────────────────────────────────────────────────────
# Sanity check env
# ──────────────────────────────────────────────────────────────
: "${PGHOST:?PGHOST non impostato — configura le credenziali del DB preview.}"
: "${PGUSER:?PGUSER non impostato.}"
: "${PGPASSWORD:?PGPASSWORD non impostato.}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-postgres}"
export PGHOST PGUSER PGPASSWORD PGPORT PGDATABASE

# ──────────────────────────────────────────────────────────────
# 1) pg_dump
# ──────────────────────────────────────────────────────────────
echo "→ pg_dump $PGHOST/$PGDATABASE (schema=public)…" >&2
pg_dump \
  --schema-only \
  --no-owner \
  --no-privileges \
  --no-comments \
  --schema=public \
  -h "$PGHOST" -U "$PGUSER" -p "$PGPORT" -d "$PGDATABASE" \
  > "$TMP_RAW"

LINES=$(wc -l < "$TMP_RAW")
echo "  baseline raw: $LINES linee" >&2

# ──────────────────────────────────────────────────────────────
# 2) Anti-leak: nessun INSERT che non sia in SEED_WHITELIST
# ──────────────────────────────────────────────────────────────
INSERT_COUNT=$(grep -cE "^INSERT INTO" "$TMP_RAW" || true)
if [ "$INSERT_COUNT" -gt 0 ]; then
  echo "→ Trovate $INSERT_COUNT righe INSERT — verifico whitelist…" >&2
  ILLEGAL=0
  while IFS= read -r line; do
    # estrae 'schema.table' dopo "INSERT INTO "
    target=$(echo "$line" | sed -E 's/^INSERT INTO ([a-zA-Z_."]+).*$/\1/' | tr -d '"' | sed 's/^public\.//')
    OK=0
    for allowed in "${SEED_WHITELIST[@]}"; do
      if [ "$target" = "$allowed" ]; then OK=1; break; fi
    done
    if [ "$OK" = "0" ]; then
      echo "  ❌ INSERT non whitelistato su tabella '$target'" >&2
      ILLEGAL=$((ILLEGAL + 1))
    fi
  done < <(grep -E "^INSERT INTO" "$TMP_RAW")
  if [ "$ILLEGAL" -gt 0 ]; then
    echo "❌ FAIL: $ILLEGAL INSERT non in whitelist. Aggiungi la tabella a SEED_WHITELIST" >&2
    echo "   in scripts/security/generate-baseline.sh con motivazione nel commit message." >&2
    exit 1
  fi
fi

# ──────────────────────────────────────────────────────────────
# 3) Header esplicativo + scrittura finale
# ──────────────────────────────────────────────────────────────
{
  echo "-- ============================================================"
  echo "-- BASELINE SOFT — schema 'public' snapshot"
  echo "-- ============================================================"
  echo "-- Auto-generato da: scripts/security/generate-baseline.sh"
  echo "-- Source: pg_dump --schema-only --no-owner --no-privileges --no-comments --schema=public"
  echo "-- Snapshot UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "--"
  echo "-- ⚠️  QUESTO FILE È SOLA DOCUMENTAZIONE."
  echo "-- - Non viene applicato dal CLI Supabase (incluso in .supabaseignore)."
  echo "-- - Lovable Cloud applica solo i file in supabase/migrations/."
  echo "-- - Modifiche manuali qui sono perse al prossimo refresh automatico"
  echo "--   (workflow .github/workflows/baseline-refresh.yml — lunedì 06:00 UTC)."
  echo "--"
  echo "-- Esclusioni: schema auth, storage, realtime, supabase_migrations,"
  echo "-- vault, graphql*, pgsodium*, net, extensions, cron, pg_catalog, information_schema."
  echo "-- Privileges/owner non inclusi (--no-privileges --no-owner)."
  echo "-- ============================================================"
  echo
  cat "$TMP_RAW"
} > "$OUT_SQL"

echo "✓ Scritto $OUT_SQL ($(wc -l < "$OUT_SQL") linee)" >&2

# ──────────────────────────────────────────────────────────────
# 4) policies-summary.md
# ──────────────────────────────────────────────────────────────
echo "→ Genero $OUT_POLICIES…" >&2

TOTAL=$(psql -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public';")
PERMISSIVE=$(psql -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (qual IN ('true','(true)','TRUE','(TRUE)') OR with_check IN ('true','(true)','TRUE','(TRUE)'));")
PERMISSIVE_NON_SR=$(psql -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (qual IN ('true','(true)','TRUE','(TRUE)') OR with_check IN ('true','(true)','TRUE','(TRUE)')) AND NOT ('service_role' = ANY(roles));")

{
  echo "# Public schema RLS policies — baseline summary"
  echo
  echo "_Auto-generato da \`scripts/security/generate-baseline.sh\` — non editare a mano._"
  echo
  echo "**Snapshot date (UTC):** $(date -u +%Y-%m-%d)"
  echo
  echo "## Numeri"
  echo
  echo "| Metric | Value |"
  echo "|---|---|"
  echo "| Total policy su \`public\` | $TOTAL |"
  echo "| Policy permissive (\`USING/WITH CHECK true\`) | $PERMISSIVE |"
  echo "| ⚠️ Permissive **non** \`service_role\` (Gate 2 violations) | $PERMISSIVE_NON_SR |"
  echo
  if [ "$PERMISSIVE_NON_SR" = "0" ]; then
    echo "✅ **Gate 2 baseline verde**: nessuna policy permissiva esposta a ruoli non-service. La whitelist Gate 2 nasce vuota."
  else
    echo "⚠️ **Attenzione**: $PERMISSIVE_NON_SR policy permissive sono esposte a ruoli non-service. Da rivedere prima di attivare Gate 2 in hard mode."
  fi
  echo
  echo "## Policy per (table, command)"
  echo
  echo "Mappa usata da Gate 3 (\`check-orphan-drop-policy.sh\`) per espandere \`FOR ALL\` e verificare la copertura post-drop."
  echo
  echo "| Table | Policy name | Cmd | Roles |"
  echo "|---|---|---|---|"
  psql -tAF$'\t' -c "
    SELECT tablename, policyname, cmd, array_to_string(roles, ',')
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  " | awk -F'\t' '{ printf "| `%s` | %s | %s | %s |\n", $1, $2, $3, $4 }'
  echo
  echo "## Policy permissive (audit GDPR/SOC2)"
  echo
  echo "| Table | Policy | Cmd | Roles |"
  echo "|---|---|---|---|"
  psql -tAF$'\t' -c "
    SELECT tablename, policyname, cmd, array_to_string(roles, ',')
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual IN ('true','(true)','TRUE','(TRUE)') OR with_check IN ('true','(true)','TRUE','(TRUE)'))
    ORDER BY tablename, policyname;
  " | awk -F'\t' '{ printf "| `%s` | %s | %s | %s |\n", $1, $2, $3, $4 }'
} > "$OUT_POLICIES"

echo "✓ Scritto $OUT_POLICIES ($(wc -l < "$OUT_POLICIES") linee)" >&2
echo "✓ Done." >&2
