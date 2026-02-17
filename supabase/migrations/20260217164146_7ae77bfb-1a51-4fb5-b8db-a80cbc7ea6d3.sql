
-- Add plan_details JSONB to payments for installment/rental metadata
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS plan_details JSONB DEFAULT NULL;

-- Add a validation trigger (not CHECK, for flexibility)
CREATE OR REPLACE FUNCTION public.validate_payment_plan_details()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- installment requires: num_installments, installment_amount
  IF NEW.method = 'installment' THEN
    IF NEW.plan_details IS NULL 
       OR (NEW.plan_details->>'num_installments') IS NULL
       OR (NEW.plan_details->>'installment_amount') IS NULL THEN
      RAISE EXCEPTION 'Installment payments require plan_details with num_installments and installment_amount';
    END IF;
    IF (NEW.plan_details->>'num_installments')::int < 2 THEN
      RAISE EXCEPTION 'num_installments must be >= 2';
    END IF;
  END IF;

  -- rental requires: monthly_fee, duration_months, start_date
  IF NEW.method = 'rental' THEN
    IF NEW.plan_details IS NULL
       OR (NEW.plan_details->>'monthly_fee') IS NULL
       OR (NEW.plan_details->>'duration_months') IS NULL
       OR (NEW.plan_details->>'start_date') IS NULL THEN
      RAISE EXCEPTION 'Rental payments require plan_details with monthly_fee, duration_months, and start_date';
    END IF;
    IF (NEW.plan_details->>'duration_months')::int < 1 THEN
      RAISE EXCEPTION 'duration_months must be >= 1';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payment_plan ON public.payments;
CREATE TRIGGER trg_validate_payment_plan
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_plan_details();

-- RPC: get revenue breakdown by payment method for a brand + date range
CREATE OR REPLACE FUNCTION public.get_revenue_by_payment_method(
  p_brand_id UUID,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(method TEXT, total_revenue NUMERIC, order_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.method::TEXT,
    COALESCE(SUM(p.amount), 0) AS total_revenue,
    COUNT(DISTINCT p.order_id) AS order_count
  FROM payments p
  WHERE p.brand_id = p_brand_id
    AND p.status = 'completed'
    AND (p_from IS NULL OR p.paid_at >= p_from)
    AND (p_to IS NULL OR p.paid_at <= p_to)
  GROUP BY p.method
  ORDER BY total_revenue DESC;
$$;
