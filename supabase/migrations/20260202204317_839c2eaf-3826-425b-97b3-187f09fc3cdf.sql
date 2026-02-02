-- ============================================
-- Meta Ads Stats Import MVP - Database Schema
-- ============================================

-- 1. Create ENUM for ad platforms
CREATE TYPE public.ad_platform AS ENUM ('meta', 'google');
CREATE TYPE public.ad_platform_type AS ENUM ('meta', 'google', 'tiktok', 'linkedin', 'other');

-- 2. Create ad_platform_stats table
CREATE TABLE public.ad_platform_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  platform public.ad_platform NOT NULL,
  account_id TEXT NOT NULL,
  external_campaign_id TEXT NOT NULL,
  external_campaign_name TEXT,
  stat_date DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions NUMERIC,
  conversions_value NUMERIC,
  raw_data JSONB,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique constraint for upsert idempotency
  CONSTRAINT ad_platform_stats_unique UNIQUE (brand_id, platform, account_id, external_campaign_id, stat_date)
);

-- 3. Create indexes for performance
CREATE INDEX idx_ad_platform_stats_brand_date ON public.ad_platform_stats(brand_id, stat_date);
CREATE INDEX idx_ad_platform_stats_brand_platform_date ON public.ad_platform_stats(brand_id, platform, stat_date);
CREATE INDEX idx_ad_platform_stats_campaign ON public.ad_platform_stats(campaign_id) WHERE campaign_id IS NOT NULL;

-- 4. Enable RLS
ALTER TABLE public.ad_platform_stats ENABLE ROW LEVEL SECURITY;

-- 5. Create helper function for marketing access check (if not exists)
CREATE OR REPLACE FUNCTION public.has_marketing_access(p_user_id UUID, p_brand_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    has_role(p_user_id, 'admin'::app_role) OR
    has_role(p_user_id, 'ceo'::app_role) OR
    has_role_for_brand(p_user_id, p_brand_id, 'amministrazione'::app_role) OR
    has_role_for_brand(p_user_id, p_brand_id, 'responsabile_venditori'::app_role) OR
    has_role_for_brand(p_user_id, p_brand_id, 'responsabile_callcenter'::app_role)
$$;

-- 6. RLS policy for SELECT (marketing access roles)
CREATE POLICY "Marketing roles can view ad platform stats"
ON public.ad_platform_stats
FOR SELECT
USING (has_marketing_access(get_user_id(auth.uid()), brand_id));

-- Note: No INSERT/UPDATE/DELETE policies - only service role (edge functions) can write

-- 7. Extend meta_apps table
ALTER TABLE public.meta_apps 
ADD COLUMN IF NOT EXISTS ad_account_id TEXT,
ADD COLUMN IF NOT EXISTS stats_enabled BOOLEAN NOT NULL DEFAULT false;

-- 8. Extend marketing_channels table
ALTER TABLE public.marketing_channels
ADD COLUMN IF NOT EXISTS platform public.ad_platform_type,
ADD COLUMN IF NOT EXISTS channel_subtype TEXT;

-- 9. Extend marketing_campaigns table
ALTER TABLE public.marketing_campaigns
ADD COLUMN IF NOT EXISTS allow_name_fallback BOOLEAN NOT NULL DEFAULT false;

-- 10. Create RPC for aggregated stats
CREATE OR REPLACE FUNCTION public.get_ad_platform_stats(
  p_brand_id UUID,
  p_from DATE,
  p_to DATE,
  p_platform public.ad_platform DEFAULT NULL
)
RETURNS TABLE (
  external_campaign_id TEXT,
  external_campaign_name TEXT,
  campaign_id UUID,
  campaign_name TEXT,
  platform public.ad_platform,
  total_spend NUMERIC,
  total_impressions BIGINT,
  total_clicks BIGINT,
  total_conversions NUMERIC,
  ctr NUMERIC,
  cpm NUMERIC,
  cpc NUMERIC,
  days_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    s.external_campaign_id,
    MAX(s.external_campaign_name) AS external_campaign_name,
    s.campaign_id,
    MAX(mc.name) AS campaign_name,
    s.platform,
    SUM(s.spend) AS total_spend,
    SUM(s.impressions)::BIGINT AS total_impressions,
    SUM(s.clicks)::BIGINT AS total_clicks,
    SUM(COALESCE(s.conversions, 0)) AS total_conversions,
    CASE 
      WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.clicks)::NUMERIC / SUM(s.impressions)) * 100, 2)
      ELSE NULL 
    END AS ctr,
    CASE 
      WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.spend) / SUM(s.impressions)) * 1000, 2)
      ELSE NULL 
    END AS cpm,
    CASE 
      WHEN SUM(s.clicks) > 0 THEN ROUND(SUM(s.spend) / SUM(s.clicks), 2)
      ELSE NULL 
    END AS cpc,
    COUNT(DISTINCT s.stat_date)::INTEGER AS days_count
  FROM public.ad_platform_stats s
  LEFT JOIN public.marketing_campaigns mc ON mc.id = s.campaign_id
  WHERE s.brand_id = p_brand_id
    AND s.stat_date >= p_from
    AND s.stat_date <= p_to
    AND (p_platform IS NULL OR s.platform = p_platform)
    AND has_marketing_access(get_user_id(auth.uid()), p_brand_id)
  GROUP BY s.external_campaign_id, s.campaign_id, s.platform
  ORDER BY total_spend DESC NULLS LAST
