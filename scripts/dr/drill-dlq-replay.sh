#!/usr/bin/env bash
# DR Drill — DLQ Mass Replay
# Verifica end-to-end la procedura di replay massivo della DLQ in sandbox.
# REQUISITI: deve girare contro .env.e2e (sandbox), MAI in produzione.
#
# Schema reale di public.incoming_requests (al 2026-05-05):
#   id uuid PK, source_id uuid, brand_id uuid, raw_body jsonb, raw_body_text text,
#   headers jsonb, ip_address text, user_agent text, processed bool NOT NULL,
#   error_message text, lead_event_id uuid, created_at timestamptz NOT NULL,
#   status (enum: pending|success|failed|rejected), dlq_reason (enum nullable),
#   correlation_id text
#
# NOTA: lo script seed marca i record drill via correlation_id='dr-drill-<ts>'
# (non esiste colonna `source` text né `received_at`/`error_class`/`attempt_count`).

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

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL non impostato in $ENV_FILE."
  exit 1
fi

echo "🧪 DR Drill: DLQ Mass Replay"
echo "   Sandbox: $VITE_SUPABASE_URL"
echo ""

# 0. Schema sanity check — fail-fast se la tabella è cambiata
echo "0️⃣  Schema sanity check su public.incoming_requests..."
REQUIRED_COLS=(id source_id brand_id raw_body status dlq_reason error_message processed created_at correlation_id)
for col in "${REQUIRED_COLS[@]}"; do
  EXISTS=$(psql "$DATABASE_URL" -At -c \
    "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='incoming_requests' AND column_name='$col';")
  if [[ "$EXISTS" != "1" ]]; then
    echo "   ❌ Colonna mancante: incoming_requests.$col — abort drill (schema drift)."
    exit 3
  fi
done
echo "   ✅ Schema OK"

FIXTURE_COUNT="${FIXTURE_COUNT:-100}"
DRILL_TAG="dr-drill-$(date +%s)"

# 1. Seed — usa il primo webhook source disponibile in sandbox per soddisfare la FK
SOURCE_ID=$(psql "$DATABASE_URL" -At -c \
  "SELECT id FROM public.webhook_sources ORDER BY created_at LIMIT 1;")
if [[ -z "$SOURCE_ID" ]]; then
  echo "   ❌ Nessuna webhook_source presente in sandbox: impossibile seedare. Crea almeno una source di test."
  exit 4
fi
BRAND_ID=$(psql "$DATABASE_URL" -At -c \
  "SELECT brand_id FROM public.webhook_sources WHERE id='$SOURCE_ID';")

echo ""
echo "1️⃣  Seed di $FIXTURE_COUNT record falliti (correlation_id=$DRILL_TAG)..."
psql "$DATABASE_URL" >/dev/null <<SQL
INSERT INTO public.incoming_requests
  (source_id, brand_id, raw_body, status, dlq_reason, error_message, processed, correlation_id, created_at)
SELECT
  '$SOURCE_ID'::uuid,
  '$BRAND_ID'::uuid,
  jsonb_build_object('drill_id', gen_random_uuid(), 'index', i),
  'failed'::incoming_request_status,
  'mapping_error'::incoming_request_dlq_reason,
  'simulated failure for DR drill',
  false,
  '$DRILL_TAG',
  now() - (random() * interval '1 hour')
FROM generate_series(1, $FIXTURE_COUNT) AS i;
SQL

INITIAL=$(psql "$DATABASE_URL" -At -c \
  "SELECT count(*) FROM public.incoming_requests WHERE correlation_id='$DRILL_TAG' AND status='failed';")
echo "   ✅ Seed OK — $INITIAL record falliti"

# 2. Replay — simula il batch replay resettando lo status a 'pending'
#    (mirror dell'RPC public.replay_ingest_dlq, eseguito massivo in sandbox)
echo ""
echo "2️⃣  Simulazione replay batch (reset status->pending, dlq_reason->NULL)..."
START=$(date +%s)
REPLAYED=$(psql "$DATABASE_URL" -At <<SQL
WITH upd AS (
  UPDATE public.incoming_requests
     SET status = 'pending'::incoming_request_status,
         dlq_reason = NULL,
         error_message = NULL,
         processed = false
   WHERE correlation_id = '$DRILL_TAG'
     AND status = 'failed'
  RETURNING 1
)
SELECT count(*) FROM upd;
SQL
)
END=$(date +%s)
ELAPSED=$((END - START))
echo "   ⏱  Tempo: ${ELAPSED}s"
echo "   📋 Replayed (reset to pending): $REPLAYED"

# 3. Validazione finale
echo ""
echo "3️⃣  Validazione finale..."
REMAINING=$(psql "$DATABASE_URL" -At -c \
  "SELECT count(*) FROM public.incoming_requests WHERE correlation_id='$DRILL_TAG' AND status='failed';")
PENDING=$(psql "$DATABASE_URL" -At -c \
  "SELECT count(*) FROM public.incoming_requests WHERE correlation_id='$DRILL_TAG' AND status='pending';")
SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($REPLAYED/$INITIAL)*100}")

echo "   Iniziali falliti: $INITIAL"
echo "   Rimanenti falliti: $REMAINING"
echo "   In pending dopo replay: $PENDING"
echo "   Success rate: $SUCCESS_RATE%"

# 4. Cleanup
echo ""
echo "4️⃣  Cleanup fixture (correlation_id=$DRILL_TAG)..."
psql "$DATABASE_URL" -c \
  "DELETE FROM public.incoming_requests WHERE correlation_id='$DRILL_TAG';" >/dev/null

echo ""
if (( $(echo "$SUCCESS_RATE >= 95" | bc -l) )); then
  echo "✅ DRILL PASSED — success rate $SUCCESS_RATE% (target ≥95%)"
  exit 0
else
  echo "❌ DRILL FAILED — success rate $SUCCESS_RATE% (target ≥95%)"
  exit 2
fi
