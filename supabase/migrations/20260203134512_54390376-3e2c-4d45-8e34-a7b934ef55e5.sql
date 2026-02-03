-- ============================================
-- M14: INTELLIGENZA PREDITTIVA & AUTOMAZIONE
-- ============================================

-- 1. Deal Scores History Table (with explicit date column for uniqueness)
CREATE TABLE deal_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  factors jsonb NOT NULL DEFAULT '[]',
  score_date date NOT NULL DEFAULT CURRENT_DATE,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(deal_id, score_date)
);

-- 2. Add scoring columns to deals
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS deal_score integer CHECK (deal_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS deal_risk_level text CHECK (deal_risk_level IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS score_updated_at timestamptz;

-- 3. Forecasts Table
CREATE TABLE forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  forecast_type text NOT NULL CHECK (forecast_type IN ('revenue', 'deals', 'tickets', 'margin')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  predicted_value numeric(14,2) NOT NULL,
  predicted_min numeric(14,2),
  predicted_max numeric(14,2),
  confidence_level numeric(4,3) NOT NULL CHECK (confidence_level BETWEEN 0 AND 1),
  model_version text NOT NULL DEFAULT 'v1',
  factors jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, forecast_type, period_start, period_end)
);

-- 4. Action Suggestions Table
CREATE TABLE action_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  entity_type text NOT NULL CHECK (entity_type IN ('deal', 'contact', 'ticket', 'appointment')),
  entity_id uuid NOT NULL,
  suggestion_type text NOT NULL CHECK (suggestion_type IN (
    'call_now', 'offer_discount', 'send_followup', 'change_channel',
    'archive', 'reassign', 'escalate', 'schedule_meeting', 'update_notes'
  )),
  title text NOT NULL,
  description text,
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  metadata jsonb DEFAULT '{}',
  expires_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES users(id),
  acted_on_at timestamptz,
  acted_on_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Automation Rules Table
CREATE TABLE automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'deal_stale', 'stage_enter', 'stage_exit', 'score_threshold',
    'time_based', 'sla_warning', 'appointment_reminder'
  )),
  trigger_config jsonb NOT NULL DEFAULT '{}',
  action_type text NOT NULL CHECK (action_type IN (
    'move_stage', 'create_reminder', 'suggest_action', 'notify',
    'create_task', 'update_priority', 'send_email'
  )),
  action_config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  requires_confirmation boolean NOT NULL DEFAULT true,
  execution_count integer NOT NULL DEFAULT 0,
  last_executed_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Automation Logs Table
CREATE TABLE automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES automation_rules(id) ON DELETE SET NULL,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action_taken text NOT NULL,
  action_details jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'executed', 'failed')),
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Executive Reports Table
CREATE TABLE executive_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  report_type text NOT NULL DEFAULT 'weekly' CHECK (report_type IN ('daily', 'weekly', 'monthly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  content_markdown text NOT NULL,
  content_plain text,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}',
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  generated_by text NOT NULL DEFAULT 'system',
  sent_to jsonb DEFAULT '[]',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, report_type, period_start, period_end)
);

-- 8. Add alert_thresholds to brands
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS alert_thresholds jsonb DEFAULT '{
    "salesperson_capacity": 15,
    "deal_stale_days": 7,
    "deal_stale_hot_days": 5,
    "campaign_loss_days": 7,
    "margin_decline_percent": 10,
    "sla_warning_percent": 80
  }';

-- ============================================
-- RLS POLICIES
-- ============================================

-- deal_scores
ALTER TABLE deal_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view deal scores in their brands"
  ON deal_scores FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- forecasts
ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can view forecasts"
  ON forecasts FOR SELECT
  USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admin CEO can manage forecasts"
  ON forecasts FOR ALL
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo')
  );

-- action_suggestions
ALTER TABLE action_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own or global suggestions"
  ON action_suggestions FOR SELECT
  USING (
    user_id = get_user_id(auth.uid()) OR
    user_id IS NULL OR
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo') OR
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori')
  );

CREATE POLICY "Users can update own suggestions"
  ON action_suggestions FOR UPDATE
  USING (
    user_id = get_user_id(auth.uid()) OR
    user_id IS NULL OR
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin')
  );

-- automation_rules
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin CEO can manage automation rules"
  ON automation_rules FOR ALL
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo')
  );

CREATE POLICY "Users can view automation rules"
  ON automation_rules FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- automation_logs
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view automation logs"
  ON automation_logs FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can update pending automation logs"
  ON automation_logs FOR UPDATE
  USING (
    user_belongs_to_brand(get_user_id(auth.uid()), brand_id) AND
    status = 'pending'
  );

