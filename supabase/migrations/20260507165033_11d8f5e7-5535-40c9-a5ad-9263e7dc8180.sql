
-- ============================================================================
-- Sprint M1 — Marketing Manager Dashboard backend foundation
-- ============================================================================

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_lead_events_brand_received_source
  ON public.lead_events (brand_id, received_at DESC, source)
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_appointments_brand_status_scheduled
  ON public.appointments (brand_id, status, scheduled_at);

-- ---------------------------------------------------------------------------
-- HELPER: filter requested brand ids against user's accessible brands
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._md_authorized_brand_ids(p_brand_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_brands uuid[];
  v_filtered uuid[];
  v_is_system boolean;
BEGIN
  v_user_id := public.get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- system brand expansion: if requested brand is the system brand, keep all user brands
  v_is_system := p_brand_ids @> ARRAY['00000000-0000-0000-0000-000000000000'::uuid];

  v_user_brands := public.get_user_brand_ids(v_user_id);
  IF v_user_brands IS NULL OR array_length(v_user_brands, 1) IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  IF v_is_system THEN
    RETURN v_user_brands;
  END IF;

  SELECT array_agg(b) INTO v_filtered
  FROM unnest(p_brand_ids) b
  WHERE b = ANY(v_user_brands);

  RETURN COALESCE(v_filtered, ARRAY[]::uuid[]);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._md_authorized_brand_ids(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._md_authorized_brand_ids(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_funnel_overview
--  cross-stage end-to-end: spend → lead → appointment → deal → revenue
--  returns one row per stage with conversion and drop-off vs previous step
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_funnel_overview(
  p_brand_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_sources text[] DEFAULT NULL
)
RETURNS TABLE (
  stage_id text,
  stage_label text,
  stage_order int,
  metric_count numeric,
  metric_value numeric,
  conversion_from_prev numeric,
  drop_off_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brands uuid[];
  v_from_date date := p_from::date;
  v_to_date date := p_to::date;
  v_spend numeric := 0;
  v_leads numeric := 0;
  v_appts numeric := 0;
  v_deals_won numeric := 0;
  v_revenue numeric := 0;
BEGIN
  v_brands := public._md_authorized_brand_ids(p_brand_ids);
  IF array_length(v_brands, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Spend: ad_platform_stats + marketing_costs (manual)
  SELECT COALESCE(SUM(spend), 0) INTO v_spend
  FROM public.ad_platform_stats
  WHERE brand_id = ANY(v_brands)
    AND stat_date BETWEEN v_from_date AND v_to_date;

  v_spend := v_spend + COALESCE((
    SELECT SUM(amount) FROM public.marketing_costs
    WHERE brand_id = ANY(v_brands)
      AND cost_date BETWEEN v_from_date AND v_to_date
  ), 0);

  -- Leads
  SELECT COUNT(*) INTO v_leads
  FROM public.lead_events
  WHERE brand_id = ANY(v_brands)
    AND archived = false
    AND received_at BETWEEN p_from AND p_to
    AND (p_sources IS NULL OR source::text = ANY(p_sources));

  -- Appointments (scheduled or beyond, in period)
  SELECT COUNT(*) INTO v_appts
  FROM public.appointments
  WHERE brand_id = ANY(v_brands)
    AND scheduled_at BETWEEN p_from AND p_to
    AND status NOT IN ('draft', 'cancelled');

  -- Deals won + revenue (closed in period)
  SELECT COUNT(*), COALESCE(SUM(value), 0) INTO v_deals_won, v_revenue
  FROM public.deals
  WHERE brand_id = ANY(v_brands)
    AND status = 'won'
    AND COALESCE(closed_at, updated_at) BETWEEN p_from AND p_to;

  -- Stage 1: Spend
  RETURN QUERY SELECT
    'spend'::text,
    'Spesa'::text,
    1,
    v_spend,
    v_spend,
    NULL::numeric,
    NULL::numeric;

  -- Stage 2: Lead
  RETURN QUERY SELECT
    'lead'::text,
    'Lead'::text,
    2,
    v_leads,
    v_leads,
    NULL::numeric,
    NULL::numeric;

  -- Stage 3: Appointment
  RETURN QUERY SELECT
    'appointment'::text,
    'Appuntamenti'::text,
    3,
    v_appts,
    v_appts,
    CASE WHEN v_leads > 0 THEN ROUND((v_appts / v_leads) * 100, 2) ELSE NULL END,
    CASE WHEN v_leads > 0 THEN ROUND(((v_leads - v_appts) / v_leads) * 100, 2) ELSE NULL END;

  -- Stage 4: Deal won
  RETURN QUERY SELECT
    'deal_won'::text,
    'Vendite'::text,
    4,
    v_deals_won,
    v_deals_won,
    CASE WHEN v_appts > 0 THEN ROUND((v_deals_won / v_appts) * 100, 2) ELSE NULL END,
    CASE WHEN v_appts > 0 THEN ROUND(((v_appts - v_deals_won) / v_appts) * 100, 2) ELSE NULL END;

  -- Stage 5: Revenue
  RETURN QUERY SELECT
    'revenue'::text,
    'Fatturato'::text,
    5,
    v_deals_won,
    v_revenue,
    CASE WHEN v_spend > 0 THEN ROUND((v_revenue / v_spend) * 100, 2) ELSE NULL END,
    NULL::numeric;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_funnel_overview(uuid[], timestamptz, timestamptz, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_funnel_overview(uuid[], timestamptz, timestamptz, text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_leads_by_source_day
--  bucketed lead counts for stacked histogram
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_leads_by_source_day(
  p_brand_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_granularity text DEFAULT 'day'
)
RETURNS TABLE (
  bucket timestamptz,
  source text,
  lead_count bigint,
  source_total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brands uuid[];
  v_trunc text;
BEGIN
  v_brands := public._md_authorized_brand_ids(p_brand_ids);
  IF array_length(v_brands, 1) IS NULL THEN
    RETURN;
  END IF;

  v_trunc := CASE lower(coalesce(p_granularity, 'day'))
    WHEN 'hour' THEN 'hour'
    WHEN 'week' THEN 'week'
    ELSE 'day'
  END;

  RETURN QUERY
  WITH base AS (
    SELECT
      date_trunc(v_trunc, received_at AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' AS b,
      COALESCE(source::text, 'unknown') AS src
    FROM public.lead_events
    WHERE brand_id = ANY(v_brands)
      AND archived = false
      AND received_at BETWEEN p_from AND p_to
  ),
  agg AS (
    SELECT b, src, COUNT(*)::bigint AS cnt
    FROM base
    GROUP BY 1, 2
  ),
  totals AS (
    SELECT src, SUM(cnt)::bigint AS tot FROM agg GROUP BY src
  )
  SELECT a.b, a.src, a.cnt, t.tot
  FROM agg a
  JOIN totals t ON t.src = a.src
  ORDER BY a.b ASC, a.src ASC
  LIMIT 5000;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_leads_by_source_day(uuid[], timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leads_by_source_day(uuid[], timestamptz, timestamptz, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_email_campaign_kpis
--  email_send_log has no brand_id; brand filter via metadata->>'brand_id'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_email_campaign_kpis(
  p_brand_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  template_name text,
  sent bigint,
  delivered bigint,
  opened bigint,
  clicked bigint,
  bounced bigint,
  unsubscribed bigint,
  failed bigint,
  open_rate numeric,
  click_rate numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brands uuid[];
BEGIN
  v_brands := public._md_authorized_brand_ids(ARRAY[p_brand_id]);
  IF array_length(v_brands, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      COALESCE(template_name, 'unknown') AS tpl,
      lower(COALESCE(status, '')) AS st
    FROM public.email_send_log
    WHERE created_at BETWEEN p_from AND p_to
      AND (
        metadata IS NULL
        OR metadata->>'brand_id' IS NULL
        OR (metadata->>'brand_id')::uuid = ANY(v_brands)
      )
    LIMIT 100000
  ),
  agg AS (
    SELECT
      tpl,
      COUNT(*) FILTER (WHERE st IN ('sent','delivered','opened','clicked'))::bigint AS sent_cnt,
      COUNT(*) FILTER (WHERE st IN ('delivered','opened','clicked'))::bigint AS delivered_cnt,
      COUNT(*) FILTER (WHERE st IN ('opened','clicked'))::bigint AS opened_cnt,
      COUNT(*) FILTER (WHERE st = 'clicked')::bigint AS clicked_cnt,
      COUNT(*) FILTER (WHERE st = 'bounced')::bigint AS bounced_cnt,
      COUNT(*) FILTER (WHERE st = 'unsubscribed')::bigint AS unsub_cnt,
      COUNT(*) FILTER (WHERE st IN ('failed','error'))::bigint AS failed_cnt
    FROM base
    GROUP BY tpl
  )
  SELECT
    tpl,
    sent_cnt,
    delivered_cnt,
    opened_cnt,
    clicked_cnt,
    bounced_cnt,
    unsub_cnt,
    failed_cnt,
    CASE WHEN delivered_cnt > 0 THEN ROUND((opened_cnt::numeric / delivered_cnt) * 100, 2) ELSE 0 END,
    CASE WHEN delivered_cnt > 0 THEN ROUND((clicked_cnt::numeric / delivered_cnt) * 100, 2) ELSE 0 END
  FROM agg
  ORDER BY sent_cnt DESC
  LIMIT 200;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_email_campaign_kpis(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_email_campaign_kpis(uuid, timestamptz, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_portfolio_kpis
--  cross-brand row per brand with KPI core (spend, leads, deals_won, revenue, roas, cpl)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_portfolio_kpis(
  p_brand_ids uuid[],
  p_from date,
  p_to date
)
RETURNS TABLE (
  brand_id uuid,
  brand_name text,
  spend numeric,
  leads bigint,
  deals_won bigint,
  revenue numeric,
  roas numeric,
  cpl numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brands uuid[];
BEGIN
  v_brands := public._md_authorized_brand_ids(p_brand_ids);
  IF array_length(v_brands, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH spend_agg AS (
    SELECT brand_id, SUM(spend)::numeric AS s
    FROM public.ad_platform_stats
    WHERE brand_id = ANY(v_brands) AND stat_date BETWEEN p_from AND p_to
    GROUP BY brand_id
  ),
  manual_costs AS (
    SELECT brand_id, SUM(amount)::numeric AS s
    FROM public.marketing_costs
    WHERE brand_id = ANY(v_brands) AND cost_date BETWEEN p_from AND p_to
    GROUP BY brand_id
  ),
  lead_agg AS (
    SELECT brand_id, COUNT(*)::bigint AS c
    FROM public.lead_events
    WHERE brand_id = ANY(v_brands)
      AND archived = false
      AND received_at::date BETWEEN p_from AND p_to
    GROUP BY brand_id
  ),
  deal_agg AS (
    SELECT brand_id, COUNT(*)::bigint AS c, COALESCE(SUM(value),0)::numeric AS rev
    FROM public.deals
    WHERE brand_id = ANY(v_brands)
      AND status = 'won'
      AND COALESCE(closed_at, updated_at)::date BETWEEN p_from AND p_to
    GROUP BY brand_id
  )
  SELECT
    b.id,
    b.name,
    COALESCE(sa.s,0) + COALESCE(mc.s,0) AS total_spend,
    COALESCE(la.c, 0),
    COALESCE(da.c, 0),
    COALESCE(da.rev, 0),
    CASE WHEN COALESCE(sa.s,0)+COALESCE(mc.s,0) > 0
      THEN ROUND(COALESCE(da.rev,0) / (COALESCE(sa.s,0)+COALESCE(mc.s,0)), 2)
      ELSE NULL END,
    CASE WHEN COALESCE(la.c,0) > 0
      THEN ROUND((COALESCE(sa.s,0)+COALESCE(mc.s,0)) / la.c, 2)
      ELSE NULL END
  FROM public.brands b
  LEFT JOIN spend_agg sa ON sa.brand_id = b.id
  LEFT JOIN manual_costs mc ON mc.brand_id = b.id
  LEFT JOIN lead_agg la ON la.brand_id = b.id
  LEFT JOIN deal_agg da ON da.brand_id = b.id
  WHERE b.id = ANY(v_brands)
  ORDER BY (COALESCE(da.rev,0)) DESC, b.name ASC
  LIMIT 200;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_portfolio_kpis(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_portfolio_kpis(uuid[], date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- REALTIME publication: add lead_events
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lead_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_events';
  END IF;
END $$;