$$;

-- 11. Create RPC for daily trend
CREATE OR REPLACE FUNCTION public.get_ad_platform_stats_trend(
  p_brand_id UUID,
  p_from DATE,
  p_to DATE,
  p_platform public.ad_platform DEFAULT NULL
)
RETURNS TABLE (
  stat_date DATE,
  total_spend NUMERIC,
  total_impressions BIGINT,
  total_clicks BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    s.stat_date,
    SUM(s.spend) AS total_spend,
    SUM(s.impressions)::BIGINT AS total_impressions,
    SUM(s.clicks)::BIGINT AS total_clicks
  FROM public.ad_platform_stats s
  WHERE s.brand_id = p_brand_id
    AND s.stat_date >= p_from
    AND s.stat_date <= p_to
    AND (p_platform IS NULL OR s.platform = p_platform)
    AND has_marketing_access(get_user_id(auth.uid()), p_brand_id)
  GROUP BY s.stat_date
  ORDER BY s.stat_date ASC
$$;

-- 12. Create RPC for summary totals
CREATE OR REPLACE FUNCTION public.get_ad_platform_stats_summary(
  p_brand_id UUID,
  p_from DATE,
  p_to DATE,
  p_platform public.ad_platform DEFAULT NULL
)
RETURNS TABLE (
  total_spend NUMERIC,
  total_impressions BIGINT,
  total_clicks BIGINT,
  total_conversions NUMERIC,
  avg_ctr NUMERIC,
  avg_cpm NUMERIC,
  avg_cpc NUMERIC,
  last_import TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    COALESCE(SUM(s.spend), 0) AS total_spend,
    COALESCE(SUM(s.impressions), 0)::BIGINT AS total_impressions,
    COALESCE(SUM(s.clicks), 0)::BIGINT AS total_clicks,
    COALESCE(SUM(s.conversions), 0) AS total_conversions,
    CASE 
      WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.clicks)::NUMERIC / SUM(s.impressions)) * 100, 2)
      ELSE NULL 
    END AS avg_ctr,
    CASE 
      WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.spend) / SUM(s.impressions)) * 1000, 2)
      ELSE NULL 
    END AS avg_cpm,
    CASE 
      WHEN SUM(s.clicks) > 0 THEN ROUND(SUM(s.spend) / SUM(s.clicks), 2)
      ELSE NULL 
    END AS avg_cpc,
    MAX(s.imported_at) AS last_import
  FROM public.ad_platform_stats s
  WHERE s.brand_id = p_brand_id
    AND s.stat_date >= p_from
    AND s.stat_date <= p_to
    AND (p_platform IS NULL OR s.platform = p_platform)
    AND has_marketing_access(get_user_id(auth.uid()), p_brand_id)
$$;