-- executive_reports
ALTER TABLE executive_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin CEO can view executive reports"
  ON executive_reports FOR SELECT
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo')
  );

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_deal_scores_deal_id ON deal_scores(deal_id);
CREATE INDEX idx_deal_scores_brand_date ON deal_scores(brand_id, score_date DESC);
CREATE INDEX idx_forecasts_brand_type ON forecasts(brand_id, forecast_type);
CREATE INDEX idx_action_suggestions_user ON action_suggestions(user_id, created_at DESC) WHERE dismissed_at IS NULL;
CREATE INDEX idx_action_suggestions_entity ON action_suggestions(entity_type, entity_id);
CREATE INDEX idx_automation_logs_status ON automation_logs(status) WHERE status = 'pending';
CREATE INDEX idx_executive_reports_brand ON executive_reports(brand_id, period_start DESC);

-- ============================================
-- RPC: CALCULATE DEAL SCORES
-- ============================================

CREATE OR REPLACE FUNCTION calculate_deal_scores(p_brand_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal RECORD;
  v_score INTEGER;
  v_risk_level TEXT;
  v_factors JSONB;
  v_count INTEGER := 0;
  v_avg_days_in_stage NUMERIC;
  v_days_in_current_stage INTEGER;
  v_last_interaction_days INTEGER;
  v_salesperson_win_rate NUMERIC;
  v_avg_deal_value NUMERIC;
  v_stage_progression_score INTEGER;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Get average days in stage for reference
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(d.closed_at, now()) - d.created_at)) / 86400), 30)
  INTO v_avg_days_in_stage
  FROM deals d
  WHERE (p_brand_id IS NULL OR d.brand_id = p_brand_id)
    AND d.status = 'won';

  -- Get average deal value
  SELECT COALESCE(AVG(value), 1000)
  INTO v_avg_deal_value
  FROM deals
  WHERE (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND status = 'won'
    AND value IS NOT NULL;

  -- Process each open deal
  FOR v_deal IN 
    SELECT 
      d.id,
      d.brand_id,
      d.value,
      d.assigned_user_id,
      d.current_stage_id,
      d.created_at,
      d.updated_at,
      ps.order_index as stage_order,
      (SELECT MAX(order_index) FROM pipeline_stages WHERE brand_id = d.brand_id AND is_active = true) as max_stage
    FROM deals d
    LEFT JOIN pipeline_stages ps ON d.current_stage_id = ps.id
    WHERE d.status = 'open'
      AND (p_brand_id IS NULL OR d.brand_id = p_brand_id)
  LOOP
    v_score := 50; -- Base score
    v_factors := '[]'::jsonb;

    -- Factor 1: Days in current stage
    SELECT EXTRACT(DAY FROM (now() - COALESCE(
      (SELECT MAX(changed_at) FROM deal_stage_history WHERE deal_id = v_deal.id),
      v_deal.created_at
    )))::INTEGER INTO v_days_in_current_stage;
    
    IF v_days_in_current_stage > v_avg_days_in_stage THEN
      v_score := v_score - LEAST(20, (v_days_in_current_stage - v_avg_days_in_stage)::INTEGER * 2);
      v_factors := v_factors || jsonb_build_object(
        'factor', 'days_in_stage',
        'impact', -LEAST(20, (v_days_in_current_stage - v_avg_days_in_stage)::INTEGER * 2),
        'detail', format('%s giorni in fase attuale', v_days_in_current_stage)
      );
    ELSE
      v_score := v_score + 5;
      v_factors := v_factors || jsonb_build_object(
        'factor', 'days_in_stage',
        'impact', 5,
        'detail', 'Progressione nella norma'
      );
    END IF;

    -- Factor 2: Last interaction recency
    SELECT COALESCE(
      EXTRACT(DAY FROM (now() - MAX(created_at)))::INTEGER,
      30
    ) INTO v_last_interaction_days
    FROM (
      SELECT created_at FROM call_logs WHERE deal_id = v_deal.id
      UNION ALL
      SELECT created_at FROM chat_messages cm
      JOIN chat_threads ct ON cm.thread_id = ct.id
      WHERE ct.entity_type = 'deal' AND ct.entity_id = v_deal.id
      UNION ALL
      SELECT created_at FROM appointments WHERE deal_id = v_deal.id
    ) interactions;

    IF v_last_interaction_days <= 3 THEN
      v_score := v_score + 15;
      v_factors := v_factors || jsonb_build_object('factor', 'interaction_recency', 'impact', 15, 'detail', 'Interazione recente');
    ELSIF v_last_interaction_days <= 7 THEN
      v_score := v_score + 5;
      v_factors := v_factors || jsonb_build_object('factor', 'interaction_recency', 'impact', 5, 'detail', format('Ultima interazione %s giorni fa', v_last_interaction_days));
    ELSE
      v_score := v_score - 10;
      v_factors := v_factors || jsonb_build_object('factor', 'interaction_recency', 'impact', -10, 'detail', format('Nessuna interazione da %s giorni', v_last_interaction_days));
    END IF;

    -- Factor 3: Salesperson win rate
    IF v_deal.assigned_user_id IS NOT NULL THEN
      SELECT COALESCE(
        (COUNT(*) FILTER (WHERE status = 'won')::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE status IN ('won', 'lost')), 0)) * 100,
        50
      ) INTO v_salesperson_win_rate
      FROM deals
      WHERE assigned_user_id = v_deal.assigned_user_id
        AND brand_id = v_deal.brand_id
        AND closed_at >= now() - INTERVAL '90 days';

      IF v_salesperson_win_rate >= 70 THEN
        v_score := v_score + 10;
        v_factors := v_factors || jsonb_build_object('factor', 'salesperson_performance', 'impact', 10, 'detail', format('Win rate: %.0f%%', v_salesperson_win_rate));
      ELSIF v_salesperson_win_rate >= 50 THEN
        v_score := v_score + 5;
        v_factors := v_factors || jsonb_build_object('factor', 'salesperson_performance', 'impact', 5, 'detail', format('Win rate: %.0f%%', v_salesperson_win_rate));
      ELSE
        v_score := v_score - 5;
        v_factors := v_factors || jsonb_build_object('factor', 'salesperson_performance', 'impact', -5, 'detail', format('Win rate basso: %.0f%%', v_salesperson_win_rate));
      END IF;
    END IF;

    -- Factor 4: Deal value vs average
    IF v_deal.value IS NOT NULL AND v_deal.value > v_avg_deal_value THEN
      v_score := v_score + 8;
      v_factors := v_factors || jsonb_build_object('factor', 'deal_value', 'impact', 8, 'detail', 'Valore sopra la media');
    END IF;

    -- Factor 5: Stage progression
    IF v_deal.stage_order IS NOT NULL AND v_deal.max_stage IS NOT NULL AND v_deal.max_stage > 0 THEN
      v_stage_progression_score := ((v_deal.stage_order::NUMERIC / v_deal.max_stage) * 15)::INTEGER;
      v_score := v_score + v_stage_progression_score;
      v_factors := v_factors || jsonb_build_object('factor', 'stage_progression', 'impact', v_stage_progression_score, 'detail', format('Fase %s di %s', v_deal.stage_order, v_deal.max_stage));
    END IF;

    -- Clamp score
    v_score := GREATEST(0, LEAST(100, v_score));

    -- Risk level
    v_risk_level := CASE
      WHEN v_score >= 70 THEN 'low'
      WHEN v_score >= 50 THEN 'medium'
      WHEN v_score >= 30 THEN 'high'
      ELSE 'critical'
    END;

    -- Update deal
    UPDATE deals SET deal_score = v_score, deal_risk_level = v_risk_level, score_updated_at = now() WHERE id = v_deal.id;

    -- Insert/update score history
    INSERT INTO deal_scores (deal_id, brand_id, score, risk_level, factors, score_date)
    VALUES (v_deal.id, v_deal.brand_id, v_score, v_risk_level, v_factors, v_today)
    ON CONFLICT (deal_id, score_date) DO UPDATE SET score = EXCLUDED.score, risk_level = EXCLUDED.risk_level, factors = EXCLUDED.factors, calculated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================
