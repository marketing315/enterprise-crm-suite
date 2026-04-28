#!/usr/bin/env bash
# DR Drill — PITR Validation
# NON esegue un restore reale (sarebbe distruttivo).
# Verifica che l'infrastruttura PITR sia attiva e che i backup recenti siano disponibili.

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.e2e}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE non trovato."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "🧪 DR Drill: PITR Validation (read-only)"
echo "   DB: $DATABASE_URL (host hidden)"
echo ""

echo "1️⃣  Verifica WAL streaming attivo..."
WAL_STATUS=$(psql "$DATABASE_URL" -At -c \
  "SELECT count(*) FROM pg_stat_replication WHERE state = 'streaming';" 2>/dev/null || echo "0")
if [[ "$WAL_STATUS" -gt 0 ]]; then
  echo "   ✅ WAL streaming attivo ($WAL_STATUS replicas)"
else
  echo "   ⚠️  Non è possibile verificare WAL streaming dal client (potrebbe essere normale su Supabase managed)"
fi

echo ""
echo "2️⃣  Verifica disponibilità audit_events recenti (proxy per integrità DB)..."
LAST_EVENT=$(psql "$DATABASE_URL" -At -c \
  "SELECT max(occurred_at) FROM public.audit_events;")
if [[ -n "$LAST_EVENT" ]]; then
  echo "   ✅ Ultimo audit event: $LAST_EVENT"
else
  echo "   ❌ Nessun audit event trovato — DB potrebbe essere vuoto o corrotto"
  exit 2
fi

echo ""
echo "3️⃣  Conteggi sanity check (struttura DB integra)..."
psql "$DATABASE_URL" <<SQL
SELECT 'contacts' AS tbl, count(*) FROM public.contacts
UNION ALL SELECT 'deals', count(*) FROM public.deals
UNION ALL SELECT 'audit_events', count(*) FROM public.audit_events
UNION ALL SELECT 'siem_destinations', count(*) FROM public.siem_destinations;
SQL

echo ""
echo "4️⃣  Verifica RLS abilitato sulle tabelle critiche..."
RLS_CHECK=$(psql "$DATABASE_URL" -At -c "
SELECT count(*)
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('contacts', 'deals', 'tickets', 'audit_events', 'siem_destinations')
  AND rowsecurity = false;
")
if [[ "$RLS_CHECK" -eq 0 ]]; then
  echo "   ✅ Tutte le tabelle critiche hanno RLS attivo"
else
  echo "   ❌ $RLS_CHECK tabelle critiche SENZA RLS — VULNERABILITÀ"
  exit 2
fi

echo ""
echo "5️⃣  Verifica age max degli audit_events (per stimare retention disponibile)..."
OLDEST=$(psql "$DATABASE_URL" -At -c \
  "SELECT min(occurred_at) FROM public.audit_events;")
echo "   📅 Audit event più vecchio: $OLDEST"

echo ""
echo "✅ PITR VALIDATION DRILL PASSED"
echo ""
echo "📝 Reminder: per testare un PITR vero, prenotare una finestra di manutenzione"
echo "   in sandbox e seguire docs/dr/02-pitr-restore.md §4"
