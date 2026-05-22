-- ============================================================================
-- F5 Perf & UX (1-4): MV refresh + per-source sales + salesperson funnel
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) MV channel performance daily (brand × date × channel)
-- ----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.mv_channel_perf_daily CASCADE;
CREATE MATERIALIZED VIEW public.mv_channel_perf_daily AS
WITH leads_d AS (
  SELECT
    lca.brand_id,
    (le.occurred_at AT TIME ZONE 'Europe/Rome')::date AS d,
    lca.channel_id,
    lca.source_category,
    COUNT(*)::int AS leads_count,
    COUNT(DISTINCT lca.contact_id)::int AS contacts_count
  FROM public.lead_campaign_attribution lca
  JOIN public.lead_events le ON le.id = lca.lead_event_id
  WHERE le.archived = false
  GROUP BY lca.brand_id, (le.occurred_at AT TIME ZONE 'Europe/Rome')::date, lca.channel_id, lca.source_category
),
spend_d AS (
  SELECT
    brand_id,
    cost_date AS d,
    channel_id,
    SUM(amount)::numeric(14,2) AS spend
  FROM public.v_channel_spend_daily
  WHERE channel_id IS NOT NULL
  GROUP BY brand_id, cost_date, channel_id
),
deals_d AS (
  SELECT
    lca.brand_id,
    (le.occurred_at AT TIME ZONE 'Europe/Rome')::date AS d,
    lca.channel_id,
    COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'won')::int AS deals_won,
    COALESCE(SUM(d.value) FILTER (WHERE d.status = 'won'), 0)::numeric(14,2) AS revenue
  FROM public.lead_campaign_attribution lca
  JOIN public.lead_events le ON le.id = lca.lead_event_id
  JOIN public.deals d ON d.contact_id = lca.contact_id AND d.brand_id = lca.brand_id
  GROUP BY lca.brand_id, (le.occurred_at AT TIME ZONE 'Europe/Rome')::date, lca.channel_id
)
SELECT
  COALESCE(l.brand_id, s.brand_id, dd.brand_id) AS brand_id,
  COALESCE(l.d, s.d, dd.d) AS d,
  COALESCE(l.channel_id, s.channel_id, dd.channel_id) AS channel_id,
  l.source_category,
  COALESCE(l.leads_count, 0) AS leads_count,
  COALESCE(l.contacts_count, 0) AS contacts_count,
  COALESCE(s.spend, 0)::numeric(14,2) AS spend,
  COALESCE(dd.deals_won, 0) AS deals_won,
  COALESCE(dd.revenue, 0)::numeric(14,2) AS revenue
FROM leads_d l
FULL OUTER JOIN spend_d s
  ON s.brand_id = l.brand_id AND s.d = l.d AND s.channel_id = l.channel_id
