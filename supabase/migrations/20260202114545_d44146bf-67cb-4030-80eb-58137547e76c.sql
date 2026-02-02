-- ================================================================
-- SEC-1: RLS Policies for finance tables
-- Only admin, ceo, amministrazione can access
-- ================================================================

-- Helper function to check finance access (uses text comparison to avoid enum issue)
CREATE OR REPLACE FUNCTION has_finance_access(p_user_id uuid, p_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id
      AND (brand_id = p_brand_id OR role::text IN ('admin', 'ceo'))
      AND role::text IN ('admin', 'ceo', 'amministrazione')
  )
$$;

-- expense_categories policies
CREATE POLICY "Finance roles can view expense categories"
ON expense_categories FOR SELECT
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can insert expense categories"
ON expense_categories FOR INSERT
WITH CHECK (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can update expense categories"
ON expense_categories FOR UPDATE
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can delete expense categories"
ON expense_categories FOR DELETE
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

-- expenses policies
CREATE POLICY "Finance roles can view expenses"
ON expenses FOR SELECT
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can insert expenses"
ON expenses FOR INSERT
WITH CHECK (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can update expenses"
ON expenses FOR UPDATE
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can delete expenses"
ON expenses FOR DELETE
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

-- budgets policies
CREATE POLICY "Finance roles can view budgets"
ON budgets FOR SELECT
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can insert budgets"
ON budgets FOR INSERT
WITH CHECK (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can update budgets"
ON budgets FOR UPDATE
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can delete budgets"
ON budgets FOR DELETE
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

-- admin_notes policies
CREATE POLICY "Finance roles can view admin notes"
ON admin_notes FOR SELECT
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can insert admin notes"
ON admin_notes FOR INSERT
WITH CHECK (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can update admin notes"
ON admin_notes FOR UPDATE
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can delete admin notes"
ON admin_notes FOR DELETE
USING (has_finance_access(get_user_id(auth.uid()), brand_id));

-- ================================================================
-- SEC-2: Update deals policy for amministrazione (read-only)
-- amministrazione can SELECT but NOT update/insert/delete
-- ================================================================

-- Drop and recreate the SELECT policy to include amministrazione
DROP POLICY IF EXISTS "Users can view deals based on role" ON deals;

CREATE POLICY "Users can view deals based on role"
ON deals FOR SELECT
USING (
  user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
  AND (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'ceo'::app_role)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'amministrazione'::app_role)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori'::app_role)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_callcenter'::app_role)
    OR (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'venditore'::app_role)
        AND (assigned_user_id = get_user_id(auth.uid()) OR assigned_user_id IS NULL))
    OR (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'operatore_callcenter'::app_role)
        AND (assigned_user_id = get_user_id(auth.uid()) OR assigned_user_id IS NULL))
  )
);

-- Update deals UPDATE policy to explicitly exclude amministrazione
DROP POLICY IF EXISTS "Users can update deals in their brands" ON deals;

CREATE POLICY "Users can update deals in their brands"
ON deals FOR UPDATE
USING (
  user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
  AND NOT has_role_for_brand(get_user_id(auth.uid()), brand_id, 'amministrazione'::app_role)
);

-- Update deals INSERT policy to explicitly exclude amministrazione
DROP POLICY IF EXISTS "Users can insert deals in their brands" ON deals;

CREATE POLICY "Users can insert deals in their brands"
ON deals FOR INSERT
WITH CHECK (
  user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
  AND NOT has_role_for_brand(get_user_id(auth.uid()), brand_id, 'amministrazione'::app_role)
);

-- ================================================================
-- DB-4: RPC for Admin Finance KPIs
-- ================================================================
CREATE OR REPLACE FUNCTION get_admin_finance_kpis(
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
  v_total_expenses numeric(12,2);
  v_budget_total numeric(12,2);
  v_sales_total numeric(12,2);
  v_expenses_by_category jsonb;
  v_budget_by_category jsonb;
  v_is_system_brand boolean;
BEGIN
  -- Get current user id
  v_user_id := get_user_id(auth.uid());
  
  -- Check if user has finance access
  IF NOT has_finance_access(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Check if this is the system brand (azienda intera)
  SELECT COALESCE(is_system, false) INTO v_is_system_brand FROM brands WHERE id = p_brand_id;
  
  -- Calculate total expenses
  SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
  FROM expenses
  WHERE brand_id = p_brand_id
    AND expense_date BETWEEN p_from AND p_to;
  
  -- Calculate expenses by category
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'category_id', sub.category_id,
    'category_name', COALESCE(ec.name, 'Senza categoria'),
    'amount', sub.cat_total
  )), '[]'::jsonb)
  INTO v_expenses_by_category
  FROM (
    SELECT e.category_id, SUM(e.amount) as cat_total
    FROM expenses e
    WHERE e.brand_id = p_brand_id
      AND e.expense_date BETWEEN p_from AND p_to
    GROUP BY e.category_id
  ) sub
  LEFT JOIN expense_categories ec ON ec.id = sub.category_id;
  
  -- Calculate budget total for the period
  SELECT COALESCE(SUM(planned_amount), 0) INTO v_budget_total
  FROM budgets
  WHERE brand_id = p_brand_id
    AND period_month >= date_trunc('month', p_from)::date
    AND period_month <= date_trunc('month', p_to)::date;
  
  -- Calculate budget by category
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'category_id', sub.category_id,
    'category_name', COALESCE(ec.name, 'Budget Totale'),
    'planned_amount', sub.budget_total
  )), '[]'::jsonb)
  INTO v_budget_by_category
  FROM (
    SELECT b.category_id, SUM(b.planned_amount) as budget_total
    FROM budgets b
    WHERE b.brand_id = p_brand_id
      AND b.period_month >= date_trunc('month', p_from)::date
      AND b.period_month <= date_trunc('month', p_to)::date
    GROUP BY b.category_id
  ) sub
  LEFT JOIN expense_categories ec ON ec.id = sub.category_id;
  
  -- Calculate sales total from won deals
  -- If system brand, aggregate from ALL operational brands
  IF v_is_system_brand THEN
    SELECT COALESCE(SUM(value), 0) INTO v_sales_total
    FROM deals d
    JOIN brands b ON b.id = d.brand_id
    WHERE d.status = 'won'
      AND COALESCE(b.is_system, false) = false
      AND d.closed_at::date BETWEEN p_from AND p_to;
  ELSE
    SELECT COALESCE(SUM(value), 0) INTO v_sales_total
    FROM deals
    WHERE brand_id = p_brand_id
      AND status = 'won'
      AND closed_at::date BETWEEN p_from AND p_to;
  END IF;
  
  RETURN jsonb_build_object(
    'total_expenses', v_total_expenses,
    'expenses_by_category', v_expenses_by_category,
    'budget_total', v_budget_total,
    'budget_by_category', v_budget_by_category,
    'sales_total', v_sales_total,
    'margin', v_sales_total - v_total_expenses,
    'period_from', p_from,
    'period_to', p_to
  );
END;
$$;

-- Grant execute to authenticated users (RLS handled inside function)
GRANT EXECUTE ON FUNCTION get_admin_finance_kpis(uuid, date, date) TO authenticated;