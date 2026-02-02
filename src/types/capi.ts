// Meta Conversions API Types

export type MetaCapiStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';

export interface MetaCapiEvent {
  id: string;
  brand_id: string;
  meta_app_id: string;
  event_name: string;
  event_id: string;
  event_time: string;
  action_source: string;
  user_data: Record<string, any> | null;
  custom_data: Record<string, any> | null;
  contact_id: string | null;
  deal_id: string | null;
  lead_event_id: string | null;
  consent_snapshot: boolean;
  status: MetaCapiStatus;
  processing_at: string | null;
  processing_by: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ContactTracking {
  id: string;
  brand_id: string;
  contact_id: string;
  fbp: string | null;
  fbc: string | null;
  gclid: string | null;
  wbraid: string | null;
  gbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  client_ip: string | null;
  client_user_agent: string | null;
  first_touch_source: string | null;
  first_touch_at: string | null;
  last_touch_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaAppCapiConfig {
  pixel_id: string | null;
  capi_token_key: string | null;
  capi_enabled: boolean;
  capi_test_event_code: string | null;
}
