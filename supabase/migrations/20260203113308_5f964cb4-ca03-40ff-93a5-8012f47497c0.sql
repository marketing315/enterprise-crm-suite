-- =====================================================
-- M13: Controllo di Gestione & Intelligenza Decisionale
-- Phase 1: Database Schema & RPC
-- =====================================================

-- 1.1 Create cost_centers table
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for brand_id lookup
CREATE INDEX IF NOT EXISTS idx_cost_centers_brand_id ON public.cost_centers(brand_id);

-- 1.2 Create brand_tax_settings table
CREATE TABLE IF NOT EXISTS public.brand_tax_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  corporate_tax_rate numeric(5,2) NOT NULL DEFAULT 24.0,
  regional_tax_rate numeric(5,2) NOT NULL DEFAULT 3.9,
  vat_rate_default numeric(5,2) NOT NULL DEFAULT 22.0,
  fiscal_year_start integer NOT NULL DEFAULT 1 CHECK (fiscal_year_start BETWEEN 1 AND 12),
  notes text,
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_tax_settings_brand_id_unique UNIQUE (brand_id)
);

-- 1.3 Extend expense_categories table
ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.expense_categories(id),
  ADD COLUMN IF NOT EXISTS category_type text DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS is_deductible boolean NOT NULL DEFAULT true;

-- Add check constraint for category_type (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_categories_category_type_check'
  ) THEN
    ALTER TABLE public.expense_categories
      ADD CONSTRAINT expense_categories_category_type_check
      CHECK (category_type IN ('direct', 'indirect', 'personnel', 'marketing', 'overhead'));
  END IF;
END $$;

-- 1.4 Extend expenses table
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id),
  ADD COLUMN IF NOT EXISTS periodicity text DEFAULT 'one_off',
  ADD COLUMN IF NOT EXISTS recurring_until date,
  ADD COLUMN IF NOT EXISTS is_deductible boolean,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS gross_amount numeric(12,2);

-- Add check constraint for periodicity (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_periodicity_check'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_periodicity_check
      CHECK (periodicity IN ('one_off', 'monthly', 'quarterly', 'yearly'));
  END IF;
END $$;

-- Create index for cost_center_id lookup
CREATE INDEX IF NOT EXISTS idx_expenses_cost_center_id ON public.expenses(cost_center_id);

-- =====================================================
-- RLS Policies
-- =====================================================

-- Enable RLS on cost_centers
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

-- Policy: Finance roles can view cost centers
CREATE POLICY "Finance roles can view cost centers"
  ON public.cost_centers FOR SELECT
  USING (has_finance_access(get_user_id(auth.uid()), brand_id));

-- Policy: Admin/CEO can manage cost centers (INSERT)
CREATE POLICY "Admin CEO can insert cost centers"
  ON public.cost_centers FOR INSERT
  WITH CHECK (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role) OR
    has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  );

-- Policy: Admin/CEO can manage cost centers (UPDATE)
CREATE POLICY "Admin CEO can update cost centers"
  ON public.cost_centers FOR UPDATE
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role) OR
    has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  );

-- Policy: Admin/CEO can manage cost centers (DELETE)
CREATE POLICY "Admin CEO can delete cost centers"
  ON public.cost_centers FOR DELETE
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role) OR
    has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  );

-- Enable RLS on brand_tax_settings
ALTER TABLE public.brand_tax_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Admin/CEO can view tax settings
CREATE POLICY "Admin CEO can view tax settings"
  ON public.brand_tax_settings FOR SELECT
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role) OR
    has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  );

-- Policy: Admin/CEO can insert tax settings
CREATE POLICY "Admin CEO can insert tax settings"
  ON public.brand_tax_settings FOR INSERT
  WITH CHECK (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role) OR
    has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  );

-- Policy: Admin/CEO can update tax settings
CREATE POLICY "Admin CEO can update tax settings"
  ON public.brand_tax_settings FOR UPDATE
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role) OR
    has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  );

-- Policy: Admin/CEO can delete tax settings
CREATE POLICY "Admin CEO can delete tax settings"
  ON public.brand_tax_settings FOR DELETE
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role) OR
    has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  );

