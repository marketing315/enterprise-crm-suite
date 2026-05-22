
-- F5.5 — Alert performance configurabili (CPL, answer-rate, deliveries, sentiment)
-- Additivo: nuove tabelle, nessuna modifica a esistenti.

-- ─────────────────────────── Tabelle ───────────────────────────

CREATE TABLE IF NOT EXISTS public.performance_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  name text NOT NULL,
  metric text NOT NULL,
  -- comparator: gt | lt
  comparator text NOT NULL DEFAULT 'gt',
  threshold numeric NOT NULL,
  -- finestra di valutazione in giorni (default 7)
  window_days integer NOT NULL DEFAULT 7,
  -- shape: { category?, channel_id?, campaign_id?, group_id?, tracking_number_id? }
  source_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'warning',
  is_active boolean NOT NULL DEFAULT true,
  -- dedup: non riemetti lo stesso alert prima di N minuti
  cooldown_minutes integer NOT NULL DEFAULT 60,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_par_metric CHECK (metric IN ('cpl','answer_rate','deliveries_pct','negative_sentiment_pct')),
  CONSTRAINT chk_par_comparator CHECK (comparator IN ('gt','lt')),
  CONSTRAINT chk_par_severity CHECK (severity IN ('info','warning','critical')),
  CONSTRAINT chk_par_window CHECK (window_days BETWEEN 1 AND 90),
  CONSTRAINT chk_par_cooldown CHECK (cooldown_minutes BETWEEN 5 AND 1440)
);