FULL OUTER JOIN deals_d dd
  ON dd.brand_id = COALESCE(l.brand_id, s.brand_id)
 AND dd.d = COALESCE(l.d, s.d)
 AND dd.channel_id = COALESCE(l.channel_id, s.channel_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_channel_perf_daily
  ON public.mv_channel_perf_daily (brand_id, d, channel_id, COALESCE(source_category, ''));
CREATE INDEX IF NOT EXISTS idx_mv_channel_perf_daily_brand_d
  ON public.mv_channel_perf_daily (brand_id, d DESC);

COMMENT ON MATERIALIZED VIEW public.mv_channel_perf_daily IS
  'F5: aggregato giornaliero brand×data×channel (leads/spend/deals/revenue). Refresh 15min.';

-- ----------------------------------------------------------------------------
-- 2) MV salesperson performance daily (brand × date × user)
-- ----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.mv_salesperson_perf_daily CASCADE;
CREATE MATERIALIZED VIEW public.mv_salesperson_perf_daily AS
WITH appts_d AS (
  SELECT
    a.brand_id,
    (a.scheduled_at AT TIME ZONE 'Europe/Rome')::date AS d,
    a.assigned_sales_user_id AS user_id,
    COUNT(*)::int AS programmati,
    COUNT(*) FILTER (WHERE a.status = 'completed')::int AS eseguiti,
    COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS no_show,
    COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancellati
  FROM public.appointments a
  WHERE a.assigned_sales_user_id IS NOT NULL
  GROUP BY a.brand_id, (a.scheduled_at AT TIME ZONE 'Europe/Rome')::date, a.assigned_sales_user_id
),
orders_d AS (
  SELECT
    so.brand_id,
    (COALESCE(so.confirmed_at, so.created_at) AT TIME ZONE 'Europe/Rome')::date AS d,
    so.assigned_user_id AS user_id,
    COUNT(*) FILTER (WHERE so.status IN ('confirmed','paid'))::int AS ordini_venduti,
    COALESCE(SUM(so.total_amount) FILTER (WHERE so.status IN ('confirmed','paid')), 0)::numeric(14,2) AS lordo
  FROM public.sales_orders so
  WHERE so.assigned_user_id IS NOT NULL
  GROUP BY so.brand_id, (COALESCE(so.confirmed_at, so.created_at) AT TIME ZONE 'Europe/Rome')::date, so.assigned_user_id
),
deliv_d AS (
  SELECT
    so.brand_id,
    (so.delivered_at AT TIME ZONE 'Europe/Rome')::date AS d,
    so.assigned_user_id AS user_id,
    COUNT(*)::int AS consegnati
  FROM public.sales_orders so
  WHERE so.delivered_at IS NOT NULL AND so.assigned_user_id IS NOT NULL
  GROUP BY so.brand_id, (so.delivered_at AT TIME ZONE 'Europe/Rome')::date, so.assigned_user_id
)
SELECT
  COALESCE(a.brand_id, o.brand_id, dl.brand_id) AS brand_id,
  COALESCE(a.d, o.d, dl.d) AS d,
  COALESCE(a.user_id, o.user_id, dl.user_id) AS user_id,
  COALESCE(a.programmati, 0) AS programmati,
  COALESCE(a.eseguiti, 0) AS eseguiti,
  COALESCE(a.no_show, 0) AS no_show,
  COALESCE(a.cancellati, 0) AS cancellati,
  COALESCE(o.ordini_venduti, 0) AS ordini_venduti,
  COALESCE(o.lordo, 0)::numeric(14,2) AS lordo,
  COALESCE(dl.consegnati, 0) AS consegnati
FROM appts_d a
FULL OUTER JOIN orders_d o
  ON o.brand_id = a.brand_id AND o.d = a.d AND o.user_id = a.user_id
FULL OUTER JOIN deliv_d dl
  ON dl.brand_id = COALESCE(a.brand_id, o.brand_id)
 AND dl.d        = COALESCE(a.d, o.d)
 AND dl.user_id  = COALESCE(a.user_id, o.user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_salesperson_perf_daily
  ON public.mv_salesperson_perf_daily (brand_id, d, user_id);
CREATE INDEX IF NOT EXISTS idx_mv_salesperson_perf_daily_brand_d
  ON public.mv_salesperson_perf_daily (brand_id, d DESC);

COMMENT ON MATERIALIZED VIEW public.mv_salesperson_perf_daily IS
  'F5: aggregato giornaliero brand×data×venditore. Refresh 15min.';

-- ----------------------------------------------------------------------------
-- 3) Refresh log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.performance_mv_refresh_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mv_name     text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  rows_after  bigint,
  error       text
);
CREATE INDEX IF NOT EXISTS idx_perf_mv_log_mv_when
  ON public.performance_mv_refresh_log (mv_name, started_at DESC);

ALTER TABLE public.performance_mv_refresh_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perf_mv_log_select_finance" ON public.performance_mv_refresh_log;
CREATE POLICY "perf_mv_log_select_finance" ON public.performance_mv_refresh_log
FOR SELECT TO authenticated
USING (
  public.has_role(get_user_id(auth.uid()), 'admin'::app_role)
  OR public.has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  OR public.has_role(get_user_id(auth.uid()), 'amministrazione'::app_role)
);

