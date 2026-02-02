-- Create function to sync deal value from sales orders
CREATE OR REPLACE FUNCTION public.sync_deal_value_from_orders()
RETURNS TRIGGER AS $$
DECLARE
  v_deal_id uuid;
  v_new_value numeric;
BEGIN
  -- Get the deal_id from the affected row
  IF TG_OP = 'DELETE' THEN
    v_deal_id := OLD.deal_id;
  ELSE
    v_deal_id := NEW.deal_id;
  END IF;
  
  -- If no deal_id, nothing to sync
  IF v_deal_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate total value from all non-cancelled orders for this deal
  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_new_value
  FROM public.sales_orders
  WHERE deal_id = v_deal_id
    AND status != 'cancelled';
  
  -- Update the deal value
  UPDATE public.deals
  SET value = NULLIF(v_new_value, 0),
      updated_at = now()
  WHERE id = v_deal_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on sales_orders to update deal value
DROP TRIGGER IF EXISTS trg_sync_deal_value_on_order_change ON public.sales_orders;
CREATE TRIGGER trg_sync_deal_value_on_order_change
AFTER INSERT OR UPDATE OF total_amount, status, deal_id OR DELETE
ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_deal_value_from_orders();

-- Also sync when sales_order_items change (which affects order total)
-- First, create a function that updates order totals and triggers the deal sync
CREATE OR REPLACE FUNCTION public.recalculate_order_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_order_id uuid;
  v_subtotal numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
BEGIN
  -- Get the order_id from the affected row
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;
  
  -- Calculate new subtotal from all line items
  SELECT COALESCE(SUM(line_total), 0)
  INTO v_subtotal
  FROM public.sales_order_items
  WHERE order_id = v_order_id;
  
  -- Calculate tax (assuming VAT is applied per-item, avg 22% for simplicity)
  -- Actually, we'll compute it properly from each item's vat_rate
  SELECT COALESCE(SUM(line_total * vat_rate / 100), 0)
  INTO v_tax_amount
  FROM public.sales_order_items
  WHERE order_id = v_order_id;
  
  -- Get existing discount_amount from order
  DECLARE
    v_discount_amount numeric;
  BEGIN
    SELECT COALESCE(discount_amount, 0)
    INTO v_discount_amount
    FROM public.sales_orders
    WHERE id = v_order_id;
    
    v_total_amount := v_subtotal - v_discount_amount + v_tax_amount;
  END;
  
  -- Update the order totals
  UPDATE public.sales_orders
  SET subtotal = v_subtotal,
      tax_amount = v_tax_amount,
      total_amount = v_total_amount,
      updated_at = now()
  WHERE id = v_order_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on sales_order_items to recalculate order totals
DROP TRIGGER IF EXISTS trg_recalculate_order_totals ON public.sales_order_items;
CREATE TRIGGER trg_recalculate_order_totals
AFTER INSERT OR UPDATE OF quantity, unit_price, discount_percent, line_total, vat_rate OR DELETE
ON public.sales_order_items
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_order_totals();

-- Backfill: sync existing deals with their orders
UPDATE public.deals d
SET value = (
  SELECT COALESCE(SUM(so.total_amount), 0)
  FROM public.sales_orders so
  WHERE so.deal_id = d.id
    AND so.status != 'cancelled'
)
WHERE EXISTS (
  SELECT 1 FROM public.sales_orders so
  WHERE so.deal_id = d.id
);

-- Set value to NULL where it's 0 (no real orders)
UPDATE public.deals
SET value = NULL
WHERE value = 0;