-- =====================================================
-- RPC: get_ceo_dashboard_kpis
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_ceo_dashboard_kpis(
  p_brand_id uuid,
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_system_brand boolean;
  v_brand_ids uuid[];
  
  -- Revenue
  v_revenue_total numeric := 0;
  v_revenue_won_deals numeric := 0;
  v_prev_revenue numeric := 0;
  
  -- Costs
  v_costs_total numeric := 0;
  v_costs_direct numeric := 0;
  v_costs_indirect numeric := 0;
  v_costs_personnel numeric := 0;
  v_costs_marketing numeric := 0;
  v_prev_costs numeric := 0;
  v_costs_by_center jsonb := '[]'::jsonb;
  v_costs_by_category jsonb := '[]'::jsonb;
  
  -- Margins
  v_gross_margin numeric := 0;
  v_operating_margin numeric := 0;
  v_gross_margin_percent numeric := 0;
  
  -- Tax settings
  v_tax_settings jsonb := '{}'::jsonb;
  v_corporate_rate numeric := 24.0;
  v_regional_rate numeric := 3.9;
  v_vat_rate numeric := 22.0;
  
  -- Estimated taxes
  v_estimated_vat numeric := 0;
  v_estimated_corporate_tax numeric := 0;
  v_estimated_net_profit numeric := 0;
  
  -- Marketing
  v_marketing_spend numeric := 0;
  v_marketing_roi numeric := 0;
  
  -- Confidence calculation
  v_total_expenses_count integer := 0;
  v_recurring_expenses_count integer := 0;
  v_recurring_ratio numeric := 0;
  v_won_deals_count integer := 0;
  v_confirmed_deals_count integer := 0;
  v_confirmed_ratio numeric := 1;
  v_days_with_data integer := 0;
  v_total_days integer := 0;
  v_period_coverage numeric := 0;
  v_confidence_overall numeric := 0;
  v_confidence_factors jsonb := '[]'::jsonb;
  
  -- Budget baseline
  v_budget_total numeric := 0;
  v_budget_spent numeric := 0;
  v_budget_variance numeric := 0;
  v_budget_variance_pct numeric := 0;
  v_categories_over_budget jsonb := '[]'::jsonb;
  
  -- Alerts
  v_alerts jsonb := '[]'::jsonb;
  v_margin_change numeric := 0;
  v_prev_margin numeric := 0;
  v_avg_margin_3m numeric := 0;
  
  -- Period calculations
  v_period_days integer;
  v_prev_from date;
  v_prev_to date;
BEGIN
  -- Get user ID and validate access
  v_user_id := get_user_id(auth.uid());
  
  IF NOT has_finance_access(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Check if system brand (aggregate all brands)
  v_is_system_brand := (p_brand_id = '00000000-0000-0000-0000-000000000000'::uuid);
  
  IF v_is_system_brand THEN
    SELECT array_agg(id) INTO v_brand_ids
    FROM brands
    WHERE is_system IS NOT TRUE;
  ELSE
    v_brand_ids := ARRAY[p_brand_id];
  END IF;
  
  -- Calculate period info
  v_period_days := p_to - p_from + 1;
  v_prev_from := p_from - v_period_days;
  v_prev_to := p_from - 1;
  v_total_days := v_period_days;
  
  -- =====================================================
  -- REVENUE CALCULATION
  -- =====================================================
  
  -- Revenue from won deals in period
  SELECT COALESCE(SUM(value), 0), COUNT(*)
  INTO v_revenue_won_deals, v_won_deals_count
  FROM deals
  WHERE brand_id = ANY(v_brand_ids)
    AND status = 'won'
    AND closed_at::date BETWEEN p_from AND p_to;
  
  v_revenue_total := v_revenue_won_deals;
  
  -- Confirmed deals (with value set) for confidence
  SELECT COUNT(*)
  INTO v_confirmed_deals_count
  FROM deals
  WHERE brand_id = ANY(v_brand_ids)
    AND status = 'won'
    AND closed_at::date BETWEEN p_from AND p_to
    AND value IS NOT NULL AND value > 0;
  
  v_confirmed_ratio := CASE 
    WHEN v_won_deals_count > 0 THEN v_confirmed_deals_count::numeric / v_won_deals_count 
    ELSE 1 
  END;
  
  -- Previous period revenue
  SELECT COALESCE(SUM(value), 0)
  INTO v_prev_revenue
  FROM deals
  WHERE brand_id = ANY(v_brand_ids)
    AND status = 'won'
    AND closed_at::date BETWEEN v_prev_from AND v_prev_to;
  
  -- =====================================================
  -- COSTS CALCULATION
  -- =====================================================
  
  -- Total costs
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_costs_total, v_total_expenses_count
  FROM expenses
  WHERE brand_id = ANY(v_brand_ids)
    AND expense_date BETWEEN p_from AND p_to;
  
  -- Recurring expenses count
  SELECT COUNT(*)
  INTO v_recurring_expenses_count
  FROM expenses
  WHERE brand_id = ANY(v_brand_ids)
    AND expense_date BETWEEN p_from AND p_to
    AND periodicity IS NOT NULL AND periodicity != 'one_off';
  
  v_recurring_ratio := CASE 
    WHEN v_total_expenses_count > 0 THEN v_recurring_expenses_count::numeric / v_total_expenses_count 
    ELSE 0 
  END;
  
  -- Costs by category type
  SELECT 
    COALESCE(SUM(CASE WHEN ec.category_type = 'direct' THEN e.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ec.category_type = 'indirect' THEN e.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ec.category_type = 'personnel' THEN e.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ec.category_type = 'marketing' THEN e.amount ELSE 0 END), 0)
  INTO v_costs_direct, v_costs_indirect, v_costs_personnel, v_costs_marketing
  FROM expenses e
  LEFT JOIN expense_categories ec ON e.category_id = ec.id
  WHERE e.brand_id = ANY(v_brand_ids)
    AND e.expense_date BETWEEN p_from AND p_to;
  
  v_marketing_spend := v_costs_marketing;
  
  -- Costs by center
  SELECT jsonb_agg(jsonb_build_object(
    'center_name', COALESCE(cc.name, 'Non assegnato'),
    'amount', sub.total
  ))
  INTO v_costs_by_center
  FROM (
    SELECT cost_center_id, SUM(amount) as total
    FROM expenses
    WHERE brand_id = ANY(v_brand_ids)
      AND expense_date BETWEEN p_from AND p_to
    GROUP BY cost_center_id
  ) sub
  LEFT JOIN cost_centers cc ON sub.cost_center_id = cc.id;
  
  v_costs_by_center := COALESCE(v_costs_by_center, '[]'::jsonb);
  
  -- Costs by category
  SELECT jsonb_agg(jsonb_build_object(
    'category_name', COALESCE(ec.name, 'Non categorizzato'),
    'type', COALESCE(ec.category_type, 'direct'),
    'amount', sub.total
  ))
  INTO v_costs_by_category
  FROM (
    SELECT category_id, SUM(amount) as total
    FROM expenses
    WHERE brand_id = ANY(v_brand_ids)
      AND expense_date BETWEEN p_from AND p_to
    GROUP BY category_id
  ) sub
  LEFT JOIN expense_categories ec ON sub.category_id = ec.id;
  
  v_costs_by_category := COALESCE(v_costs_by_category, '[]'::jsonb);
  
  -- Previous period costs
  SELECT COALESCE(SUM(amount), 0)
  INTO v_prev_costs
  FROM expenses
  WHERE brand_id = ANY(v_brand_ids)
    AND expense_date BETWEEN v_prev_from AND v_prev_to;
  
  -- Days with data (for confidence)
  SELECT COUNT(DISTINCT expense_date)
  INTO v_days_with_data
  FROM expenses
  WHERE brand_id = ANY(v_brand_ids)
    AND expense_date BETWEEN p_from AND p_to;
  
  v_period_coverage := CASE 
    WHEN v_total_days > 0 THEN LEAST(v_days_with_data::numeric / v_total_days, 1) 
    ELSE 0 
  END;
  
  -- =====================================================
  -- MARGINS CALCULATION
  -- =====================================================
  
  v_gross_margin := v_revenue_total - v_costs_direct;
  v_operating_margin := v_gross_margin - v_costs_indirect - v_costs_personnel;
  v_gross_margin_percent := CASE 
    WHEN v_revenue_total > 0 THEN (v_gross_margin / v_revenue_total) * 100 
    ELSE 0 
  END;
  
  -- Previous margin for comparison
  v_prev_margin := v_prev_revenue - v_prev_costs;
  v_margin_change := CASE 
    WHEN v_prev_margin != 0 THEN ((v_operating_margin - v_prev_margin) / ABS(v_prev_margin)) * 100 
    ELSE 0 
  END;
  
  -- =====================================================
  -- TAX SETTINGS & ESTIMATION
  -- =====================================================
  
  -- Get tax settings (use first brand if system brand)
  SELECT 
    corporate_tax_rate,
    regional_tax_rate,
    vat_rate_default
  INTO v_corporate_rate, v_regional_rate, v_vat_rate
  FROM brand_tax_settings
  WHERE brand_id = CASE WHEN v_is_system_brand THEN v_brand_ids[1] ELSE p_brand_id END;
  
  -- Use defaults if not found
  v_corporate_rate := COALESCE(v_corporate_rate, 24.0);
  v_regional_rate := COALESCE(v_regional_rate, 3.9);
  v_vat_rate := COALESCE(v_vat_rate, 22.0);
  
  v_tax_settings := jsonb_build_object(
    'corporate_rate', v_corporate_rate,
    'regional_rate', v_regional_rate,
    'vat_rate', v_vat_rate
  );
  
  -- Estimated VAT (simplified: revenue VAT - deductible expenses VAT)
  v_estimated_vat := (v_revenue_total * v_vat_rate / 100) - 
    (SELECT COALESCE(SUM(
      CASE WHEN COALESCE(e.is_deductible, ec.is_deductible, true) 
        THEN e.amount * COALESCE(e.tax_rate, v_vat_rate) / 100 
        ELSE 0 
      END
    ), 0)
    FROM expenses e
    LEFT JOIN expense_categories ec ON e.category_id = ec.id
    WHERE e.brand_id = ANY(v_brand_ids)
      AND e.expense_date BETWEEN p_from AND p_to);
  
  -- Estimated corporate + regional tax
  v_estimated_corporate_tax := GREATEST(0, v_operating_margin * (v_corporate_rate + v_regional_rate) / 100);
  
  -- Estimated net profit
  v_estimated_net_profit := v_operating_margin - v_estimated_corporate_tax;
  
  -- =====================================================
  -- MARKETING ROI
  -- =====================================================
  
  v_marketing_roi := CASE 
    WHEN v_marketing_spend > 0 THEN ((v_revenue_total - v_marketing_spend) / v_marketing_spend) * 100 
    ELSE 0 
  END;
  
  -- =====================================================
  -- CONFIDENCE LEVEL CALCULATION
  -- =====================================================
  
  v_confidence_overall := (
    v_recurring_ratio * 0.30 +
    v_confirmed_ratio * 0.30 +
    v_period_coverage * 0.20 +
    0.80 * 0.20  -- historical_accuracy placeholder
  );
  
  v_confidence_factors := jsonb_build_array(
    jsonb_build_object(
      'factor', 'recurring_costs_known',
      'contribution', 0.30,
      'value', ROUND(v_recurring_ratio::numeric, 2),
      'detail', format('%s/%s costi ricorrenti', v_recurring_expenses_count, v_total_expenses_count)
    ),
    jsonb_build_object(
      'factor', 'confirmed_sales_ratio',
      'contribution', 0.30,
      'value', ROUND(v_confirmed_ratio::numeric, 2),
      'detail', format('%s/%s vendite confermate', v_confirmed_deals_count, v_won_deals_count)
    ),
    jsonb_build_object(
      'factor', 'period_coverage',
      'contribution', 0.20,
      'value', ROUND(v_period_coverage::numeric, 2),
      'detail', format('%s/%s giorni con dati', v_days_with_data, v_total_days)
    ),
    jsonb_build_object(
      'factor', 'historical_accuracy',
      'contribution', 0.20,
      'value', 0.80,
      'detail', 'Placeholder per M14'
    )
  );
  
  -- =====================================================
  -- BUDGET BASELINE
  -- =====================================================
  
  -- Get budget for period month
  SELECT COALESCE(SUM(planned_amount), 0)
  INTO v_budget_total
  FROM budgets
  WHERE brand_id = ANY(v_brand_ids)
    AND period_month >= p_from
    AND period_month <= p_to;
  
  v_budget_spent := v_costs_total;
  v_budget_variance := v_budget_total - v_budget_spent;
  v_budget_variance_pct := CASE 
    WHEN v_budget_total > 0 THEN (v_budget_variance / v_budget_total) * 100 
    ELSE 0 
  END;
  
  -- Categories over budget
  SELECT jsonb_agg(jsonb_build_object(
    'category_name', sub.category_name,
    'planned', sub.planned,
    'actual', sub.actual,
    'overage', sub.actual - sub.planned
  ))
  INTO v_categories_over_budget
  FROM (
    SELECT 
      COALESCE(ec.name, 'Non categorizzato') as category_name,
      COALESCE(b.planned_amount, 0) as planned,
      COALESCE(e.total_spent, 0) as actual
    FROM expense_categories ec
    LEFT JOIN (
      SELECT category_id, SUM(planned_amount) as planned_amount
      FROM budgets
      WHERE brand_id = ANY(v_brand_ids)
        AND period_month >= p_from AND period_month <= p_to
      GROUP BY category_id
    ) b ON ec.id = b.category_id
    LEFT JOIN (
      SELECT category_id, SUM(amount) as total_spent
      FROM expenses
      WHERE brand_id = ANY(v_brand_ids)
        AND expense_date BETWEEN p_from AND p_to
      GROUP BY category_id
    ) e ON ec.id = e.category_id
    WHERE ec.brand_id = ANY(v_brand_ids)
      AND COALESCE(e.total_spent, 0) > COALESCE(b.planned_amount, 0)
      AND COALESCE(b.planned_amount, 0) > 0
  ) sub;
  
  v_categories_over_budget := COALESCE(v_categories_over_budget, '[]'::jsonb);
  
  -- =====================================================
  -- ALERTS GENERATION
  -- =====================================================
  
  -- Alert: MARGIN_DECLINING (margin < prev - 10%)
  IF v_margin_change < -10 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'MARGIN_DECLINING',
      'severity', 'warning',
      'message', format('Margine in calo del %.1f%% rispetto al periodo precedente', ABS(v_margin_change)),
      'root_causes', jsonb_build_array(
        CASE WHEN v_revenue_total < v_prev_revenue 
          THEN format('Revenue: %.1f%% rispetto al periodo precedente', 
            CASE WHEN v_prev_revenue > 0 THEN ((v_revenue_total - v_prev_revenue) / v_prev_revenue) * 100 ELSE 0 END)
          ELSE NULL 
        END,
        CASE WHEN v_costs_total > v_prev_costs 
          THEN format('Costi: +%.1f%% rispetto al periodo precedente', 
            CASE WHEN v_prev_costs > 0 THEN ((v_costs_total - v_prev_costs) / v_prev_costs) * 100 ELSE 0 END)
          ELSE NULL 
        END
      ),
      'suggested_action', 'Analizzare categorie con maggiore incremento. Valutare ottimizzazione budget.',
      'metric_value', v_margin_change,
      'threshold_value', -10.0
    ));
  END IF;
  
  -- Alert: REVENUE_DROP (revenue < prev - 20%)
  IF v_prev_revenue > 0 AND ((v_revenue_total - v_prev_revenue) / v_prev_revenue) * 100 < -20 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'REVENUE_DROP',
      'severity', 'error',
      'message', format('Fatturato in calo del %.1f%% rispetto al periodo precedente', 
        ABS(((v_revenue_total - v_prev_revenue) / v_prev_revenue) * 100)),
      'root_causes', jsonb_build_array('Analisi vendite richiesta'),
      'suggested_action', 'Verificare pipeline e conversioni. Contattare venditori per feedback.',
      'metric_value', ((v_revenue_total - v_prev_revenue) / v_prev_revenue) * 100,
      'threshold_value', -20.0
    ));
  END IF;
  
  -- Alert: BUDGET_EXCEEDED
  IF jsonb_array_length(v_categories_over_budget) > 0 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'BUDGET_EXCEEDED',
      'severity', 'error',
      'message', format('%s categorie hanno superato il budget', jsonb_array_length(v_categories_over_budget)),
      'root_causes', (SELECT jsonb_agg(elem->>'category_name') FROM jsonb_array_elements(v_categories_over_budget) elem),
      'suggested_action', 'Rivedere allocazione budget o autorizzare spese extra.',
      'metric_value', v_budget_variance,
      'threshold_value', 0
    ));
  END IF;
  
  -- Alert: MARKETING_ROI_LOW (ROI < 100%)
  IF v_marketing_spend > 0 AND v_marketing_roi < 100 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'MARKETING_ROI_LOW',
      'severity', 'warning',
      'message', format('ROI Marketing al %.1f%% (sotto il 100%%)', v_marketing_roi),
      'root_causes', jsonb_build_array(
        format('Spesa marketing: €%.2f', v_marketing_spend),
        format('Revenue attribuibile: €%.2f', v_revenue_total)
      ),
      'suggested_action', 'Analizzare efficacia campagne. Considerare riallocazione budget.',
      'metric_value', v_marketing_roi,
      'threshold_value', 100.0
    ));
  END IF;
  
  -- Alert: POSITIVE_TREND (margin > prev + 15%)
  IF v_margin_change > 15 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'POSITIVE_TREND',
      'severity', 'success',
      'message', format('Margine in crescita del %.1f%% rispetto al periodo precedente', v_margin_change),
      'root_causes', jsonb_build_array('Trend positivo'),
      'suggested_action', 'Consolidare pratiche attuali. Valutare espansione.',
      'metric_value', v_margin_change,
      'threshold_value', 15.0
    ));
  END IF;
  
  -- =====================================================
  -- RETURN RESULT
  -- =====================================================
  
  RETURN jsonb_build_object(
    -- Revenue
    'revenue_total', v_revenue_total,
    'revenue_from_won_deals', v_revenue_won_deals,
    
    -- Costs
    'costs_total', v_costs_total,
    'costs_direct', v_costs_direct,
    'costs_indirect', v_costs_indirect,
    'costs_personnel', v_costs_personnel,
    'costs_marketing', v_costs_marketing,
    'costs_by_center', v_costs_by_center,
    'costs_by_category', v_costs_by_category,
    
    -- Margins
    'gross_margin', v_gross_margin,
    'operating_margin', v_operating_margin,
    'gross_margin_percent', ROUND(v_gross_margin_percent, 1),
    
    -- Tax settings & estimation
    'tax_settings', v_tax_settings,
    'estimated_vat_payable', ROUND(v_estimated_vat, 2),
    'estimated_corporate_tax', ROUND(v_estimated_corporate_tax, 2),
    'estimated_net_profit', ROUND(v_estimated_net_profit, 2),
    
    -- Comparisons
    'prev_period_revenue', v_prev_revenue,
    'prev_period_costs', v_prev_costs,
    'revenue_change_percent', ROUND(
      CASE WHEN v_prev_revenue > 0 THEN ((v_revenue_total - v_prev_revenue) / v_prev_revenue) * 100 ELSE 0 END, 1
    ),
    'costs_change_percent', ROUND(
      CASE WHEN v_prev_costs > 0 THEN ((v_costs_total - v_prev_costs) / v_prev_costs) * 100 ELSE 0 END, 1
    ),
    
    -- Marketing
    'marketing_spend', v_marketing_spend,
    'marketing_roi', ROUND(v_marketing_roi, 1),
    
    -- Confidence
    'confidence', jsonb_build_object(
      'overall', ROUND(v_confidence_overall, 2),
      'estimated_net_profit', ROUND(v_confidence_overall, 2),
      'marketing_roi', ROUND(LEAST(v_confirmed_ratio, v_period_coverage), 2),
      'factors', v_confidence_factors
    ),
    
    -- Alerts
    'alerts', v_alerts,
    
    -- Budget baseline
    'budget_baseline', jsonb_build_object(
      'total_planned', v_budget_total,
      'total_spent', v_budget_spent,
      'variance', v_budget_variance,
      'variance_percent', ROUND(v_budget_variance_pct, 1),
      'categories_over_budget', v_categories_over_budget,
      'remaining_allocable', GREATEST(0, v_budget_variance)
    )
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_ceo_dashboard_kpis(uuid, date, date) TO authenticated;