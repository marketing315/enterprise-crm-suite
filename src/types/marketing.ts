// Marketing Module Types

export type MarketingChannelType = 'paid' | 'organic' | 'offline';

export type MarketingCampaignStatus = 'planned' | 'active' | 'paused' | 'closed';

export interface MarketingChannel {
  id: string;
  brand_id: string;
  name: string;
  type: MarketingChannelType;
  is_active: boolean;
  created_at: string;
}

export interface MarketingCampaign {
  id: string;
  brand_id: string;
  channel_id: string | null;
  name: string;
  external_id: string | null;
  start_date: string;
  end_date: string | null;
  planned_budget: number | null;
  status: MarketingCampaignStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined
  marketing_channels?: MarketingChannel | null;
}

export interface MarketingCost {
  id: string;
  brand_id: string;
  campaign_id: string | null;
  amount: number;
  cost_date: string;
  source: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  // Joined
  marketing_campaigns?: MarketingCampaign | null;
}

export interface MarketingCampaignKpi {
  campaign_id: string;
  campaign_name: string;
  channel_name: string;
  leads_count: number;
  deals_count: number;
  deals_won: number;
  revenue: number;
  marketing_cost: number;
  cpl: number;
  cac: number;
  roi: number;
}

export interface MarketingChannelKpi {
  channel_id: string;
  channel_name: string;
  channel_type: string;
  campaigns_count: number;
  leads_count: number;
  deals_won: number;
  revenue: number;
  marketing_cost: number;
  avg_roi: number;
}

export interface MarketingSummaryKpi {
  total_leads: number;
  total_deals: number;
  total_deals_won: number;
  total_revenue: number;
  total_marketing_cost: number;
  avg_cpl: number;
  avg_cac: number;
  overall_roi: number;
}
