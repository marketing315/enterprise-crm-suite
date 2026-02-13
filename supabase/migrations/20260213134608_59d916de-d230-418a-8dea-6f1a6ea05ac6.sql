
-- Table for ad-level (creative) stats from Meta/Google
CREATE TABLE public.ad_creative_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id),
  platform public.ad_platform NOT NULL DEFAULT 'meta',
  account_id TEXT NOT NULL,
  external_campaign_id TEXT NOT NULL,
  external_campaign_name TEXT,
  external_ad_id TEXT NOT NULL,
  external_ad_name TEXT,
  thumbnail_url TEXT,
  stat_date DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  reach INTEGER DEFAULT 0,
  frequency NUMERIC DEFAULT 0,
  conversions INTEGER DEFAULT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, platform, account_id, external_ad_id, stat_date)
);

ALTER TABLE public.ad_creative_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ad creative stats for their brands"
  ON public.ad_creative_stats FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE INDEX idx_ad_creative_stats_brand_date ON public.ad_creative_stats(brand_id, stat_date);
CREATE INDEX idx_ad_creative_stats_campaign ON public.ad_creative_stats(external_campaign_id);

-- RPC to get aggregated creative stats
CREATE OR REPLACE FUNCTION public.get_ad_creative_stats(
  p_brand_ids UUID[],
  p_from_date DATE,
  p_to_date DATE,
  p_platform TEXT DEFAULT NULL,
  p_campaign_id TEXT DEFAULT NULL
)
RETURNS TABLE(
  external_ad_id TEXT,
  external_ad_name TEXT,
  external_campaign_id TEXT,
  external_campaign_name TEXT,
  thumbnail_url TEXT,
  platform TEXT,
  brand_id UUID,
  total_spend NUMERIC,
  total_impressions BIGINT,
  total_clicks BIGINT,
  total_reach BIGINT,
  avg_frequency NUMERIC,
  ctr NUMERIC,
  cpc NUMERIC,
  cpm NUMERIC,
  days_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.external_ad_id,
    MAX(s.external_ad_name) AS external_ad_name,
    s.external_campaign_id,
    MAX(s.external_campaign_name) AS external_campaign_name,
    MAX(s.thumbnail_url) AS thumbnail_url,
    s.platform::TEXT,
    s.brand_id,
    SUM(s.spend) AS total_spend,
    SUM(s.impressions)::BIGINT AS total_impressions,
    SUM(s.clicks)::BIGINT AS total_clicks,
    SUM(COALESCE(s.reach, 0))::BIGINT AS total_reach,
    AVG(s.frequency) AS avg_frequency,
    CASE WHEN SUM(s.impressions) > 0
      THEN ROUND(SUM(s.clicks)::NUMERIC / SUM(s.impressions) * 100, 2) END AS ctr,
    CASE WHEN SUM(s.clicks) > 0
      THEN ROUND(SUM(s.spend) / SUM(s.clicks), 2) END AS cpc,
    CASE WHEN SUM(s.impressions) > 0
      THEN ROUND(SUM(s.spend) / SUM(s.impressions) * 1000, 2) END AS cpm,
    COUNT(DISTINCT s.stat_date) AS days_count
  FROM ad_creative_stats s
  WHERE s.brand_id = ANY(p_brand_ids)
    AND s.stat_date BETWEEN p_from_date AND p_to_date
    AND (p_platform IS NULL OR s.platform::TEXT = p_platform)
    AND (p_campaign_id IS NULL OR s.external_campaign_id = p_campaign_id)
  GROUP BY s.external_ad_id, s.external_campaign_id, s.platform, s.brand_id
  ORDER BY SUM(s.spend) DESC;
$$;
