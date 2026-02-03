// M14 - Predictive Intelligence Types

export type DealRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface DealScoreFactor {
  factor: string;
  impact: number;
  detail: string;
}

export interface DealScore {
  id: string;
  deal_id: string;
  brand_id: string;
  score: number;
  risk_level: DealRiskLevel;
  factors: DealScoreFactor[];
  score_date: string;
  calculated_at: string;
}

export interface Forecast {
  id: string;
  brand_id: string;
  forecast_type: 'revenue' | 'deals' | 'tickets' | 'margin';
  period_start: string;
  period_end: string;
  predicted_value: number;
  predicted_min: number | null;
  predicted_max: number | null;
  confidence_level: number;
  model_version: string;
  factors: ForecastFactor[];
  created_at: string;
}

export interface ForecastFactor {
  factor: string;
  value: number;
  detail: string;
}

export interface ForecastResult {
  period: string;
  period_start: string;
  period_end: string;
  predicted_revenue: number;
  confidence: number;
  range: {
    min: number;
    max: number;
  };
  breakdown: {
    from_open_deals: number;
    from_historical_trend: number;
  };
  comparison: {
    vs_last_period: number | null;
    vs_same_period_last_year: number | null;
    prev_period_actual?: number;
    same_period_last_year_actual?: number;
  };
  factors: ForecastFactor[];
  generated_at: string;
}

export type SuggestionType = 
  | 'call_now' 
  | 'offer_discount' 
  | 'send_followup' 
  | 'change_channel'
  | 'archive' 
  | 'reassign' 
  | 'escalate' 
  | 'schedule_meeting' 
  | 'update_notes';

export interface ActionSuggestion {
  id: string;
  brand_id: string;
  user_id: string | null;
  entity_type: 'deal' | 'contact' | 'ticket' | 'appointment';
  entity_id: string;
  suggestion_type: SuggestionType;
  title: string;
  description: string | null;
  priority: number;
  confidence: number;
  metadata: Record<string, unknown>;
  expires_at: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  acted_on_at: string | null;
  acted_on_by: string | null;
  created_at: string;
}

export type AutomationTriggerType = 
  | 'deal_stale' 
  | 'stage_enter' 
  | 'stage_exit' 
  | 'score_threshold'
  | 'time_based' 
  | 'sla_warning' 
  | 'appointment_reminder';

export type AutomationActionType = 
  | 'move_stage' 
  | 'create_reminder' 
  | 'suggest_action' 
  | 'notify'
  | 'create_task' 
  | 'update_priority' 
  | 'send_email';

export interface AutomationRule {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  is_active: boolean;
  requires_confirmation: boolean;
  execution_count: number;
  last_executed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AutomationLogStatus = 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed';

export interface AutomationLog {
  id: string;
  rule_id: string | null;
  brand_id: string;
  entity_type: string;
  entity_id: string;
  action_taken: string;
  action_details: Record<string, unknown>;
  status: AutomationLogStatus;
  confirmed_by: string | null;
  confirmed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface ExecutiveReport {
  id: string;
  brand_id: string;
  report_type: 'daily' | 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  content_markdown: string;
  content_plain: string | null;
  metrics_snapshot: Record<string, unknown>;
  confidence: number;
  generated_by: string;
  sent_to: string[];
  sent_at: string | null;
  created_at: string;
}

// Extended salesperson KPI with M14 metrics
export interface SalespersonKpiExtended {
  user_id: string;
  full_name: string | null;
  email: string;
  role: string;
  deals_open: number;
  deals_won: number;
  deals_lost: number;
  deals_closed: number;
  total_value_won: number;
  win_rate: number;
  avg_days_to_close: number;
  last_activity_at: string | null;
  // M14 additions
  stress_score?: number;
  focus_score?: number;
  efficiency_score?: number;
  deal_velocity_trend?: string;
  suggested_capacity?: number;
  current_load?: number;
  overloaded?: boolean;
}

export interface AlertThresholds {
  salesperson_capacity: number;
  deal_stale_days: number;
  deal_stale_hot_days: number;
  campaign_loss_days: number;
  margin_decline_percent: number;
  sla_warning_percent: number;
}
