// Company/Azienda Module Types

export interface ExpenseCategory {
  id: string;
  brand_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
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
  // Joined data
  expense_categories?: ExpenseCategory | null;
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
  // Joined data
  expense_categories?: ExpenseCategory | null;
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
}

export interface BudgetFormData {
  category_id?: string | null;
  period_month: string;
  planned_amount: number;
  notes?: string;
}
