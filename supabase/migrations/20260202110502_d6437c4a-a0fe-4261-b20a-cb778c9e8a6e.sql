-- =====================================================
-- GESTIONE VENDITE - Epic S1: Data Model
-- =====================================================

-- 1. ENUM per stati ordine e pagamento
CREATE TYPE public.sales_order_status AS ENUM (
  'draft',
  'confirmed',
  'invoiced',
  'partially_paid',
  'paid',
  'cancelled',
  'refunded'
);

CREATE TYPE public.payment_method AS ENUM (
  'cash',
  'card',
  'bank_transfer',
  'stripe',
  'other'
);

CREATE TYPE public.payment_status AS ENUM (
  'pending',
  'completed',
  'failed',
  'refunded'
);

CREATE TYPE public.commission_status AS ENUM (
  'pending',
  'approved',
  'paid'
);

-- 2. PRODUCTS (catalogo prodotti/servizi per brand)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  default_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) DEFAULT 22.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, sku)
);

CREATE INDEX idx_products_brand_active ON public.products(brand_id, is_active);

-- 3. SALES_ORDERS (ordine/vendita principale)
CREATE TABLE public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  deal_id UUID UNIQUE REFERENCES public.deals(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL,
  status public.sales_order_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2),
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX idx_sales_orders_brand_status ON public.sales_orders(brand_id, status);
CREATE INDEX idx_sales_orders_assigned ON public.sales_orders(assigned_user_id);
CREATE INDEX idx_sales_orders_contact ON public.sales_orders(contact_id);
CREATE INDEX idx_sales_orders_created ON public.sales_orders(created_at DESC);

-- 4. SALES_ORDER_ITEMS (righe ordine)
CREATE TABLE public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  vat_rate NUMERIC(5,2) DEFAULT 22.00,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON public.sales_order_items(order_id);

-- 5. PAYMENTS (pagamenti multipli)
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  method public.payment_method NOT NULL DEFAULT 'other',
  status public.payment_status NOT NULL DEFAULT 'pending',
  reference TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  recorded_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_order ON public.payments(order_id);
CREATE INDEX idx_payments_brand_date ON public.payments(brand_id, paid_at DESC);

-- 6. SALES_COMMISSIONS (commissioni venditori)
CREATE TABLE public.sales_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  commission_percent NUMERIC(5,2),
  commission_fixed NUMERIC(12,2),
  commission_amount NUMERIC(12,2) NOT NULL,
  status public.commission_status NOT NULL DEFAULT 'pending',
  approved_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commissions_user ON public.sales_commissions(user_id, status);
CREATE INDEX idx_commissions_brand ON public.sales_commissions(brand_id, created_at DESC);

-- 7. SALES_TARGETS (obiettivi vendita)
CREATE TABLE public.sales_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_amount NUMERIC(12,2) NOT NULL,
  target_count INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, user_id, period_start, period_end)
);

CREATE INDEX idx_targets_brand_period ON public.sales_targets(brand_id, period_start, period_end);

-- 8. BRAND SETTINGS per accesso call center
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS 
  sales_visibility_callcenter TEXT NOT NULL DEFAULT 'none' 
  CHECK (sales_visibility_callcenter IN ('none', 'aggregates', 'readonly'));

