#!/usr/bin/env bash
# DR Drill — DLQ Mass Replay
# Verifica end-to-end la procedura di replay massivo della DLQ in sandbox.
# REQUISITI: deve girare contro .env.e2e (sandbox), MAI in produzione.

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.e2e}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE non trovato. Questo drill DEVE girare in sandbox."
  exit 1
fi

# Carica variabili sandbox
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ "${VITE_SUPABASE_URL:-}" == *"prod"* ]] || [[ "${VITE_SUPABASE_URL:-}" != *"e2e"* && "${VITE_SUPABASE_URL:-}" != *"sandbox"* ]]; then
  echo "❌ SAFETY CHECK: VITE_SUPABASE_URL non sembra una sandbox. Abort."
  exit 1
fi

echo "🧪 DR Drill: DLQ Mass Replay"
echo "   Sandbox: $VITE_SUPABASE_URL"
echo ""

FIXTURE_COUNT="${FIXTURE_COUNT:-100}"
SOURCE_TAG="dr-drill-$(date +%s)"

echo "1️⃣  Seed di $FIXTURE_COUNT payload falliti con source='$SOURCE_TAG'..."
psql "$DATABASE_URL" <<SQL
INSERT INTO public.incoming_requests (source, payload, status, error_class, error_message, attempt_count, received_at)
SELECT
  '$SOURCE_TAG',
  jsonb_build_object('drill_id', gen_random_uuid(), 'index', i),
  'failed',
  'drill_simulated',
  'simulated failure for DR drill',
  1,
  now() - (random() * interval '1 hour')
FROM generate_series(1, $FIXTURE_COUNT) AS i;
SQL

INITIAL=$(psql "$DATABASE_URL" -At -c \
  "SELECT count(*) FROM public.incoming_requests WHERE source='$SOURCE_TAG' AND status='failed';")
echo "   ✅ Seed OK — $INITIAL record falliti"

echo ""
echo "2️⃣  Simulazione replay (chiamata edge function dlq-batch-replay)..."
START=$(date +%s)
RESPONSE=$(curl -sS -X POST \
  "$VITE_SUPABASE_URL/functions/v1/dlq-batch-replay" \
  -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"source\": \"$SOURCE_TAG\", \"limit\": $FIXTURE_COUNT, \"dry_run\": false}")
END=$(date +%s)
ELAPSED=$((END - START))

echo "   ⏱  Tempo: ${ELAPSED}s"
echo "   📋 Risposta: $RESPONSE"

echo ""
echo "3️⃣  Validazione finale..."
REMAINING=$(psql "$DATABASE_URL" -At -c \
  "SELECT count(*) FROM public.incoming_requests WHERE source='$SOURCE_TAG' AND status='failed';")
REPLAYED=$((INITIAL - REMAINING))
SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($REPLAYED/$INITIAL)*100}")

echo "   Iniziali: $INITIAL"
echo "   Rimanenti falliti: $REMAINING"
echo "   Replayed: $REPLAYED ($SUCCESS_RATE%)"

echo ""
echo "4️⃣  Cleanup fixture..."
psql "$DATABASE_URL" -c "DELETE FROM public.incoming_requests WHERE source='$SOURCE_TAG';" >/dev/null

echo ""
if (( $(echo "$SUCCESS_RATE >= 95" | bc -l) )); then
  echo "✅ DRILL PASSED — success rate $SUCCESS_RATE% (target ≥95%)"
  exit 0
else
  echo "❌ DRILL FAILED — success rate $SUCCESS_RATE% (target ≥95%)"
  exit 2
fi