CREATE INDEX IF NOT EXISTS idx_par_brand_active
  ON public.performance_alert_rules(brand_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.performance_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.performance_alert_rules(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  metric text NOT NULL,
  observed_value numeric NOT NULL,
  threshold numeric NOT NULL,
  comparator text NOT NULL,
  severity text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  fired_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid
);

CREATE INDEX IF NOT EXISTS idx_pae_brand_fired ON public.performance_alert_events(brand_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_pae_rule_fired ON public.performance_alert_events(rule_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_pae_unack ON public.performance_alert_events(brand_id, fired_at DESC) WHERE acknowledged_at IS NULL;

-- ─────────────────────────── Trigger updated_at ───────────────────────────

CREATE OR REPLACE FUNCTION public.tg_par_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_par_updated_at ON public.performance_alert_rules;
CREATE TRIGGER trg_par_updated_at BEFORE UPDATE ON public.performance_alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_par_set_updated_at();

-- ─────────────────────────── RLS ───────────────────────────

ALTER TABLE public.performance_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_alert_events ENABLE ROW LEVEL SECURITY;

-- Rules: finance access (CEO/Admin/Amministrazione) sul brand
DROP POLICY IF EXISTS par_read ON public.performance_alert_rules;
CREATE POLICY par_read ON public.performance_alert_rules FOR SELECT TO authenticated
  USING (has_finance_access(get_user_id(auth.uid()), brand_id));

DROP POLICY IF EXISTS par_write ON public.performance_alert_rules;
CREATE POLICY par_write ON public.performance_alert_rules FOR ALL TO authenticated
  USING (has_finance_access(get_user_id(auth.uid()), brand_id))
  WITH CHECK (has_finance_access(get_user_id(auth.uid()), brand_id));

-- Events: lettura finance, ACK admin/CEO, insert solo service_role
DROP POLICY IF EXISTS pae_read ON public.performance_alert_events;
CREATE POLICY pae_read ON public.performance_alert_events FOR SELECT TO authenticated
  USING (has_finance_access(get_user_id(auth.uid()), brand_id));

DROP POLICY IF EXISTS pae_ack ON public.performance_alert_events;
CREATE POLICY pae_ack ON public.performance_alert_events FOR UPDATE TO authenticated
  USING (
    has_role(get_user_id(auth.uid()), 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  )
  WITH CHECK (
    has_role(get_user_id(auth.uid()), 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  );

DROP POLICY IF EXISTS pae_service_insert ON public.performance_alert_events;
CREATE POLICY pae_service_insert ON public.performance_alert_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ─────────────────────────── RPC evaluate ───────────────────────────
-- SECURITY DEFINER: valuta tutte le regole attive di un brand e inserisce
-- gli eventi che superano la soglia rispettando il cooldown. Restituisce
-- l'elenco degli eventi appena creati. Chiamata dall'edge evaluator.

CREATE OR REPLACE FUNCTION public.evaluate_performance_alerts(p_brand_id uuid)
RETURNS TABLE (
  event_id uuid,
  rule_id uuid,
  rule_name text,
  metric text,
  observed_value numeric,
  threshold numeric,
  severity text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule record;
  v_from timestamptz;
  v_to timestamptz := now();
  v_observed numeric;
  v_fires boolean;
  v_last_fired timestamptz;
  v_event_id uuid;
  v_details jsonb;
BEGIN
  FOR v_rule IN
    SELECT * FROM public.performance_alert_rules
    WHERE brand_id = p_brand_id AND is_active = true
  LOOP
    v_from := v_to - (v_rule.window_days || ' days')::interval;
    v_observed := NULL;
    v_details := jsonb_build_object('window_days', v_rule.window_days);

    -- ── CPL (cost per lead, EUR) ──
    IF v_rule.metric = 'cpl' THEN
      WITH ch AS (
        SELECT * FROM public.get_channel_performance(
          p_brand_id,
          v_from::date,
          v_to::date,
          COALESCE(v_rule.source_filter, '{}'::jsonb)
        )
      )
      SELECT CASE WHEN SUM(leads_count) > 0
        THEN SUM(spend) / NULLIF(SUM(leads_count), 0)
        ELSE NULL END
      INTO v_observed FROM ch;

    -- ── Answer rate (%) chiamate operatori ──
    ELSIF v_rule.metric = 'answer_rate' THEN
      WITH op AS (
        SELECT * FROM public.get_operator_kpis(p_brand_id, v_from, v_to)
      )
      SELECT CASE WHEN SUM(total_calls) > 0
        THEN (SUM(answered_calls)::numeric * 100.0) / NULLIF(SUM(total_calls), 0)
        ELSE NULL END
      INTO v_observed FROM op;

    -- ── % consegne su ordini ──
    ELSIF v_rule.metric = 'deliveries_pct' THEN
      SELECT CASE WHEN COUNT(*) FILTER (WHERE lifecycle_status IN ('won','order_signed','delivered','delivered_paid')) > 0
        THEN (COUNT(*) FILTER (WHERE lifecycle_status IN ('delivered','delivered_paid'))::numeric * 100.0)
             / NULLIF(COUNT(*) FILTER (WHERE lifecycle_status IN ('won','order_signed','delivered','delivered_paid')), 0)
        ELSE NULL END
      INTO v_observed
      FROM public.sales_orders
      WHERE brand_id = p_brand_id
        AND created_at >= v_from AND created_at < v_to;

    -- ── % chiamate con sentiment negativo (score < -0.3) ──
    ELSIF v_rule.metric = 'negative_sentiment_pct' THEN
      SELECT CASE WHEN COUNT(*) FILTER (WHERE sentiment_score IS NOT NULL) > 0
        THEN (COUNT(*) FILTER (WHERE sentiment_score < -0.3)::numeric * 100.0)
             / NULLIF(COUNT(*) FILTER (WHERE sentiment_score IS NOT NULL), 0)
        ELSE NULL END
      INTO v_observed
      FROM public.call_transcripts
      WHERE brand_id = p_brand_id
        AND created_at >= v_from AND created_at < v_to;
    END IF;

    IF v_observed IS NULL THEN CONTINUE; END IF;

    v_fires := CASE v_rule.comparator
      WHEN 'gt' THEN v_observed > v_rule.threshold
      WHEN 'lt' THEN v_observed < v_rule.threshold
      ELSE false END;

    IF NOT v_fires THEN CONTINUE; END IF;

    -- Cooldown: skip se ultimo evento per la regola entro N minuti
    SELECT MAX(fired_at) INTO v_last_fired
    FROM public.performance_alert_events
    WHERE rule_id = v_rule.id;

    IF v_last_fired IS NOT NULL
       AND v_last_fired > now() - (v_rule.cooldown_minutes || ' minutes')::interval
    THEN CONTINUE; END IF;

    INSERT INTO public.performance_alert_events (
      rule_id, brand_id, metric, observed_value, threshold,
      comparator, severity, window_start, window_end, details
    ) VALUES (
      v_rule.id, p_brand_id, v_rule.metric, v_observed, v_rule.threshold,
      v_rule.comparator, v_rule.severity, v_from, v_to,
      v_details || jsonb_build_object('rule_name', v_rule.name, 'source_filter', v_rule.source_filter)
    )
    RETURNING id INTO v_event_id;

    event_id := v_event_id;
    rule_id := v_rule.id;
    rule_name := v_rule.name;
    metric := v_rule.metric;
    observed_value := v_observed;
    threshold := v_rule.threshold;
    severity := v_rule.severity;
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.evaluate_performance_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_performance_alerts(uuid) TO authenticated, service_role;