-- ----------------------------------------------------------------------------
-- 4) RPC refresh
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_performance_mvs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started timestamptz;
  v_dur     int;
  v_rows    bigint;
  v_result  jsonb := '[]'::jsonb;
  v_err     text;
BEGIN
  -- mv_channel_perf_daily
  v_started := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_channel_perf_daily;
    v_dur := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started)::int;
    SELECT count(*) INTO v_rows FROM public.mv_channel_perf_daily;
    INSERT INTO public.performance_mv_refresh_log(mv_name, started_at, finished_at, duration_ms, rows_after)
      VALUES ('mv_channel_perf_daily', v_started, clock_timestamp(), v_dur, v_rows);
    v_result := v_result || jsonb_build_object('mv','mv_channel_perf_daily','ok',true,'duration_ms',v_dur,'rows',v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.performance_mv_refresh_log(mv_name, started_at, finished_at, error)
      VALUES ('mv_channel_perf_daily', v_started, clock_timestamp(), v_err);
    v_result := v_result || jsonb_build_object('mv','mv_channel_perf_daily','ok',false,'error',v_err);
  END;

  -- mv_salesperson_perf_daily
  v_started := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_salesperson_perf_daily;
    v_dur := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started)::int;
    SELECT count(*) INTO v_rows FROM public.mv_salesperson_perf_daily;
    INSERT INTO public.performance_mv_refresh_log(mv_name, started_at, finished_at, duration_ms, rows_after)
      VALUES ('mv_salesperson_perf_daily', v_started, clock_timestamp(), v_dur, v_rows);
    v_result := v_result || jsonb_build_object('mv','mv_salesperson_perf_daily','ok',true,'duration_ms',v_dur,'rows',v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.performance_mv_refresh_log(mv_name, started_at, finished_at, error)
      VALUES ('mv_salesperson_perf_daily', v_started, clock_timestamp(), v_err);
    v_result := v_result || jsonb_build_object('mv','mv_salesperson_perf_daily','ok',false,'error',v_err);
  END;

  RETURN jsonb_build_object('refreshed_at', now(), 'results', v_result);
END $$;

REVOKE EXECUTE ON FUNCTION public.refresh_performance_mvs() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.refresh_performance_mvs() TO authenticated, service_role;

COMMENT ON FUNCTION public.refresh_performance_mvs() IS
  'F5: refresh CONCURRENT delle MV performance, con log e durata.';

-- ----------------------------------------------------------------------------
-- 5) RPC freshness (per banner UI)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_performance_mv_freshness()
RETURNS TABLE (
  mv_name text,
  last_refreshed_at timestamptz,
  last_duration_ms int,
  last_rows bigint,
  last_error text,
  age_seconds int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (l.mv_name)
    l.mv_name,
    l.finished_at AS last_refreshed_at,
    l.duration_ms AS last_duration_ms,
    l.rows_after  AS last_rows,
    l.error       AS last_error,
    GREATEST(0, EXTRACT(EPOCH FROM (now() - l.finished_at))::int) AS age_seconds
  FROM public.performance_mv_refresh_log l
  WHERE l.finished_at IS NOT NULL
  ORDER BY l.mv_name, l.finished_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_performance_mv_freshness() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_performance_mv_freshness() TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC sales performance by source
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_sales_performance_by_source(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_sales_performance_by_source(
  p_brand_id uuid,
  p_from     date,
  p_to       date
)
RETURNS TABLE (
  source_category   text,
  channel_id        uuid,
  channel_name      text,
  leads_count       int,
  appts_eseguiti    int,
  ordini_venduti    int,
  lordo             numeric,
  perc_vendita      numeric,
  prezzo_medio      numeric,
  consegnati        int,
  perc_consegne     numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := get_user_id(auth.uid());
BEGIN
  IF p_brand_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'get_sales_performance_by_source: brand_id/from/to required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.user_belongs_to_brand(v_uid, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH leads AS (
    SELECT lca.contact_id, lca.channel_id, lca.source_category
    FROM public.lead_campaign_attribution lca
    JOIN public.lead_events le ON le.id = lca.lead_event_id
    WHERE lca.brand_id = p_brand_id
      AND (le.occurred_at AT TIME ZONE 'Europe/Rome')::date BETWEEN p_from AND p_to
  ),
  appts AS (
    SELECT a.contact_id,
           COUNT(*) FILTER (WHERE a.status = 'completed')::int AS eseguiti
    FROM public.appointments a
    WHERE a.brand_id = p_brand_id
      AND (a.scheduled_at AT TIME ZONE 'Europe/Rome')::date BETWEEN p_from AND p_to
    GROUP BY a.contact_id
  ),
  orders AS (
    SELECT so.contact_id,
           COUNT(*) FILTER (WHERE so.status IN ('confirmed','paid'))::int AS ordini,
           COALESCE(SUM(so.total_amount) FILTER (WHERE so.status IN ('confirmed','paid')),0)::numeric(14,2) AS lordo,
           COUNT(*) FILTER (WHERE so.delivered_at IS NOT NULL)::int AS consegnati
    FROM public.sales_orders so
    WHERE so.brand_id = p_brand_id
      AND (COALESCE(so.confirmed_at, so.created_at) AT TIME ZONE 'Europe/Rome')::date BETWEEN p_from AND p_to
    GROUP BY so.contact_id
  )
  SELECT
    COALESCE(l.source_category, 'unknown')           AS source_category,
    l.channel_id,
    ch.name                                          AS channel_name,
    COUNT(DISTINCT l.contact_id)::int                AS leads_count,
    COALESCE(SUM(ap.eseguiti),0)::int                AS appts_eseguiti,
    COALESCE(SUM(o.ordini),0)::int                   AS ordini_venduti,
    COALESCE(SUM(o.lordo),0)::numeric(14,2)          AS lordo,
    CASE WHEN COALESCE(SUM(ap.eseguiti),0) > 0
      THEN ROUND(COALESCE(SUM(o.ordini),0)::numeric * 100 / SUM(ap.eseguiti), 2)
      ELSE 0 END                                     AS perc_vendita,
    CASE WHEN COALESCE(SUM(o.ordini),0) > 0
      THEN ROUND(COALESCE(SUM(o.lordo),0) / SUM(o.ordini), 2)
      ELSE 0 END                                     AS prezzo_medio,
    COALESCE(SUM(o.consegnati),0)::int               AS consegnati,
    CASE WHEN COALESCE(SUM(o.ordini),0) > 0
      THEN ROUND(COALESCE(SUM(o.consegnati),0)::numeric * 100 / SUM(o.ordini), 2)
      ELSE 0 END                                     AS perc_consegne
  FROM leads l
  LEFT JOIN public.marketing_channels ch ON ch.id = l.channel_id
  LEFT JOIN appts  ap ON ap.contact_id = l.contact_id
  LEFT JOIN orders o  ON o.contact_id  = l.contact_id
  GROUP BY l.source_category, l.channel_id, ch.name
  ORDER BY lordo DESC NULLS LAST, leads_count DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_sales_performance_by_source(uuid,date,date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_sales_performance_by_source(uuid,date,date) TO authenticated;

COMMENT ON FUNCTION public.get_sales_performance_by_source(uuid,date,date) IS
  'F5: breakdown vendite per fonte (categoria/canale) con prezzo medio e % consegne.';

-- ----------------------------------------------------------------------------
-- 7) RPC salesperson funnel + monthly trend
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_salesperson_funnel(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_salesperson_funnel(
  p_brand_id uuid,
  p_user_id  uuid,
  p_from     date,
  p_to       date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := get_user_id(auth.uid());
  v_funnel jsonb;
  v_trend  jsonb;
BEGIN
  IF p_brand_id IS NULL OR p_user_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'get_salesperson_funnel: required params missing' USING ERRCODE = '22023';
  END IF;
  IF NOT public.user_belongs_to_brand(v_uid, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  -- Funnel periodo
  WITH d AS (
    SELECT
      SUM(programmati)::int  AS assegnati,
      SUM(eseguiti)::int     AS visitati,
      SUM(ordini_venduti)::int AS ordini,
      SUM(consegnati)::int   AS consegnati,
      SUM(lordo)::numeric(14,2) AS lordo
    FROM public.mv_salesperson_perf_daily
    WHERE brand_id = p_brand_id AND user_id = p_user_id
      AND d BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'assegnati', COALESCE(assegnati,0),
    'visitati',  COALESCE(visitati,0),
    'ordini',    COALESCE(ordini,0),
    'consegnati',COALESCE(consegnati,0),
    'lordo',     COALESCE(lordo,0),
    'perc_visita',  CASE WHEN COALESCE(assegnati,0)>0 THEN ROUND(visitati::numeric*100/assegnati,2) ELSE 0 END,
    'perc_vendita', CASE WHEN COALESCE(visitati,0)>0  THEN ROUND(ordini::numeric*100/visitati,2)    ELSE 0 END,
    'perc_consegna',CASE WHEN COALESCE(ordini,0)>0    THEN ROUND(consegnati::numeric*100/ordini,2)  ELSE 0 END
  ) INTO v_funnel FROM d;

  -- Trend mensile (ultimi 12 mesi rolling fino a p_to)
  WITH m AS (
    SELECT
      date_trunc('month', d)::date AS mese,
      SUM(programmati)::int  AS assegnati,
      SUM(eseguiti)::int     AS visitati,
      SUM(ordini_venduti)::int AS ordini,
      SUM(consegnati)::int   AS consegnati,
      SUM(lordo)::numeric(14,2) AS lordo
    FROM public.mv_salesperson_perf_daily
    WHERE brand_id = p_brand_id AND user_id = p_user_id
      AND d >= (p_to - INTERVAL '12 months')::date
      AND d <= p_to
    GROUP BY 1
    ORDER BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'mese', mese,
    'assegnati', assegnati,
    'visitati',  visitati,
    'ordini',    ordini,
    'consegnati',consegnati,
    'lordo',     lordo
  )), '[]'::jsonb) INTO v_trend FROM m;

  RETURN jsonb_build_object(
    'funnel', v_funnel,
    'trend',  v_trend,
    'period', jsonb_build_object('from', p_from, 'to', p_to)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_salesperson_funnel(uuid,uuid,date,date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_salesperson_funnel(uuid,uuid,date,date) TO authenticated;

COMMENT ON FUNCTION public.get_salesperson_funnel(uuid,uuid,date,date) IS
  'F5: funnel singolo venditore + trend mensile 12 mesi (legge mv_salesperson_perf_daily).';

-- ----------------------------------------------------------------------------
-- 8) Seed iniziale: refresh subito
-- ----------------------------------------------------------------------------
-- Eseguiamo il primo populate (le MV vengono create vuote in CREATE)
REFRESH MATERIALIZED VIEW public.mv_channel_perf_daily;
REFRESH MATERIALIZED VIEW public.mv_salesperson_perf_daily;

INSERT INTO public.performance_mv_refresh_log(mv_name, started_at, finished_at, duration_ms, rows_after)
SELECT 'mv_channel_perf_daily', now(), now(), 0, count(*) FROM public.mv_channel_perf_daily;
INSERT INTO public.performance_mv_refresh_log(mv_name, started_at, finished_at, duration_ms, rows_after)
SELECT 'mv_salesperson_perf_daily', now(), now(), 0, count(*) FROM public.mv_salesperson_perf_daily;