-- RPC: GET REVENUE FORECAST
-- ============================================

CREATE OR REPLACE FUNCTION get_revenue_forecast(p_brand_id UUID, p_period TEXT DEFAULT 'month')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_period_start DATE;
  v_period_end DATE;
  v_predicted_from_deals NUMERIC := 0;
  v_predicted_from_history NUMERIC := 0;
  v_total_predicted NUMERIC;
  v_confidence NUMERIC;
  v_prev_period_revenue NUMERIC;
  v_same_period_last_year NUMERIC;
  v_factors JSONB := '[]';
  v_deal_count INTEGER := 0;
  v_historical_months INTEGER;
  v_stage_contribution NUMERIC;
BEGIN
  IF NOT user_belongs_to_brand(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_period = 'quarter' THEN
    v_period_start := date_trunc('quarter', now())::DATE;
    v_period_end := (date_trunc('quarter', now()) + INTERVAL '3 months - 1 day')::DATE;
    v_historical_months := 12;
  ELSE
    v_period_start := date_trunc('month', now())::DATE;
    v_period_end := (date_trunc('month', now()) + INTERVAL '1 month - 1 day')::DATE;
    v_historical_months := 6;
  END IF;

  -- Calculate from open deals with stage probability
  SELECT COALESCE(SUM(
    d.value * (ps.order_index::NUMERIC / NULLIF(
      (SELECT MAX(order_index) FROM pipeline_stages WHERE brand_id = p_brand_id AND is_active = true), 0
    ) * 0.8)
  ), 0), COUNT(*)
  INTO v_predicted_from_deals, v_deal_count
  FROM deals d
  LEFT JOIN pipeline_stages ps ON d.current_stage_id = ps.id
  WHERE d.brand_id = p_brand_id AND d.status = 'open' AND d.value IS NOT NULL;

  v_factors := v_factors || jsonb_build_object('factor', 'open_deals', 'value', v_predicted_from_deals, 'detail', format('%s deal aperti', v_deal_count));

  -- Historical average
  SELECT COALESCE(AVG(monthly_revenue), 0) INTO v_predicted_from_history
  FROM (
    SELECT date_trunc('month', closed_at) as month, SUM(value) as monthly_revenue
    FROM deals WHERE brand_id = p_brand_id AND status = 'won' AND value IS NOT NULL AND closed_at >= now() - (v_historical_months || ' months')::INTERVAL
    GROUP BY 1
  ) monthly;

  v_factors := v_factors || jsonb_build_object('factor', 'historical_trend', 'value', v_predicted_from_history, 'detail', format('Media %s mesi', v_historical_months));

  v_total_predicted := (v_predicted_from_deals * 0.6) + (v_predicted_from_history * 0.4);
  v_confidence := LEAST(1.0, CASE WHEN v_deal_count > 5 THEN 0.3 ELSE v_deal_count * 0.06 END + CASE WHEN v_predicted_from_history > 0 THEN 0.4 ELSE 0.1 END + 0.3);

  SELECT COALESCE(SUM(value), 0) INTO v_prev_period_revenue FROM deals
  WHERE brand_id = p_brand_id AND status = 'won' AND closed_at >= v_period_start - (v_period_end - v_period_start + 1) AND closed_at < v_period_start;

  SELECT COALESCE(SUM(value), 0) INTO v_same_period_last_year FROM deals
  WHERE brand_id = p_brand_id AND status = 'won' AND closed_at >= v_period_start - INTERVAL '1 year' AND closed_at < v_period_end - INTERVAL '1 year';

  v_result := jsonb_build_object(
    'period', to_char(v_period_start, 'Month YYYY'),
    'period_start', v_period_start,
    'period_end', v_period_end,
    'predicted_revenue', ROUND(v_total_predicted, 2),
    'confidence', ROUND(v_confidence, 3),
    'range', jsonb_build_object('min', ROUND(v_total_predicted * (1 - (1 - v_confidence) * 0.5), 2), 'max', ROUND(v_total_predicted * (1 + (1 - v_confidence) * 0.5), 2)),
    'breakdown', jsonb_build_object('from_open_deals', ROUND(v_predicted_from_deals, 2), 'from_historical_trend', ROUND(v_predicted_from_history, 2)),
    'comparison', jsonb_build_object(
      'vs_last_period', CASE WHEN v_prev_period_revenue > 0 THEN ROUND(((v_total_predicted - v_prev_period_revenue) / v_prev_period_revenue) * 100, 1) ELSE NULL END,
      'vs_same_period_last_year', CASE WHEN v_same_period_last_year > 0 THEN ROUND(((v_total_predicted - v_same_period_last_year) / v_same_period_last_year) * 100, 1) ELSE NULL END
    ),
    'factors', v_factors,
    'generated_at', now()
  );

  INSERT INTO forecasts (brand_id, forecast_type, period_start, period_end, predicted_value, predicted_min, predicted_max, confidence_level, factors)
  VALUES (p_brand_id, 'revenue', v_period_start, v_period_end, v_total_predicted, v_total_predicted * (1 - (1 - v_confidence) * 0.5), v_total_predicted * (1 + (1 - v_confidence) * 0.5), v_confidence, v_factors)
  ON CONFLICT (brand_id, forecast_type, period_start, period_end) DO UPDATE SET predicted_value = EXCLUDED.predicted_value, predicted_min = EXCLUDED.predicted_min, predicted_max = EXCLUDED.predicted_max, confidence_level = EXCLUDED.confidence_level, factors = EXCLUDED.factors, created_at = now();

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_deal_scores(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_revenue_forecast(UUID, TEXT) TO authenticated;