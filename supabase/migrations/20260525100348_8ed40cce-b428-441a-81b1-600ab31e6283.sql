-- ============================================================
-- WS-A · F5.8 — Cohort delivery + VAT per-row (additive)
-- ============================================================

CREATE OR REPLACE VIEW public.v_sales_orders_taxable AS
SELECT
  so.id,
  so.brand_id,
  so.assigned_user_id,
  so.total_amount,
  so.signed_at,
  so.confirmed_at,
  so.delivered_at,
  so.lifecycle_status,
  -- flat 22% (compat foglio)
  ROUND(so.total_amount / 1.22, 2) AS taxable_amount_flat,
  -- per-riga (solo se tutte le righe hanno vat_rate)
  CASE
    WHEN EXISTS (SELECT 1 FROM public.sales_order_items i WHERE i.order_id = so.id)
     AND NOT EXISTS (SELECT 1 FROM public.sales_order_items i WHERE i.order_id = so.id AND i.vat_rate IS NULL)
    THEN (
      SELECT ROUND(SUM(i.line_total / (1 + i.vat_rate/100.0)), 2)
      FROM public.sales_order_items i WHERE i.order_id = so.id
    )
    ELSE NULL
  END AS taxable_amount_itemized,
  -- effective = itemized se disponibile, altrimenti flat
  COALESCE(
    CASE
      WHEN EXISTS (SELECT 1 FROM public.sales_order_items i WHERE i.order_id = so.id)
       AND NOT EXISTS (SELECT 1 FROM public.sales_order_items i WHERE i.order_id = so.id AND i.vat_rate IS NULL)
      THEN (SELECT ROUND(SUM(i.line_total / (1 + i.vat_rate/100.0)), 2) FROM public.sales_order_items i WHERE i.order_id = so.id)
    END,
    ROUND(so.total_amount / 1.22, 2)
  ) AS taxable_amount_effective,
  -- basis: 'itemized' | 'flat_22'
  CASE
    WHEN EXISTS (SELECT 1 FROM public.sales_order_items i WHERE i.order_id = so.id)
     AND NOT EXISTS (SELECT 1 FROM public.sales_order_items i WHERE i.order_id = so.id AND i.vat_rate IS NULL)
    THEN 'itemized'::text
    ELSE 'flat_22'::text
  END AS taxable_basis
FROM public.sales_orders so;

COMMENT ON VIEW public.v_sales_orders_taxable IS 'F5.8: imponibile per riga (preferito) con fallback flat 22%';

