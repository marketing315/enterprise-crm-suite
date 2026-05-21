-- ============================================================================
-- F1 Modulo A — Canali & Costi: viste analitiche + RPC performance
-- mem://features/dashboard-performance/decisions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Vista: v_channel_spend_daily
--    Spesa marketing giorno × brand × canale × cost_kind × campagna × emittente
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_channel_spend_daily CASCADE;
CREATE VIEW public.v_channel_spend_daily
WITH (security_invoker = true)
AS
SELECT
  mc.brand_id,
  mc.cost_date,
  COALESCE(mc.channel_id, mcamp.channel_id, tn.channel_id) AS channel_id,
  mc.campaign_id,
  mc.cost_kind,
  tn.broadcaster,
  mc.tracking_number_id,
  SUM(mc.amount)::numeric(14,2) AS amount
FROM public.marketing_costs mc
LEFT JOIN public.marketing_campaigns mcamp ON mcamp.id = mc.campaign_id
LEFT JOIN public.tracking_numbers tn       ON tn.id   = mc.tracking_number_id
GROUP BY
  mc.brand_id, mc.cost_date,
  COALESCE(mc.channel_id, mcamp.channel_id, tn.channel_id),
  mc.campaign_id, mc.cost_kind, tn.broadcaster, mc.tracking_number_id;

COMMENT ON VIEW public.v_channel_spend_daily IS
  'F1: spesa marketing aggregata per giorno/canale/cost_kind/emittente (security_invoker).';

-- ----------------------------------------------------------------------------
-- 2) Vista: v_lead_cost
--    Per ogni lead attribuito: canale, categoria, costo medio del giorno
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_lead_cost CASCADE;
CREATE VIEW public.v_lead_cost
WITH (security_invoker = true)
AS
WITH lead_day AS (
  SELECT
    lca.brand_id,
    lca.lead_event_id,
    lca.contact_id,
    lca.campaign_id,
    lca.channel_id,
    lca.source_category,
    lca.match_type,
    (le.occurred_at AT TIME ZONE 'Europe/Rome')::date AS lead_date
  FROM public.lead_campaign_attribution lca
  JOIN public.lead_events le ON le.id = lca.lead_event_id
  WHERE le.archived = false
),
channel_day AS (
  SELECT
    brand_id,
    cost_date,
    channel_id,
    SUM(amount)::numeric(14,2) AS spend
  FROM public.v_channel_spend_daily
  WHERE channel_id IS NOT NULL
  GROUP BY brand_id, cost_date, channel_id
),
channel_day_leads AS (
  SELECT
    brand_id, lead_date, channel_id, COUNT(*)::int AS leads
  FROM lead_day
  WHERE channel_id IS NOT NULL
  GROUP BY brand_id, lead_date, channel_id
)
SELECT
  ld.brand_id,
  ld.lead_event_id,
  ld.contact_id,
  ld.lead_date,
  ld.channel_id,
  ld.campaign_id,
  ld.source_category,
  ld.match_type,
  COALESCE(cd.spend, 0)::numeric(14,2)  AS channel_day_spend,
  COALESCE(cdl.leads, 0)::int           AS channel_day_leads,
  CASE
    WHEN COALESCE(cdl.leads, 0) > 0
    THEN (COALESCE(cd.spend, 0) / cdl.leads)::numeric(14,2)
    ELSE NULL
  END AS estimated_lead_cost
FROM lead_day ld
LEFT JOIN channel_day      cd  ON cd.brand_id = ld.brand_id AND cd.cost_date = ld.lead_date AND cd.channel_id = ld.channel_id
LEFT JOIN channel_day_leads cdl ON cdl.brand_id = ld.brand_id AND cdl.lead_date = ld.lead_date AND cdl.channel_id = ld.channel_id;

COMMENT ON VIEW public.v_lead_cost IS
  'F1: costo stimato per lead (spesa canale / lead canale del giorno) — security_invoker.';

-- ----------------------------------------------------------------------------
-- 3) RPC: get_channel_performance
--    KPI per canale nel periodo, con filtro fonte opzionale
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_channel_performance(uuid, date, date, jsonb);

