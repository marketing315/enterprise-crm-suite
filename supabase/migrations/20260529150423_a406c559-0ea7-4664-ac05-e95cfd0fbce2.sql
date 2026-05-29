
-- F6 Step #7 — VoiSpeed queue alert thresholds (SL/abandoned/wait/calls_waiting)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Regole alert per coda
CREATE TABLE public.voispeed_queue_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  queue_name text,
  metric text NOT NULL,
  comparator text NOT NULL DEFAULT 'gt',
  threshold numeric NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  cooldown_minutes integer NOT NULL DEFAULT 15,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_vqar_metric CHECK (metric IN ('calls_waiting','longest_wait_seconds','service_level_pct','abandoned_15m','agents_available')),
  CONSTRAINT chk_vqar_comparator CHECK (comparator IN ('gt','lt')),
  CONSTRAINT chk_vqar_severity CHECK (severity IN ('info','warning','critical')),
  CONSTRAINT chk_vqar_cooldown CHECK (cooldown_minutes BETWEEN 1 AND 1440)
);

CREATE INDEX idx_vqar_brand_active ON public.voispeed_queue_alert_rules(brand_id) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voispeed_queue_alert_rules TO authenticated;
GRANT ALL ON public.voispeed_queue_alert_rules TO service_role;

ALTER TABLE public.voispeed_queue_alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vqar_read" ON public.voispeed_queue_alert_rules
  FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "vqar_write" ON public.voispeed_queue_alert_rules
  FOR ALL TO authenticated
  USING (
    user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'ceo'::app_role)
      OR has_role(auth.uid(), 'responsabile_callcenter'::app_role)
    )
  )
  WITH CHECK (
    user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'ceo'::app_role)
      OR has_role(auth.uid(), 'responsabile_callcenter'::app_role)
    )
  );

CREATE OR REPLACE FUNCTION public.tg_vqar_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_vqar_updated_at
  BEFORE UPDATE ON public.voispeed_queue_alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_vqar_set_updated_at();

-- 2. Eventi alert (append-only)
CREATE TABLE public.voispeed_queue_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.voispeed_queue_alert_rules(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  queue_name text NOT NULL,
  metric text NOT NULL,
  comparator text NOT NULL,
  observed_value numeric NOT NULL,
  threshold numeric NOT NULL,
  severity text NOT NULL,
  fired_at timestamptz NOT NULL DEFAULT now(),
  snapshot_ts timestamptz
);

CREATE INDEX idx_vqae_brand_fired ON public.voispeed_queue_alert_events(brand_id, fired_at DESC);
CREATE INDEX idx_vqae_rule_fired ON public.voispeed_queue_alert_events(rule_id, fired_at DESC);

GRANT SELECT, INSERT ON public.voispeed_queue_alert_events TO authenticated;
GRANT ALL ON public.voispeed_queue_alert_events TO service_role;

ALTER TABLE public.voispeed_queue_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vqae_read" ON public.voispeed_queue_alert_events
  FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- 3. RPC evaluator
CREATE OR REPLACE FUNCTION public.evaluate_voispeed_queue_alerts(p_brand_id uuid)
RETURNS TABLE(
  event_id uuid,
  rule_id uuid,
  rule_name text,
  queue_name text,
  metric text,
  observed_value numeric,
  threshold numeric,
  severity text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rule record;
  v_stat record;
  v_observed numeric;
  v_fires boolean;
  v_last_fired timestamptz;
  v_event_id uuid;
  v_manager record;
  v_title text;
  v_body text;
BEGIN
  FOR v_rule IN
    SELECT * FROM public.voispeed_queue_alert_rules
    WHERE brand_id = p_brand_id AND is_active = true
  LOOP
    -- Per ogni coda candidata (latest snapshot ultimi 10 min)
    FOR v_stat IN
      SELECT DISTINCT ON (queue_name) *
      FROM public.voispeed_queue_stats
      WHERE brand_id = p_brand_id
        AND stat_ts >= now() - interval '10 minutes'
        AND (v_rule.queue_name IS NULL OR queue_name = v_rule.queue_name)
      ORDER BY queue_name, stat_ts DESC
    LOOP
      v_observed := CASE v_rule.metric
        WHEN 'calls_waiting' THEN v_stat.calls_waiting
        WHEN 'longest_wait_seconds' THEN v_stat.longest_wait_seconds
        WHEN 'service_level_pct' THEN v_stat.service_level_pct
        WHEN 'abandoned_15m' THEN v_stat.abandoned_15m
        WHEN 'agents_available' THEN v_stat.agents_available
      END;

      IF v_observed IS NULL THEN CONTINUE; END IF;

      v_fires := CASE v_rule.comparator
        WHEN 'gt' THEN v_observed > v_rule.threshold
        WHEN 'lt' THEN v_observed < v_rule.threshold
      END;

      IF NOT v_fires THEN CONTINUE; END IF;

      -- Cooldown per (rule, queue)
      SELECT MAX(fired_at) INTO v_last_fired
      FROM public.voispeed_queue_alert_events
      WHERE rule_id = v_rule.id
        AND queue_name = v_stat.queue_name;

      IF v_last_fired IS NOT NULL
         AND v_last_fired > now() - (v_rule.cooldown_minutes || ' minutes')::interval THEN
        CONTINUE;
      END IF;

      -- Insert event
      INSERT INTO public.voispeed_queue_alert_events(
        rule_id, brand_id, queue_name, metric, comparator,
        observed_value, threshold, severity, snapshot_ts
      ) VALUES (
        v_rule.id, p_brand_id, v_stat.queue_name, v_rule.metric, v_rule.comparator,
        v_observed, v_rule.threshold, v_rule.severity, v_stat.stat_ts
      ) RETURNING id INTO v_event_id;

      -- Notifiche ai responsabili del brand
      v_title := format('[%s] Coda %s · %s', upper(v_rule.severity), v_stat.queue_name, v_rule.name);
      v_body := format('%s = %s (soglia %s %s)', v_rule.metric, v_observed,
                       CASE v_rule.comparator WHEN 'gt' THEN '>' ELSE '<' END, v_rule.threshold);

      FOR v_manager IN
        SELECT DISTINCT ur.user_id
        FROM public.user_roles ur
        WHERE ur.role IN ('admin','ceo','responsabile_callcenter')
          AND (ur.brand_id IS NULL OR ur.brand_id = p_brand_id)
      LOOP
        INSERT INTO public.notifications(brand_id, user_id, type, title, body, entity_type, entity_id)
        VALUES (p_brand_id, v_manager.user_id, 'slo_alert', v_title, v_body,
                'voispeed_queue_alert_event', v_event_id);
      END LOOP;

      event_id := v_event_id;
      rule_id := v_rule.id;
      rule_name := v_rule.name;
      queue_name := v_stat.queue_name;
      metric := v_rule.metric;
      observed_value := v_observed;
      threshold := v_rule.threshold;
      severity := v_rule.severity;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_voispeed_queue_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_voispeed_queue_alerts(uuid) TO service_role;

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.voispeed_queue_alert_events;

-- 5. Cron: ogni minuto chiama edge function via cron-relay
SELECT cron.schedule(
  'voispeed-queue-alerts-evaluator-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/voispeed-queue-alerts-evaluator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