-- backfill soft signed_at quando NULL
CREATE OR REPLACE FUNCTION public.tg_sales_orders_signed_at_backfill()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.signed_at IS NULL AND NEW.status IN ('confirmed'::sales_order_status, 'paid'::sales_order_status) THEN
    NEW.signed_at := COALESCE(NEW.confirmed_at, NEW.created_at, now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sales_orders_signed_at_backfill ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_signed_at_backfill
BEFORE INSERT OR UPDATE OF status, confirmed_at ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_sales_orders_signed_at_backfill();

-- backfill one-shot per righe esistenti
UPDATE public.sales_orders
SET signed_at = COALESCE(confirmed_at, created_at)
WHERE signed_at IS NULL AND status IN ('confirmed'::sales_order_status, 'paid'::sales_order_status);

-- RPC estesa: cohort + taxable mode
CREATE OR REPLACE FUNCTION public.get_salesperson_kpis_v2_ext(
  p_brand_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_user_ids uuid[] DEFAULT NULL,
  p_as_of_date timestamptz DEFAULT NULL,
  p_taxable_mode text DEFAULT 'effective'  -- 'effective'|'flat'|'itemized'
) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz;
  v_as_of timestamptz;
  v_result json;
BEGIN
  IF NOT user_belongs_to_brand(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_taxable_mode NOT IN ('effective','flat','itemized') THEN
    RAISE EXCEPTION 'Invalid taxable mode' USING ERRCODE = '22023';
  END IF;

  v_from := COALESCE(p_from, date_trunc('month', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome');
  v_to := COALESCE(p_to, now());
  v_as_of := COALESCE(p_as_of_date, now());

  WITH sellers AS (
    SELECT DISTINCT u.id, u.full_name, u.email
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE ur.brand_id = p_brand_id
      AND ur.role IN ('venditore'::app_role, 'responsabile_venditori'::app_role)
      AND (p_user_ids IS NULL OR u.id = ANY(p_user_ids))
  ),
  appts AS (
    SELECT a.assigned_sales_user_id AS user_id,
      COUNT(*) FILTER (WHERE a.scheduled_at >= v_from AND a.scheduled_at < v_to) AS programmati,
      COUNT(*) FILTER (WHERE a.scheduled_at >= v_from AND a.scheduled_at < v_to AND a.status = 'completed') AS eseguiti,
      COUNT(*) FILTER (WHERE a.scheduled_at >= v_from AND a.scheduled_at < v_to AND a.status = 'no_show') AS no_show,
      COUNT(*) FILTER (WHERE a.scheduled_at >= v_from AND a.scheduled_at < v_to AND a.status = 'cancelled') AS cancellati
    FROM public.appointments a
    WHERE a.brand_id = p_brand_id AND a.assigned_sales_user_id IS NOT NULL
    GROUP BY a.assigned_sales_user_id
  ),
  -- ordini "venduti" di periodo (signed_at ∈ P)
  orders_cohort AS (
    SELECT vso.assigned_user_id AS user_id,
      COUNT(*) AS cohort_orders_count,
      COALESCE(SUM(vso.total_amount), 0)::numeric AS lordo,
      COALESCE(SUM(
        CASE p_taxable_mode
          WHEN 'flat' THEN vso.taxable_amount_flat
          WHEN 'itemized' THEN COALESCE(vso.taxable_amount_itemized, vso.taxable_amount_flat)
          ELSE vso.taxable_amount_effective
        END
      ), 0)::numeric AS imponibile,
      -- consegne della COORTE: firmati in P E consegnati entro as_of
      COUNT(*) FILTER (WHERE vso.delivered_at IS NOT NULL AND vso.delivered_at <= v_as_of) AS delivered_count_cohort,
      COALESCE(SUM(vso.total_amount) FILTER (WHERE vso.delivered_at IS NOT NULL AND vso.delivered_at <= v_as_of), 0)::numeric AS delivered_amount_cohort,
      -- mix basis
      bool_or(vso.taxable_basis = 'itemized') AS has_itemized,
      bool_or(vso.taxable_basis = 'flat_22') AS has_flat
    FROM public.v_sales_orders_taxable vso
    JOIN public.sales_orders so ON so.id = vso.id
    WHERE vso.brand_id = p_brand_id
      AND vso.assigned_user_id IS NOT NULL
      AND so.status IN ('confirmed'::sales_order_status, 'paid'::sales_order_status)
      AND vso.signed_at >= v_from AND vso.signed_at < v_to
    GROUP BY vso.assigned_user_id
  ),
  -- consegne di PERIODO (delivered_at ∈ P, indipendentemente da quando firmato)
  deliveries_period AS (
    SELECT so.assigned_user_id AS user_id,
      COUNT(*) AS delivered_count_period,
      COALESCE(SUM(so.total_amount), 0)::numeric AS delivered_amount_period
    FROM public.sales_orders so
    WHERE so.brand_id = p_brand_id
      AND so.assigned_user_id IS NOT NULL
      AND so.delivered_at IS NOT NULL
      AND so.delivered_at >= v_from AND so.delivered_at < v_to
    GROUP BY so.assigned_user_id
  )
  SELECT json_agg(row_to_json(r) ORDER BY r.full_name) INTO v_result
  FROM (
    SELECT
      s.id AS user_id, s.full_name, s.email,
      COALESCE(ap.programmati, 0) AS appuntamenti_programmati,
      COALESCE(ap.eseguiti, 0) AS appuntamenti_eseguiti,
      COALESCE(ap.no_show, 0) AS no_show,
      COALESCE(ap.cancellati, 0) AS cancellati,
      CASE WHEN COALESCE(ap.programmati,0) > 0
        THEN ROUND(COALESCE(ap.eseguiti,0)::numeric * 100 / ap.programmati, 2) ELSE NULL END AS perc_esecuzione,
      COALESCE(oc.cohort_orders_count, 0) AS ordini_venduti,
      COALESCE(oc.cohort_orders_count, 0) AS cohort_orders_count,
      CASE WHEN COALESCE(ap.eseguiti,0) > 0
        THEN ROUND(COALESCE(oc.cohort_orders_count,0)::numeric * 100 / ap.eseguiti, 2) ELSE NULL END AS perc_vendita,
      COALESCE(oc.lordo, 0) AS lordo,
      COALESCE(oc.imponibile, 0) AS imponibile,
      -- DUE metriche consegne
      COALESCE(dp.delivered_count_period, 0) AS delivered_count_period,
      COALESCE(dp.delivered_amount_period, 0) AS delivered_amount_period,
      COALESCE(oc.delivered_count_cohort, 0) AS delivered_count_cohort,
      COALESCE(oc.delivered_amount_cohort, 0) AS delivered_amount_cohort,
      CASE WHEN COALESCE(oc.cohort_orders_count,0) > 0
        THEN ROUND(COALESCE(dp.delivered_count_period,0)::numeric * 100 / oc.cohort_orders_count, 2) ELSE NULL END AS perc_delivered_on_sold_period,
      CASE WHEN COALESCE(oc.cohort_orders_count,0) > 0
        THEN ROUND(COALESCE(oc.delivered_count_cohort,0)::numeric * 100 / oc.cohort_orders_count, 2) ELSE NULL END AS perc_delivered_on_sold_cohort,
      CASE
        WHEN oc.has_itemized AND oc.has_flat THEN 'mixed'
        WHEN oc.has_itemized THEN 'itemized'
        WHEN oc.has_flat THEN 'flat_22'
        ELSE NULL
      END AS taxable_basis,
      public.compute_bonus_for_amount(p_brand_id, COALESCE(oc.lordo,0), v_to) AS bonus
    FROM sellers s
    LEFT JOIN appts ap ON ap.user_id = s.id
    LEFT JOIN orders_cohort oc ON oc.user_id = s.id
    LEFT JOIN deliveries_period dp ON dp.user_id = s.id
  ) r;

  RETURN json_build_object(
    'period', json_build_object('from', v_from, 'to', v_to, 'as_of', v_as_of, 'taxable_mode', p_taxable_mode),
    'rows', COALESCE(v_result, '[]'::json),
    'calc_version', 'v2.1-cohort'
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_salesperson_kpis_v2_ext(uuid,timestamptz,timestamptz,uuid[],timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_salesperson_kpis_v2_ext(uuid,timestamptz,timestamptz,uuid[],timestamptz,text) TO authenticated;

-- ============================================================
-- WS-B · F6 — Wallboard live VoiSpeed
-- ============================================================

CREATE TABLE IF NOT EXISTS public.voispeed_agent_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  voispeed_ext text NOT NULL,
  status text NOT NULL CHECK (status IN ('available','on_call','paused','wrap_up','offline','ringing','dnd')),
  queue_name text,
  since timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_voispeed_agent UNIQUE (brand_id, voispeed_ext)
);

CREATE INDEX IF NOT EXISTS ix_voispeed_agent_brand ON public.voispeed_agent_status (brand_id, status);

ALTER TABLE public.voispeed_agent_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voispeed_agent_status_select" ON public.voispeed_agent_status
  FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE TABLE IF NOT EXISTS public.voispeed_queue_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  queue_name text NOT NULL,
  stat_ts timestamptz NOT NULL DEFAULT now(),
  calls_waiting int DEFAULT 0,
  longest_wait_seconds int DEFAULT 0,
  agents_available int DEFAULT 0,
  agents_busy int DEFAULT 0,
  service_level_pct numeric(5,2),
  abandoned_15m int DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_voispeed_queue_stats_recent ON public.voispeed_queue_stats (brand_id, queue_name, stat_ts DESC);

ALTER TABLE public.voispeed_queue_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voispeed_queue_stats_select" ON public.voispeed_queue_stats
  FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

ALTER TABLE public.voispeed_agent_status REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voispeed_agent_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voispeed_queue_stats;

-- ============================================================
-- WS-C · Centralino avanzato (IVR + colonne call_logs)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.voispeed_ivr_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  voispeed_ivr_id text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.voispeed_ivr_nodes(id) ON DELETE SET NULL,
  routes_to_queue text,
  routes_to_ext text,
  synced_at timestamptz DEFAULT now(),
  CONSTRAINT uq_voispeed_ivr UNIQUE (brand_id, voispeed_ivr_id)
);

ALTER TABLE public.voispeed_ivr_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voispeed_ivr_nodes_select" ON public.voispeed_ivr_nodes
  FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS queue_name text,
  ADD COLUMN IF NOT EXISTS wait_seconds int,
  ADD COLUMN IF NOT EXISTS talk_seconds int,
  ADD COLUMN IF NOT EXISTS ivr_path text;

-- ============================================================
-- WS-D · Multi-touch attribution (foundation, non rompe single-touch)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lead_attribution_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  lead_event_id uuid NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES public.marketing_channels(id) ON DELETE SET NULL,
  tracking_number_id uuid,
  source_category text,
  touch_index int NOT NULL DEFAULT 1,
  touch_type text NOT NULL DEFAULT 'first' CHECK (touch_type IN ('first','middle','last','single')),
  touch_weight numeric(5,4) NOT NULL DEFAULT 1.0 CHECK (touch_weight >= 0 AND touch_weight <= 1),
  attribution_model text NOT NULL DEFAULT 'first_touch'
    CHECK (attribution_model IN ('first_touch','last_touch','linear','u_shape','time_decay')),
  touched_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lat_lead_touch UNIQUE (lead_event_id, attribution_model, touch_index)
);

CREATE INDEX IF NOT EXISTS ix_lat_brand_campaign ON public.lead_attribution_touches (brand_id, campaign_id);
CREATE INDEX IF NOT EXISTS ix_lat_brand_model_touched ON public.lead_attribution_touches (brand_id, attribution_model, touched_at);

ALTER TABLE public.lead_attribution_touches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_attribution_touches_select" ON public.lead_attribution_touches
  FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- ============================================================
-- WS-E · GDPR consent capture (CTI/IVR)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.brand_call_consent_config (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  recording_legal_basis text NOT NULL DEFAULT 'legitimate_interest'
    CHECK (recording_legal_basis IN ('consent','legitimate_interest')),
  ivr_announcement_audio_url text,
  ivr_consent_required boolean NOT NULL DEFAULT false,
  policy_version text NOT NULL DEFAULT 'v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.brand_call_consent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bccc_select" ON public.brand_call_consent_config
  FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "bccc_modify_admin" ON public.brand_call_consent_config
  FOR ALL TO authenticated
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'amministrazione'::app_role)
  )
  WITH CHECK (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'amministrazione'::app_role)
  );

CREATE TABLE IF NOT EXISTS public.call_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  call_log_id uuid REFERENCES public.call_logs(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  consent_action text NOT NULL CHECK (consent_action IN (
    'ivr_announcement_played',
    'ivr_consent_given',
    'ivr_consent_denied',
    'verbal_consent_logged',
    'consent_withdrawn',
    'recording_disabled_by_consent'
  )),
  source text NOT NULL CHECK (source IN ('ivr','operator','self_service','admin')),
  evidence_url text,
  dtmf_input text,
  legal_basis text DEFAULT 'consent' CHECK (legal_basis IN ('consent','legitimate_interest')),
  policy_version text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS ix_cce_contact ON public.call_consent_events (contact_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS ix_cce_call_log ON public.call_consent_events (call_log_id);
CREATE INDEX IF NOT EXISTS ix_cce_brand_action ON public.call_consent_events (brand_id, consent_action, recorded_at DESC);

ALTER TABLE public.call_consent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cce_select" ON public.call_consent_events
  FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- RPC per log consenso manuale (operatore o admin)
CREATE OR REPLACE FUNCTION public.log_call_consent(
  p_brand_id uuid,
  p_call_log_id uuid,
  p_contact_id uuid,
  p_consent_action text,
  p_source text DEFAULT 'operator',
  p_legal_basis text DEFAULT 'consent',
  p_metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_uid uuid;
  v_policy text;
BEGIN
  v_uid := get_user_id(auth.uid());
  IF NOT user_belongs_to_brand(v_uid, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  SELECT policy_version INTO v_policy FROM public.brand_call_consent_config WHERE brand_id = p_brand_id;

  INSERT INTO public.call_consent_events (
    brand_id, call_log_id, contact_id, consent_action, source, legal_basis,
    policy_version, recorded_by_user_id, metadata
  ) VALUES (
    p_brand_id, p_call_log_id, p_contact_id, p_consent_action, p_source, p_legal_basis,
    COALESCE(v_policy, 'v1'), v_uid, p_metadata
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.log_call_consent(uuid,uuid,uuid,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_call_consent(uuid,uuid,uuid,text,text,text,jsonb) TO authenticated;

-- Retention cleanup queue: stats vecchie >7gg
CREATE OR REPLACE FUNCTION public.cleanup_voispeed_queue_stats()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.voispeed_queue_stats WHERE stat_ts < now() - interval '7 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.cleanup_voispeed_queue_stats() FROM PUBLIC, anon;