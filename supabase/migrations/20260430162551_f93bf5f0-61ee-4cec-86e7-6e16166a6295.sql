-- Punto 8: Funzioni reminder pagamenti

-- Funzione che esplode le rate da plan_details e calcola scadenze
CREATE OR REPLACE FUNCTION public.get_overdue_installments(
  p_brand_id uuid,
  p_days_ahead integer DEFAULT 7
)
RETURNS TABLE (
  payment_id uuid,
  order_id uuid,
  brand_id uuid,
  contact_id uuid,
  contact_name text,
  order_number text,
  total_amount numeric,
  paid_amount numeric,
  remaining_amount numeric,
  installment_index integer,
  installment_amount numeric,
  due_date date,
  days_overdue integer,
  status text,
  assigned_user_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH series AS (
    SELECT
      p.id AS payment_id,
      p.order_id,
      p.brand_id,
      so.contact_id,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), c.email, 'Cliente')::text AS contact_name,
      so.order_number,
      so.total_amount,
      so.paid_amount,
      (so.total_amount - so.paid_amount)::numeric AS remaining_amount,
      so.assigned_user_id,
      gs.idx AS installment_index,
      COALESCE((p.plan_details->>'installment_amount')::numeric, 0) AS installment_amount,
      (
        COALESCE((p.plan_details->>'first_due_date')::date, p.created_at::date)
        + (gs.idx * COALESCE((p.plan_details->>'frequency_months')::integer, 1) || ' month')::interval
      )::date AS due_date,
      COALESCE((p.plan_details->>'num_installments')::integer, 0) AS num_installments
    FROM public.payments p
    JOIN public.sales_orders so ON so.id = p.order_id
    LEFT JOIN public.contacts c ON c.id = so.contact_id
    CROSS JOIN LATERAL generate_series(0, GREATEST(COALESCE((p.plan_details->>'num_installments')::integer, 1) - 1, 0)) AS gs(idx)
    WHERE p.brand_id = p_brand_id
      AND p.plan_details IS NOT NULL
      AND p.plan_details ? 'num_installments'
      AND so.status NOT IN ('cancelled', 'refunded', 'paid')
  )
  SELECT
    s.payment_id,
    s.order_id,
    s.brand_id,
    s.contact_id,
    s.contact_name,
    s.order_number,
    s.total_amount,
    s.paid_amount,
    s.remaining_amount,
    s.installment_index,
    s.installment_amount,
    s.due_date,
    GREATEST(0, (CURRENT_DATE - s.due_date))::integer AS days_overdue,
    CASE
      WHEN s.due_date < CURRENT_DATE THEN 'overdue'
      WHEN s.due_date <= CURRENT_DATE + p_days_ahead THEN 'upcoming'
      ELSE 'future'
    END AS status,
    s.assigned_user_id
  FROM series s
  WHERE s.due_date <= CURRENT_DATE + p_days_ahead
  ORDER BY s.due_date ASC
  LIMIT 500;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_overdue_installments(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_overdue_installments(uuid, integer) TO authenticated;

-- Funzione che genera notifiche per le rate in ritardo (idempotente per giorno)
CREATE OR REPLACE FUNCTION public.enqueue_payment_overdue_notifications(p_brand_id uuid DEFAULT NULL)
RETURNS TABLE (notifications_created integer, brands_processed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created integer := 0;
  v_brands integer := 0;
  v_brand record;
  v_row record;
  v_recipient uuid;
BEGIN
  FOR v_brand IN
    SELECT id FROM public.brands
    WHERE (p_brand_id IS NULL OR id = p_brand_id)
  LOOP
    v_brands := v_brands + 1;

    FOR v_row IN
      SELECT * FROM public.get_overdue_installments(v_brand.id, 0)
      WHERE status = 'overdue' AND days_overdue >= 1
    LOOP
      -- destinatario: assigned_user, fallback admin del brand
      v_recipient := v_row.assigned_user_id;
      IF v_recipient IS NULL THEN
        SELECT ur.user_id INTO v_recipient
        FROM public.user_roles ur
        WHERE ur.brand_id = v_brand.id
          AND ur.role IN ('admin', 'responsabile_venditori')
        LIMIT 1;
      END IF;

      IF v_recipient IS NULL THEN CONTINUE; END IF;

      -- Dedup: niente notifica se ne esiste già una nelle ultime 24h per la stessa rata
      IF EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_recipient
          AND n.type = 'payment_overdue'
          AND n.entity_id = v_row.order_id
          AND n.body LIKE '%rata #' || (v_row.installment_index + 1) || '%'
          AND n.created_at > NOW() - INTERVAL '24 hours'
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.notifications (
        brand_id, user_id, type, title, body, entity_type, entity_id
      ) VALUES (
        v_brand.id,
        v_recipient,
        'payment_overdue',
        'Rata in ritardo: ' || v_row.contact_name,
        'Ordine ' || v_row.order_number || ' • rata #' || (v_row.installment_index + 1)
          || ' di ' || to_char(v_row.installment_amount, 'FM999G999D00') || '€'
          || ' scaduta il ' || to_char(v_row.due_date, 'DD/MM/YYYY')
          || ' (' || v_row.days_overdue || ' giorni di ritardo)',
        'sales_order',
        v_row.order_id
      );
      v_created := v_created + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_created, v_brands;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_payment_overdue_notifications(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enqueue_payment_overdue_notifications(uuid) TO authenticated;