CREATE OR REPLACE FUNCTION public.get_channel_performance(
  p_brand_id      uuid,
  p_from          date,
  p_to            date,
  p_source_filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  channel_id     uuid,
  channel_name   text,
  channel_type   text,
  category       text,
  leads_count    int,
  spend          numeric,
  cpl            numeric,
  deals_count    int,
  deals_won      int,
  revenue        numeric,
  cac            numeric,
  roi            numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := get_user_id(auth.uid());
  v_has_finance  boolean;
  v_cat          text  := NULLIF(p_source_filter->>'category', '');
  v_channel_id   uuid  := NULLIF(p_source_filter->>'channel_id','')::uuid;
  v_campaign_id  uuid  := NULLIF(p_source_filter->>'campaign_id','')::uuid;
  v_group_id     uuid  := NULLIF(p_source_filter->>'group_id','')::uuid;
  v_tn_id        uuid  := NULLIF(p_source_filter->>'tracking_number_id','')::uuid;
BEGIN
  IF p_brand_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'get_channel_performance: brand_id/from/to required' USING ERRCODE = '22023';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION 'get_channel_performance: invalid range' USING ERRCODE = '22023';
  END IF;

  v_has_finance := public.has_finance_access(v_uid, p_brand_id);
  IF NOT v_has_finance THEN
    RAISE EXCEPTION 'access denied: finance role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH leads_agg AS (
    SELECT
      lc.channel_id,
      COUNT(*)::int AS leads_count
    FROM public.v_lead_cost lc
    WHERE lc.brand_id = p_brand_id
      AND lc.lead_date BETWEEN p_from AND p_to
      AND (v_cat        IS NULL OR lc.source_category = v_cat)
      AND (v_channel_id IS NULL OR lc.channel_id     = v_channel_id)
      AND (v_campaign_id IS NULL OR lc.campaign_id   = v_campaign_id)
    GROUP BY lc.channel_id
  ),
  spend_agg AS (
    SELECT
      s.channel_id,
      SUM(s.amount)::numeric(14,2) AS spend
    FROM public.v_channel_spend_daily s
    WHERE s.brand_id = p_brand_id
      AND s.cost_date BETWEEN p_from AND p_to
      AND (v_channel_id IS NULL OR s.channel_id = v_channel_id)
      AND (v_campaign_id IS NULL OR s.campaign_id = v_campaign_id)
      AND (v_tn_id      IS NULL OR s.tracking_number_id = v_tn_id)
    GROUP BY s.channel_id
  ),
  deals_agg AS (
    SELECT
      lca.channel_id,
      COUNT(DISTINCT d.id)::int                                   AS deals_count,
      COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'won')::int   AS deals_won,
      COALESCE(SUM(d.value) FILTER (WHERE d.status = 'won'), 0)::numeric(14,2) AS revenue
    FROM public.lead_campaign_attribution lca
    JOIN public.lead_events le ON le.id = lca.lead_event_id
    JOIN public.deals d         ON d.contact_id = lca.contact_id AND d.brand_id = lca.brand_id
    WHERE lca.brand_id = p_brand_id
      AND (le.occurred_at AT TIME ZONE 'Europe/Rome')::date BETWEEN p_from AND p_to
      AND (v_cat         IS NULL OR lca.source_category = v_cat)
      AND (v_channel_id  IS NULL OR lca.channel_id      = v_channel_id)
      AND (v_campaign_id IS NULL OR lca.campaign_id     = v_campaign_id)
    GROUP BY lca.channel_id
  )
  SELECT
    ch.id                                        AS channel_id,
    ch.name                                      AS channel_name,
    ch.type                                      AS channel_type,
    COALESCE(ch.channel_subtype, ch.type)        AS category,
    COALESCE(la.leads_count, 0)                  AS leads_count,
    COALESCE(sa.spend, 0)::numeric(14,2)         AS spend,
    CASE WHEN COALESCE(la.leads_count,0) > 0
         THEN (COALESCE(sa.spend,0) / la.leads_count)::numeric(14,2)
         ELSE NULL END                           AS cpl,
    COALESCE(da.deals_count, 0)                  AS deals_count,
    COALESCE(da.deals_won, 0)                    AS deals_won,
    COALESCE(da.revenue, 0)::numeric(14,2)       AS revenue,
    CASE WHEN COALESCE(da.deals_won,0) > 0
         THEN (COALESCE(sa.spend,0) / da.deals_won)::numeric(14,2)
         ELSE NULL END                           AS cac,
    CASE WHEN COALESCE(sa.spend,0) > 0
         THEN ((COALESCE(da.revenue,0) - sa.spend) / sa.spend)::numeric(14,4)
         ELSE NULL END                           AS roi
  FROM public.marketing_channels ch
  LEFT JOIN leads_agg la ON la.channel_id = ch.id
  LEFT JOIN spend_agg sa ON sa.channel_id = ch.id
  LEFT JOIN deals_agg da ON da.channel_id = ch.id
  WHERE ch.brand_id = p_brand_id
    AND ch.is_active = true
    AND (v_channel_id IS NULL OR ch.id = v_channel_id)
    AND (
      COALESCE(la.leads_count,0) > 0
      OR COALESCE(sa.spend,0)    > 0
      OR COALESCE(da.deals_count,0) > 0
    )
  ORDER BY spend DESC NULLS LAST, leads_count DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_channel_performance(uuid, date, date, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_channel_performance(uuid, date, date, jsonb) TO authenticated;

COMMENT ON FUNCTION public.get_channel_performance(uuid, date, date, jsonb) IS
  'F1: KPI canale (leads/spend/CPL/deals/won/revenue/CAC/ROI) — richiede has_finance_access.';
