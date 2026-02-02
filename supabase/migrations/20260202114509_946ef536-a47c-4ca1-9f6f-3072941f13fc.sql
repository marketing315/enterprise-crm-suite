-- ================================================================
-- DB-1: Add 'amministrazione' role to app_role enum
-- ================================================================
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'amministrazione';

-- ================================================================
-- DB-2: Add is_system column to brands for special brand handling
-- ================================================================
ALTER TABLE brands ADD COLUMN IF NOT EXISTS is_system boolean DEFAULT false;

-- Create the "Azienda Intera" system brand if not exists
INSERT INTO brands (id, name, slug, is_system, auto_assign_enabled)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Azienda Intera',
  'azienda-intera',
  true,
  false
)
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- DB-3: Create finance tables for Azienda module
-- ================================================================

-- Expense Categories table
CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(brand_id, name)
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_brand ON expense_categories(brand_id);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text DEFAULT 'EUR',
  expense_date date NOT NULL,
  vendor_name text,
  description text,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_brand_date ON expenses(brand_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_brand_category_date ON expenses(brand_id, category_id, expense_date DESC);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  period_month date NOT NULL,
  planned_amount numeric(12,2) NOT NULL CHECK (planned_amount >= 0),
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(brand_id, period_month, category_id)
);

CREATE INDEX IF NOT EXISTS idx_budgets_brand_month ON budgets(brand_id, period_month DESC);

-- Admin notes table for budget alerts, notes, etc.
CREATE TABLE IF NOT EXISTS admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type text NOT NULL,
  ref_table text,
  ref_id uuid,
  content text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notes_brand ON admin_notes(brand_id, created_at DESC);

-- ================================================================
-- Enable RLS on all new tables
-- ================================================================
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;