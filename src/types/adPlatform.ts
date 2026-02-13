// Ad Platform Stats Types

export type AdPlatform = 'meta' | 'google';
export type AdPlatformType = 'meta' | 'google' | 'tiktok' | 'linkedin' | 'other';

export interface AdPlatformStat {
  id: string;
  brand_id: string;
  campaign_id: string | null;
  platform: AdPlatform;
  account_id: string;
  external_campaign_id: string;
  external_campaign_name: string | null;
  stat_date: string;
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  conversions: number | null;
  conversions_value: number | null;
  raw_data: Record<string, unknown> | null;
  imported_at: string;
  created_at: string;
}

export interface AdPlatformStatAggregated {
  external_campaign_id: string;
  external_campaign_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  platform: AdPlatform;
  brand_id: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number | null;
  total_reach: number;
  avg_frequency: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  days_count: number;
}

export interface AdPlatformStatTrend {
  stat_date: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_reach: number;
}

export interface AdPlatformStatSummary {
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  total_reach: number;
  avg_frequency: number | null;
  avg_ctr: number | null;
  avg_cpm: number | null;
  avg_cpc: number | null;
  last_import: string | null;
}

export interface AdCreativeStat {
  external_ad_id: string;
  external_ad_name: string | null;
  external_campaign_id: string;
  external_campaign_name: string | null;
  thumbnail_url: string | null;
  platform: AdPlatform;
  brand_id: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_reach: number;
  avg_frequency: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  days_count: number;
}
