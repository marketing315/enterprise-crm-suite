-- ---------------------------------------------------------------------------
-- get_funnel_overview_compare
--  same as get_funnel_overview but with previous-period comparison
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_funnel_overview_compare(
  p_brand_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_compare_from timestamptz,
  p_compare_to timestamptz,
  p_sources text[] DEFAULT NULL
)
RETURNS TABLE (
  stage_id text,
  stage_label text,
  stage_order int,
  metric_count numeric,
  metric_value numeric,
  prev_metric_count numeric,
  prev_metric_value numeric,
  delta_pct numeric,
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
  v_from_d date := p_from::date;
  v_to_d date := p_to::date;
  v_cfrom_d date := p_compare_from::date;
  v_cto_d date := p_compare_to::date;
  v_spend numeric := 0; v_leads numeric := 0; v_appts numeric := 0; v_deals numeric := 0; v_rev numeric := 0;
  p_spend numeric := 0; p_leads numeric := 0; p_appts numeric := 0; p_deals numeric := 0; p_rev numeric := 0;
BEGIN
  v_brands := public._md_authorized_brand_ids(p_brand_ids);
  IF array_length(v_brands, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Current period
  SELECT COALESCE(SUM(spend), 0) INTO v_spend FROM public.ad_platform_stats
  WHERE brand_id = ANY(v_brands) AND stat_date BETWEEN v_from_d AND v_to_d;
  v_spend := v_spend + COALESCE((SELECT SUM(amount) FROM public.marketing_costs
    WHERE brand_id = ANY(v_brands) AND cost_date BETWEEN v_from_d AND v_to_d), 0);

  SELECT COUNT(*) INTO v_leads FROM public.lead_events
  WHERE brand_id = ANY(v_brands) AND archived = false
    AND received_at BETWEEN p_from AND p_to
    AND (p_sources IS NULL OR source::text = ANY(p_sources));

  SELECT COUNT(*) INTO v_appts FROM public.appointments
  WHERE brand_id = ANY(v_brands) AND scheduled_at BETWEEN p_from AND p_to
    AND status NOT IN ('draft','cancelled');

  SELECT COUNT(*), COALESCE(SUM(value), 0) INTO v_deals, v_rev FROM public.deals
  WHERE brand_id = ANY(v_brands) AND status='won'
    AND COALESCE(closed_at, updated_at) BETWEEN p_from AND p_to;

  -- Previous period
  SELECT COALESCE(SUM(spend), 0) INTO p_spend FROM public.ad_platform_stats
  WHERE brand_id = ANY(v_brands) AND stat_date BETWEEN v_cfrom_d AND v_cto_d;
  p_spend := p_spend + COALESCE((SELECT SUM(amount) FROM public.marketing_costs
    WHERE brand_id = ANY(v_brands) AND cost_date BETWEEN v_cfrom_d AND v_cto_d), 0);

  SELECT COUNT(*) INTO p_leads FROM public.lead_events
  WHERE brand_id = ANY(v_brands) AND archived = false
    AND received_at BETWEEN p_compare_from AND p_compare_to
    AND (p_sources IS NULL OR source::text = ANY(p_sources));

  SELECT COUNT(*) INTO p_appts FROM public.appointments
  WHERE brand_id = ANY(v_brands) AND scheduled_at BETWEEN p_compare_from AND p_compare_to
    AND status NOT IN ('draft','cancelled');

  SELECT COUNT(*), COALESCE(SUM(value),0) INTO p_deals, p_rev FROM public.deals
  WHERE brand_id = ANY(v_brands) AND status='won'
    AND COALESCE(closed_at, updated_at) BETWEEN p_compare_from AND p_compare_to;

  RETURN QUERY
  SELECT 'spend'::text,'Spesa'::text,1, v_spend, v_spend, p_spend, p_spend,
    CASE WHEN p_spend>0 THEN ROUND(((v_spend-p_spend)/p_spend)*100,2) ELSE NULL END,
    NULL::numeric, NULL::numeric
  UNION ALL SELECT 'lead','Lead',2, v_leads, v_leads, p_leads, p_leads,
    CASE WHEN p_leads>0 THEN ROUND(((v_leads-p_leads)/p_leads)*100,2) ELSE NULL END,
    NULL::numeric, NULL::numeric
  UNION ALL SELECT 'appointment','Appuntamenti',3, v_appts, v_appts, p_appts, p_appts,
    CASE WHEN p_appts>0 THEN ROUND(((v_appts-p_appts)/p_appts)*100,2) ELSE NULL END,
    CASE WHEN v_leads>0 THEN ROUND((v_appts/v_leads)*100,2) ELSE NULL END,
    CASE WHEN v_leads>0 THEN ROUND(((v_leads-v_appts)/v_leads)*100,2) ELSE NULL END
  UNION ALL SELECT 'deal_won','Vendite',4, v_deals, v_deals, p_deals, p_deals,
    CASE WHEN p_deals>0 THEN ROUND(((v_deals-p_deals)/p_deals)*100,2) ELSE NULL END,
    CASE WHEN v_appts>0 THEN ROUND((v_deals/v_appts)*100,2) ELSE NULL END,
    CASE WHEN v_appts>0 THEN ROUND(((v_appts-v_deals)/v_appts)*100,2) ELSE NULL END
  UNION ALL SELECT 'revenue','Fatturato',5, v_deals, v_rev, p_deals, p_rev,
    CASE WHEN p_rev>0 THEN ROUND(((v_rev-p_rev)/p_rev)*100,2) ELSE NULL END,
    CASE WHEN v_spend>0 THEN ROUND((v_rev/v_spend)*100,2) ELSE NULL END,
    NULL::numeric;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_funnel_overview_compare(uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_funnel_overview_compare(uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_funnel_stage_drill
--  returns top N items composing a single funnel stage
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_funnel_stage_drill(
  p_brand_ids uuid[],
  p_stage_id text,
  p_from timestamptz,
  p_to timestamptz,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  item_id uuid,
  item_label text,
  item_subtitle text,
  item_value numeric,
  item_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brands uuid[];
  v_lim int := LEAST(GREATEST(p_limit, 1), 200);
BEGIN
  v_brands := public._md_authorized_brand_ids(p_brand_ids);
  IF array_length(v_brands, 1) IS NULL THEN
    RETURN;
  END IF;

  IF p_stage_id = 'lead' THEN
    RETURN QUERY
    SELECT le.id, COALESCE(le.full_name, le.email, le.phone, 'Lead')::text,
           COALESCE(le.source::text, 'unknown')::text,
           NULL::numeric, le.received_at
    FROM public.lead_events le
    WHERE le.brand_id = ANY(v_brands) AND le.archived = false
      AND le.received_at BETWEEN p_from AND p_to
    ORDER BY le.received_at DESC
    LIMIT v_lim;
  ELSIF p_stage_id = 'appointment' THEN
    RETURN QUERY
    SELECT a.id, COALESCE(c.first_name || ' ' || c.last_name, 'Appuntamento')::text,
           COALESCE(a.status::text, '')::text,
           NULL::numeric, a.scheduled_at
    FROM public.appointments a
    LEFT JOIN public.contacts c ON c.id = a.contact_id
    WHERE a.brand_id = ANY(v_brands)
      AND a.scheduled_at BETWEEN p_from AND p_to
      AND a.status NOT IN ('draft','cancelled')
    ORDER BY a.scheduled_at DESC
    LIMIT v_lim;
  ELSIF p_stage_id IN ('deal_won','revenue') THEN
    RETURN QUERY
    SELECT d.id, COALESCE(d.title, 'Deal')::text,
           COALESCE(c.first_name || ' ' || c.last_name, '')::text,
           d.value, COALESCE(d.closed_at, d.updated_at)
    FROM public.deals d
    LEFT JOIN public.contacts c ON c.id = d.contact_id
    WHERE d.brand_id = ANY(v_brands) AND d.status = 'won'
      AND COALESCE(d.closed_at, d.updated_at) BETWEEN p_from AND p_to
    ORDER BY COALESCE(d.closed_at, d.updated_at) DESC
    LIMIT v_lim;
  ELSIF p_stage_id = 'spend' THEN
    RETURN QUERY
    SELECT aps.id, COALESCE(aps.platform::text || ' · ' || aps.campaign_name, aps.platform::text)::text,
           aps.stat_date::text, aps.spend, aps.stat_date::timestamptz
    FROM public.ad_platform_stats aps
    WHERE aps.brand_id = ANY(v_brands)
      AND aps.stat_date BETWEEN p_from::date AND p_to::date
      AND aps.spend > 0
    ORDER BY aps.stat_date DESC, aps.spend DESC
    LIMIT v_lim;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_funnel_stage_drill(uuid[],text,timestamptz,timestamptz,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_funnel_stage_drill(uuid[],text,timestamptz,timestamptz,int) TO authenticated;