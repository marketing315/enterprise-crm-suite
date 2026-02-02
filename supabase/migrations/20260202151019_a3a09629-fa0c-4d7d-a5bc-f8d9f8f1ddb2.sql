-- RPC: get_marketing_monthly_trend
-- Returns monthly marketing performance data for the last N months
CREATE OR REPLACE FUNCTION public.get_marketing_monthly_trend(
  p_brand_id uuid,
  p_months_back int DEFAULT 6
)
RETURNS TABLE (
  month date,
  revenue numeric,
  cost numeric,
  leads_count bigint,
  deals_won bigint,
  roi numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_system_brand boolean;
BEGIN
  -- Get the internal user id
  v_user_id := get_user_id(auth.uid());
  
  -- Check if this is the system brand (Azienda Intera)
  v_is_system_brand := (p_brand_id = '00000000-0000-0000-0000-000000000000');
  
  -- Validate brand access
  IF NOT v_is_system_brand AND NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied to brand';
  END IF;

  RETURN QUERY
  WITH months AS (
    -- Generate series of months
    SELECT date_trunc('month', d)::date AS month_start
    FROM generate_series(
      date_trunc('month', now()) - (p_months_back - 1 || ' months')::interval,
      date_trunc('month', now()),
      '1 month'::interval
    ) d
  ),
  monthly_costs AS (
    -- Aggregate marketing costs per month
    SELECT 
      date_trunc('month', mc.cost_date)::date AS month_start,
      COALESCE(SUM(mc.amount), 0) AS total_cost
    FROM marketing_costs mc
    JOIN marketing_campaigns camp ON mc.campaign_id = camp.id
    WHERE (v_is_system_brand OR camp.brand_id = p_brand_id)
      AND mc.cost_date >= date_trunc('month', now()) - (p_months_back || ' months')::interval
    GROUP BY 1
  ),
  monthly_deals AS (
    -- Aggregate won deals and revenue per month (attributed to campaigns)
    SELECT 
      date_trunc('month', d.closed_at)::date AS month_start,
      COUNT(*) AS won_count,
      COALESCE(SUM(d.value), 0) AS total_revenue
    FROM deals d
    WHERE d.status = 'won'
      AND d.closed_at IS NOT NULL
      AND d.marketing_campaign_id IS NOT NULL
      AND (v_is_system_brand OR d.brand_id = p_brand_id)
      AND d.closed_at >= date_trunc('month', now()) - (p_months_back || ' months')::interval
    GROUP BY 1
  ),
  monthly_leads AS (
    -- Count leads (lead_events) per month attributed to marketing
    SELECT 
      date_trunc('month', le.created_at)::date AS month_start,
      COUNT(*) AS lead_count
    FROM lead_events le
    JOIN deals d ON le.deal_id = d.id
    WHERE d.marketing_campaign_id IS NOT NULL
      AND (v_is_system_brand OR le.brand_id = p_brand_id)
      AND le.created_at >= date_trunc('month', now()) - (p_months_back || ' months')::interval
    GROUP BY 1
  )
  SELECT 
    m.month_start AS month,
    COALESCE(md.total_revenue, 0) AS revenue,
    COALESCE(mc.total_cost, 0) AS cost,
    COALESCE(ml.lead_count, 0) AS leads_count,
    COALESCE(md.won_count, 0) AS deals_won,
    CASE 
      WHEN COALESCE(mc.total_cost, 0) = 0 THEN 0
      ELSE ROUND(((COALESCE(md.total_revenue, 0) - COALESCE(mc.total_cost, 0)) / mc.total_cost) * 100, 1)
    END AS roi
  FROM months m
  LEFT JOIN monthly_costs mc ON mc.month_start = m.month_start
  LEFT JOIN monthly_deals md ON md.month_start = m.month_start
  LEFT JOIN monthly_leads ml ON ml.month_start = m.month_start
  ORDER BY m.month_start;
END;
$$;