#!/usr/bin/env bash
# DR Drill — Edge Functions Failover
# Verifica che il degraded mode si attivi correttamente quando le edge sono indisponibili.

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

if [[ "${VITE_SUPABASE_URL:-}" != *"e2e"* && "${VITE_SUPABASE_URL:-}" != *"sandbox"* ]]; then
  echo "❌ SAFETY: questo drill modifica system_settings. SOLO sandbox."
  exit 1
fi

echo "🧪 DR Drill: Edge Functions Failover"
echo ""

echo "1️⃣  Health-check edge functions baseline..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" \
  "$VITE_SUPABASE_URL/functions/v1/health-check" \
  -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY" || echo "000")
echo "   Health pre-drill: $HEALTH"

echo ""
echo "2️⃣  Attivazione queue-only mode..."
psql "$DATABASE_URL" <<SQL
INSERT INTO public.system_settings (key, value)
VALUES ('webhook_queue_only_mode', jsonb_build_object('enabled', true, 'reason', 'dr_drill'))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.system_settings (key, value)
VALUES ('system_banner', jsonb_build_object(
  'enabled', true,
  'message', '[DRILL] Servizio in modalità degradata',
  'level', 'warning'
))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
SQL
echo "   ✅ Banner + queue-only mode attivati"

echo ""
echo "3️⃣  Invio webhook di test in queue-only mode..."
DRILL_ID="dr-drill-$(date +%s)"
RESPONSE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$VITE_SUPABASE_URL/functions/v1/webhook-ingest?source=drill&api_key=test" \
  -H "Content-Type: application/json" \
  -d "{\"drill_id\": \"$DRILL_ID\"}")
echo "   Risposta webhook: HTTP $RESPONSE_CODE (atteso 202)"

QUEUED=$(psql "$DATABASE_URL" -At -c \
  "SELECT count(*) FROM public.incoming_requests WHERE raw_body->>'drill_id' = '$DRILL_ID';")
if [[ "$QUEUED" -eq 1 ]]; then
  echo "   ✅ Payload accodato correttamente in incoming_requests"
else
  echo "   ❌ Payload NON accodato (atteso 1, trovato $QUEUED)"
fi

echo ""
echo "4️⃣  Verifica che il banner sia visibile via API system_settings..."
BANNER=$(psql "$DATABASE_URL" -At -c \
  "SELECT value->>'enabled' FROM public.system_settings WHERE key='system_banner';")
echo "   Banner enabled: $BANNER (atteso: true)"

echo ""
echo "5️⃣  Simulazione recovery: disattivazione degraded mode..."
psql "$DATABASE_URL" <<SQL
UPDATE public.system_settings
SET value = jsonb_build_object('enabled', false)
WHERE key IN ('webhook_queue_only_mode', 'system_banner');
SQL
echo "   ✅ Modalità normale ripristinata"

echo ""
echo "6️⃣  Cleanup fixture..."
psql "$DATABASE_URL" -c "DELETE FROM public.incoming_requests WHERE payload->>'drill_id' = '$DRILL_ID';" >/dev/null

echo ""
if [[ "$RESPONSE_CODE" == "202" && "$QUEUED" -eq 1 && "$BANNER" == "true" ]]; then
  echo "✅ EDGE FAILOVER DRILL PASSED"
  exit 0
else
  echo "❌ EDGE FAILOVER DRILL FAILED"
  echo "   webhook 202: $RESPONSE_CODE"
  echo "   queued: $QUEUED"
  echo "   banner: $BANNER"
  exit 2
fi
