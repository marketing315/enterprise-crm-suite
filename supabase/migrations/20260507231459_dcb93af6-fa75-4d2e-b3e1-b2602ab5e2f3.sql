-- =============================================
-- A) ad_platform_adset_stats
-- =============================================
CREATE TABLE IF NOT EXISTS public.ad_platform_adset_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  platform public.ad_platform NOT NULL,
  account_id text NOT NULL,
  external_campaign_id text NOT NULL,
  external_campaign_name text,
  external_adset_id text NOT NULL,
  external_adset_name text,
  stat_date date NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  spend numeric NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  reach integer DEFAULT 0,
  frequency numeric(8,2) DEFAULT 0,
  conversions numeric,
  raw_data jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_platform_adset_stats_unique UNIQUE
    (brand_id, platform, account_id, external_adset_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_ad_adset_stats_brand_date
  ON public.ad_platform_adset_stats (brand_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_ad_adset_stats_brand_campaign
  ON public.ad_platform_adset_stats (brand_id, external_campaign_id, stat_date);

ALTER TABLE public.ad_platform_adset_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketing roles can view ad adset stats"
  ON public.ad_platform_adset_stats
  FOR SELECT
  USING (public.has_marketing_access(public.get_user_id(auth.uid()), brand_id));

-- =============================================
-- B) get_ad_adset_stats — aggregato per adset
-- =============================================
CREATE OR REPLACE FUNCTION public.get_ad_adset_stats(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_platform public.ad_platform DEFAULT NULL,
  p_campaign_external_id text DEFAULT NULL
)
RETURNS TABLE (
  external_adset_id text,
  external_adset_name text,
  external_campaign_id text,
  external_campaign_name text,
  platform public.ad_platform,
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_reach bigint,
  avg_frequency numeric,
  total_conversions numeric,
  total_leads bigint,
  cpl numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := public.get_user_id(auth.uid());
BEGIN
  IF NOT public.has_marketing_access(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.external_adset_id,
      s.external_adset_name,
      s.external_campaign_id,
      s.external_campaign_name,
      s.platform,
      s.spend,
      s.impressions,
      s.clicks,
      s.reach,
      s.frequency,
      s.conversions
    FROM public.ad_platform_adset_stats s
    WHERE s.brand_id = p_brand_id
      AND s.stat_date BETWEEN p_from AND p_to
      AND (p_platform IS NULL OR s.platform = p_platform)
      AND (p_campaign_external_id IS NULL OR s.external_campaign_id = p_campaign_external_id)
  ),
  leads AS (
    SELECT
      (le.raw_payload->>'adset_id')::text AS external_adset_id,
      COUNT(*)::bigint AS lead_count
    FROM public.lead_events le
    WHERE le.brand_id = p_brand_id
      AND le.received_at::date BETWEEN p_from AND p_to
      AND le.raw_payload ? 'adset_id'
    GROUP BY 1
  )
  SELECT
    b.external_adset_id,
    MAX(b.external_adset_name) AS external_adset_name,
    b.external_campaign_id,
    MAX(b.external_campaign_name) AS external_campaign_name,
    b.platform,
    COALESCE(SUM(b.spend), 0)::numeric AS total_spend,
    COALESCE(SUM(b.impressions), 0)::bigint AS total_impressions,
    COALESCE(SUM(b.clicks), 0)::bigint AS total_clicks,
    COALESCE(SUM(b.reach), 0)::bigint AS total_reach,
    CASE WHEN SUM(b.impressions) > 0
         THEN ROUND(SUM(b.spend * b.frequency) / NULLIF(SUM(b.impressions),0), 2)
         ELSE 0 END AS avg_frequency,
    COALESCE(SUM(b.conversions), 0)::numeric AS total_conversions,
    COALESCE(MAX(l.lead_count), 0)::bigint AS total_leads,
    CASE WHEN COALESCE(MAX(l.lead_count),0) > 0
         THEN ROUND(SUM(b.spend) / MAX(l.lead_count), 2)
         ELSE NULL END AS cpl
  FROM base b
  LEFT JOIN leads l ON l.external_adset_id = b.external_adset_id
  GROUP BY b.external_adset_id, b.external_campaign_id, b.platform
  ORDER BY total_spend DESC
  LIMIT 500;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ad_adset_stats(uuid, date, date, public.ad_platform, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ad_adset_stats(uuid, date, date, public.ad_platform, text) TO authenticated;

-- =============================================
-- C) set_lead_event_campaign — attribuzione manuale
-- =============================================
CREATE OR REPLACE FUNCTION public.set_lead_event_campaign(
  p_event_id uuid,
  p_campaign_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := public.get_user_id(auth.uid());
  v_brand_id uuid;
  v_old_campaign uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT brand_id, marketing_campaign_id
    INTO v_brand_id, v_old_campaign
  FROM public.lead_events
  WHERE id = p_event_id;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'lead_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_marketing_access(v_user_id, v_brand_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- rate limit (60 attempts / 15 min) per user
  PERFORM public.consume_critical_rate_limit(
    v_user_id::text,
    'set_lead_event_campaign',
    60,
    15,
    5
  );

  -- if a campaign is provided, ensure it belongs to the same brand
  IF p_campaign_id IS NOT NULL THEN
    PERFORM 1 FROM public.marketing_campaigns
      WHERE id = p_campaign_id AND brand_id = v_brand_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'campaign_brand_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.lead_events
     SET marketing_campaign_id = p_campaign_id
   WHERE id = p_event_id;

  -- audit
  PERFORM public.log_audit_event(
    'lead_event',
    'campaign_attribution_changed',
    v_brand_id,
    p_event_id,
    jsonb_build_object('marketing_campaign_id', v_old_campaign),
    jsonb_build_object('marketing_campaign_id', p_campaign_id),
    jsonb_build_object('changed_by', v_user_id),
    'manual',
    NULL,
    NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_lead_event_campaign(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lead_event_campaign(uuid, uuid) TO authenticated;