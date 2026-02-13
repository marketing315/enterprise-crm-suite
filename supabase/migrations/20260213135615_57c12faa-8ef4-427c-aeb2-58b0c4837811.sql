
-- Table for demographic breakdown stats (age/gender) from ad platforms
CREATE TABLE public.ad_demographic_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id),
  platform public.ad_platform NOT NULL DEFAULT 'meta',
  account_id TEXT NOT NULL,
  external_campaign_id TEXT NOT NULL,
  stat_date DATE NOT NULL,
  age_range TEXT NOT NULL,       -- e.g. '18-24', '25-34', '35-44', '45-54', '55-64', '65+'
  gender TEXT NOT NULL,          -- 'male', 'female', 'unknown'
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  reach INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, platform, account_id, external_campaign_id, stat_date, age_range, gender)
);

ALTER TABLE public.ad_demographic_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view demographic stats for their brands"
  ON public.ad_demographic_stats FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE INDEX idx_ad_demo_stats_brand_date ON public.ad_demographic_stats(brand_id, stat_date);

-- RPC: Aggregated demographics by age+gender
CREATE OR REPLACE FUNCTION public.get_ad_demographics(
  p_brand_ids UUID[],
  p_from_date DATE,
  p_to_date DATE,
  p_platform TEXT DEFAULT NULL,
  p_campaign_id TEXT DEFAULT NULL
)
RETURNS TABLE(
  age_range TEXT,
  gender TEXT,
  total_spend NUMERIC,
  total_impressions BIGINT,
  total_clicks BIGINT,
  total_reach BIGINT,
  ctr NUMERIC,
  cpc NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.age_range,
    d.gender,
    SUM(d.spend) AS total_spend,
    SUM(d.impressions)::BIGINT AS total_impressions,
    SUM(d.clicks)::BIGINT AS total_clicks,
    SUM(COALESCE(d.reach, 0))::BIGINT AS total_reach,
    CASE WHEN SUM(d.impressions) > 0
      THEN ROUND(SUM(d.clicks)::NUMERIC / SUM(d.impressions) * 100, 2) END AS ctr,
    CASE WHEN SUM(d.clicks) > 0
      THEN ROUND(SUM(d.spend) / SUM(d.clicks), 2) END AS cpc
  FROM ad_demographic_stats d
  WHERE d.brand_id = ANY(p_brand_ids)
    AND d.stat_date BETWEEN p_from_date AND p_to_date
    AND (p_platform IS NULL OR d.platform::TEXT = p_platform)
    AND (p_campaign_id IS NULL OR d.external_campaign_id = p_campaign_id)
  GROUP BY d.age_range, d.gender
  ORDER BY d.age_range, d.gender;
$$;
