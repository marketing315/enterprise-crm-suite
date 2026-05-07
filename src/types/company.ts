// Company/Azienda Module Types

export interface ExpenseCategory {
  id: string;
  brand_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  // M13 additions
  parent_id?: string | null;
  category_type?: 'direct' | 'indirect' | 'personnel' | 'marketing' | 'overhead';
  is_deductible?: boolean;
}

export interface Expense {
  id: string;
  brand_id: string;
  category_id: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  vendor_name: string | null;
  description: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // M13 additions
  cost_center_id?: string | null;
  periodicity?: 'one_off' | 'monthly' | 'quarterly' | 'yearly';
  recurring_until?: string | null;
  is_deductible?: boolean | null;
  tax_rate?: number | null;
  gross_amount?: number | null;
  // Joined data (partial for select)
  expense_categories?: { id: string; name: string } | null;
  users?: { full_name: string | null } | null;
}

export interface Budget {
  id: string;
  brand_id: string;
  category_id: string | null;
  period_month: string;
  planned_amount: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data (partial for select)
  expense_categories?: { id: string; name: string } | null;
}

export interface AdminNote {
  id: string;
  brand_id: string;
  type: string;
  ref_table: string | null;
  ref_id: string | null;
  content: string;
  created_by: string;
  created_at: string;
}

export interface FinanceKpi {
  total_expenses: number;
  expenses_by_category: Array<{
    category_id: string | null;
    category_name: string;
    amount: number;
  }>;
  budget_total: number;
  budget_by_category: Array<{
    category_id: string | null;
    category_name: string;
    planned_amount: number;
  }>;
  sales_total: number;
  margin: number;
  period_from: string;
  period_to: string;
}

export interface ExpenseFormData {
  category_id?: string | null;
  amount: number;
  expense_date: string;
  vendor_name?: string;
  description?: string;
  notes?: string;
  // M13 additions
  cost_center_id?: string | null;
  periodicity?: 'one_off' | 'monthly' | 'quarterly' | 'yearly';
  recurring_until?: string | null;
  is_deductible?: boolean;
  tax_rate?: number | null;
  gross_amount?: number | null;
}

export interface BudgetFormData {
  category_id?: string | null;
  period_month: string;
  planned_amount: number;
  notes?: string;
}

// =====================================================
// M13: CEO Dashboard Types
// =====================================================

export interface CostCenter {
  id: string;
  brand_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BrandTaxSettings {
  id: string;
  brand_id: string;
  corporate_tax_rate: number;
  regional_tax_rate: number;
  vat_rate_default: number;
  fiscal_year_start: number;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface CostByCenter {
  center_name: string;
  amount: number;
}

export interface CostByCategory {
  category_name: string;
  type: string;
  amount: number;
}

export interface TaxSettings {
  corporate_rate: number;
  regional_rate: number;
  vat_rate: number;
}

export interface ConfidenceFactor {
  factor: string;
  contribution: number;
  value: number;
  detail: string;
}

export interface ConfidenceLevel {
  overall: number;
  estimated_net_profit: number;
  marketing_roi: number;
  factors: ConfidenceFactor[];
}

export type CeoAlertType = 
  | 'MARGIN_DECLINING' 
  | 'COST_ANOMALY' 
  | 'BUDGET_EXCEEDED' 
  | 'REVENUE_DROP' 
  | 'POSITIVE_TREND' 
  | 'MISSING_COSTS' 
  | 'MARKETING_ROI_LOW';

export type CeoAlertSeverity = 'info' | 'warning' | 'error' | 'success';

export interface CeoAlert {
  type: CeoAlertType;
  severity: CeoAlertSeverity;
  message: string;
  root_causes: string[];
  suggested_action: string;
  metric_value: number;
  threshold_value: number;
}

export interface CategoryOverBudget {
  category_name: string;
  planned: number;
  actual: number;
  overage: number;
}

export interface BudgetBaseline {
  total_planned: number;
  total_spent: number;
  variance: number;
  variance_percent: number;
  categories_over_budget: CategoryOverBudget[];
  remaining_allocable: number;
}

export interface CeoKpi {
  // Revenue
  revenue_total: number;
  revenue_from_won_deals: number;
  revenue_marketing_attributable?: number;
  
  // Costs
  costs_total: number;
  costs_direct: number;
  costs_indirect: number;
  costs_personnel: number;
  costs_marketing: number;
  costs_by_center: CostByCenter[];
  costs_by_category: CostByCategory[];
  
  // Margins
  gross_margin: number;
  operating_margin: number;
  gross_margin_percent: number;
  
  // Tax settings & estimation
  tax_settings: TaxSettings;
  estimated_vat_payable: number;
  estimated_corporate_tax: number;
  estimated_net_profit: number;
  
  // Comparisons
  prev_period_revenue: number;
  prev_period_costs: number;
  revenue_change_percent: number;
  costs_change_percent: number;
  
  // Marketing
  marketing_spend: number;
  marketing_roi: number;
  
  // Confidence
  confidence: ConfidenceLevel;
  
  // Alerts
  alerts: CeoAlert[];
  
  // Budget baseline
  budget_baseline: BudgetBaseline;
}