-- 9. SEQUENCE per order_number per brand
CREATE OR REPLACE FUNCTION public.generate_order_number(p_brand_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_slug TEXT;
  v_year TEXT;
  v_count INTEGER;
BEGIN
  SELECT slug INTO v_brand_slug FROM brands WHERE id = p_brand_id;
  v_year := to_char(now(), 'YY');
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM sales_orders
  WHERE brand_id = p_brand_id
    AND created_at >= date_trunc('year', now());
  
  RETURN UPPER(v_brand_slug) || '-' || v_year || '-' || LPAD(v_count::TEXT, 5, '0');
END;
$$;

-- 10. TRIGGER per auto-generare order_number
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number(NEW.brand_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_order_number
  BEFORE INSERT ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_number();

-- 11. TRIGGER per ricalcolo totali ordine
CREATE OR REPLACE FUNCTION public.recalculate_order_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal NUMERIC(12,2);
  v_tax NUMERIC(12,2);
  v_order_id UUID;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  
  SELECT 
    COALESCE(SUM(line_total), 0),
    COALESCE(SUM(line_total * vat_rate / 100), 0)
  INTO v_subtotal, v_tax
  FROM sales_order_items
  WHERE order_id = v_order_id;
  
  UPDATE sales_orders
  SET 
    subtotal = v_subtotal,
    tax_amount = v_tax,
    total_amount = v_subtotal + v_tax - COALESCE(discount_amount, 0),
    updated_at = now()
  WHERE id = v_order_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recalculate_order_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_order_totals();

-- 12. TRIGGER per aggiornare paid_amount e status
CREATE OR REPLACE FUNCTION public.update_order_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_paid NUMERIC(12,2);
  v_order_total NUMERIC(12,2);
  v_order_id UUID;
  v_new_status sales_order_status;
  v_current_status sales_order_status;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM payments
  WHERE order_id = v_order_id AND status = 'completed';
  
  SELECT total_amount, status INTO v_order_total, v_current_status
  FROM sales_orders WHERE id = v_order_id;
  
  -- Determina nuovo status solo se ordine è confirmed o successivo
  IF v_current_status NOT IN ('draft', 'cancelled', 'refunded') THEN
    IF v_total_paid >= v_order_total THEN
      v_new_status := 'paid';
    ELSIF v_total_paid > 0 THEN
      v_new_status := 'partially_paid';
    ELSE
      v_new_status := v_current_status;
    END IF;
    
    UPDATE sales_orders
    SET 
      paid_amount = v_total_paid,
      status = v_new_status,
      paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END,
      updated_at = now()
    WHERE id = v_order_id;
  ELSE
    UPDATE sales_orders
    SET paid_amount = v_total_paid, updated_at = now()
    WHERE id = v_order_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_update_order_payment_status
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_order_payment_status();

-- 13. AUDIT: sales_order_history
CREATE TABLE public.sales_order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_status public.sales_order_status,
  new_status public.sales_order_status,
  changed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_history_order ON public.sales_order_history(order_id, created_at DESC);

-- 14. RLS POLICIES

-- Products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view products in their brands"
  ON public.products FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admins and CEOs can manage products"
  ON public.products FOR ALL
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo')
  )
  WITH CHECK (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo')
  );

-- Sales Orders
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sales orders based on role"
  ON public.sales_orders FOR SELECT
  USING (
    user_belongs_to_brand(get_user_id(auth.uid()), brand_id) AND (
      -- Admin, CEO, Responsabile Venditori: vedono tutto
      has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
      has_role(get_user_id(auth.uid()), 'ceo') OR
      has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori') OR
      -- Venditore: solo proprie vendite
      (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'venditore') AND 
       assigned_user_id = get_user_id(auth.uid())) OR
      -- Call center: dipende da impostazione brand
      (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_callcenter') AND
       (SELECT sales_visibility_callcenter FROM brands WHERE id = brand_id) = 'readonly') OR
      (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'operatore_callcenter') AND
       (SELECT sales_visibility_callcenter FROM brands WHERE id = brand_id) = 'readonly')
    )
  );

CREATE POLICY "Authorized users can insert sales orders"
  ON public.sales_orders FOR INSERT
  WITH CHECK (
    user_belongs_to_brand(get_user_id(auth.uid()), brand_id) AND (
      has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
      has_role(get_user_id(auth.uid()), 'ceo') OR
      has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori') OR
      has_role_for_brand(get_user_id(auth.uid()), brand_id, 'venditore')
    )
  );

CREATE POLICY "Authorized users can update sales orders"
  ON public.sales_orders FOR UPDATE
  USING (
    user_belongs_to_brand(get_user_id(auth.uid()), brand_id) AND (
      has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
      has_role(get_user_id(auth.uid()), 'ceo') OR
      has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori') OR
      (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'venditore') AND 
       assigned_user_id = get_user_id(auth.uid()))
    )
  );

-- Sales Order Items
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view order items via order"
  ON public.sales_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sales_orders so
      WHERE so.id = order_id
      AND user_belongs_to_brand(get_user_id(auth.uid()), so.brand_id)
    )
  );

CREATE POLICY "Authorized users can manage order items"
  ON public.sales_order_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sales_orders so
      WHERE so.id = order_id AND (
        has_role_for_brand(get_user_id(auth.uid()), so.brand_id, 'admin') OR
        has_role(get_user_id(auth.uid()), 'ceo') OR
        has_role_for_brand(get_user_id(auth.uid()), so.brand_id, 'responsabile_venditori') OR
        (has_role_for_brand(get_user_id(auth.uid()), so.brand_id, 'venditore') AND 
         so.assigned_user_id = get_user_id(auth.uid()))
      )
    )
  );

-- Payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payments based on order access"
  ON public.payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sales_orders so
      WHERE so.id = order_id
      AND user_belongs_to_brand(get_user_id(auth.uid()), so.brand_id)
    )
  );

CREATE POLICY "Authorized users can manage payments"
  ON public.payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sales_orders so
      WHERE so.id = order_id AND (
        has_role_for_brand(get_user_id(auth.uid()), so.brand_id, 'admin') OR
        has_role(get_user_id(auth.uid()), 'ceo') OR
        has_role_for_brand(get_user_id(auth.uid()), so.brand_id, 'responsabile_venditori') OR
        (has_role_for_brand(get_user_id(auth.uid()), so.brand_id, 'venditore') AND 
         so.assigned_user_id = get_user_id(auth.uid()))
      )
    )
  );

-- Commissions
ALTER TABLE public.sales_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own commissions"
  ON public.sales_commissions FOR SELECT
  USING (
    user_id = get_user_id(auth.uid()) OR
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo') OR
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori')
  );

CREATE POLICY "Admins can manage commissions"
  ON public.sales_commissions FOR ALL
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo')
  );

-- Targets
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view targets in their brands"
  ON public.sales_targets FOR SELECT
  USING (
    user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
  );

CREATE POLICY "Admins can manage targets"
  ON public.sales_targets FOR ALL
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo') OR
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori')
  );

-- Order History
ALTER TABLE public.sales_order_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view order history via order"
  ON public.sales_order_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sales_orders so
      WHERE so.id = order_id
      AND user_belongs_to_brand(get_user_id(auth.uid()), so.brand_id)
    )
  );

-- 15. RPC: Create sales order from deal
CREATE OR REPLACE FUNCTION public.create_sales_order_from_deal(
  p_deal_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal RECORD;
  v_order_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  -- Get deal info
  SELECT d.*, c.id as cid
  INTO v_deal
  FROM deals d
  JOIN contacts c ON c.id = d.contact_id
  WHERE d.id = p_deal_id;
  
  IF v_deal IS NULL THEN
    RAISE EXCEPTION 'Deal not found';
  END IF;
  
  -- Check if order already exists
  IF EXISTS (SELECT 1 FROM sales_orders WHERE deal_id = p_deal_id) THEN
    RAISE EXCEPTION 'Order already exists for this deal';
  END IF;
  
  -- Check permissions
  IF NOT (
    user_belongs_to_brand(v_user_id, v_deal.brand_id) AND (
      has_role_for_brand(v_user_id, v_deal.brand_id, 'admin') OR
      has_role(v_user_id, 'ceo') OR
      has_role_for_brand(v_user_id, v_deal.brand_id, 'responsabile_venditori') OR
      (has_role_for_brand(v_user_id, v_deal.brand_id, 'venditore') AND 
       v_deal.assigned_user_id = v_user_id)
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  
  -- Create order
  INSERT INTO sales_orders (
    brand_id,
    deal_id,
    contact_id,
    assigned_user_id,
    order_number,
    status
  ) VALUES (
    v_deal.brand_id,
    p_deal_id,
    v_deal.contact_id,
    COALESCE(v_deal.assigned_user_id, v_user_id),
    '' -- Will be auto-generated by trigger
  )
  RETURNING id INTO v_order_id;
  
  -- Log to audit
  INSERT INTO sales_order_history (order_id, action, new_status, changed_by_user_id)
  VALUES (v_order_id, 'created', 'draft', v_user_id);
  
  RETURN v_order_id;
END;
$$;

-- 16. RPC: Get sales KPIs
CREATE OR REPLACE FUNCTION public.get_sales_kpis(
  p_brand_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_user_id UUID;
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  -- Check permissions
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  
  SELECT jsonb_build_object(
    'total_revenue', COALESCE(SUM(CASE WHEN status IN ('paid', 'partially_paid') THEN paid_amount ELSE 0 END), 0),
    'total_orders', COUNT(*),
    'orders_paid', COUNT(*) FILTER (WHERE status = 'paid'),
    'orders_pending', COUNT(*) FILTER (WHERE status IN ('draft', 'confirmed', 'partially_paid')),
    'avg_order_value', COALESCE(AVG(total_amount) FILTER (WHERE status != 'cancelled'), 0),
    'conversion_rate', CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE status = 'paid')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0 
    END
  ) INTO v_result
  FROM sales_orders
  WHERE brand_id = p_brand_id
    AND created_at BETWEEN p_from AND p_to
    AND (p_user_id IS NULL OR assigned_user_id = p_user_id);
  
  RETURN v_result;
END;
$$;