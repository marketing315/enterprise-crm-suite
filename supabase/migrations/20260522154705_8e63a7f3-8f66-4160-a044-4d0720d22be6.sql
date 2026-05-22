
-- 1) Enum order_lifecycle_status
DO $$ BEGIN
  CREATE TYPE public.order_lifecycle_status AS ENUM (
    'lead','contacted','appointment_set','appointment_done',
    'quoted','sold','contract_signed','paid','delivered','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_lifecycle_actor AS ENUM (
    'callcenter','venditore','amministrazione','ai_bot','system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Estensioni sales_orders (additive, nullable)
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS lifecycle_status public.order_lifecycle_status,
  ADD COLUMN IF NOT EXISTS lifecycle_actor_role public.order_lifecycle_actor,
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sales_orders_lifecycle
  ON public.sales_orders(brand_id, lifecycle_status, lifecycle_updated_at DESC);

-- 3) Tabella append-only eventi lifecycle
CREATE TABLE IF NOT EXISTS public.sales_order_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  from_status public.order_lifecycle_status,
  to_status public.order_lifecycle_status NOT NULL,
  actor_role public.order_lifecycle_actor NOT NULL,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sole_order ON public.sales_order_lifecycle_events(order_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sole_brand_when ON public.sales_order_lifecycle_events(brand_id, occurred_at DESC);

ALTER TABLE public.sales_order_lifecycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lifecycle_events_select_brand" ON public.sales_order_lifecycle_events
  FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "lifecycle_events_insert_brand" ON public.sales_order_lifecycle_events
  FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Append-only: nessuna UPDATE/DELETE (RLS deny by default)

-- 4) Tabella sales_bonus_tiers
CREATE TABLE IF NOT EXISTS public.sales_bonus_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  label text NOT NULL,
  threshold_gross numeric(12,2) NOT NULL CHECK (threshold_gross >= 0),
  bonus_amount numeric(12,2),
  bonus_percent numeric(5,2),
  valid_from date NOT NULL,
  valid_to date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CHECK (bonus_amount IS NOT NULL OR bonus_percent IS NOT NULL),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_sales_bonus_tiers_brand
  ON public.sales_bonus_tiers(brand_id, valid_from DESC, threshold_gross DESC);

CREATE TRIGGER trg_sales_bonus_tiers_updated_at
  BEFORE UPDATE ON public.sales_bonus_tiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sales_bonus_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bonus_tiers_select_brand" ON public.sales_bonus_tiers
  FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "bonus_tiers_manage_admin" ON public.sales_bonus_tiers
  FOR ALL TO authenticated
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori'::app_role)
  )
  WITH CHECK (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori'::app_role)
  );

-- 5) Helper: applica tier su importo lordo
CREATE OR REPLACE FUNCTION public.compute_bonus_for_amount(
  p_brand_id uuid,
  p_amount numeric,
  p_at timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH applicable AS (
    SELECT id, label, threshold_gross, bonus_amount, bonus_percent
    FROM public.sales_bonus_tiers t
    WHERE t.brand_id = p_brand_id
      AND t.valid_from <= (p_at AT TIME ZONE 'Europe/Rome')::date
      AND (t.valid_to IS NULL OR t.valid_to >= (p_at AT TIME ZONE 'Europe/Rome')::date)
      AND COALESCE(p_amount,0) >= t.threshold_gross
    ORDER BY t.threshold_gross DESC
    LIMIT 1
  )
  SELECT COALESCE(jsonb_build_object(
    'tier_id', id,
    'tier_label', label,
    'threshold_gross', threshold_gross,
    'bonus_amount', COALESCE(bonus_amount, 0) + COALESCE(p_amount * bonus_percent / 100.0, 0),
    'bonus_amount_fixed', bonus_amount,
    'bonus_percent', bonus_percent
  ), '{"tier_id":null,"tier_label":null,"bonus_amount":0}'::jsonb)
  FROM applicable;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_bonus_for_amount(uuid,numeric,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_bonus_for_amount(uuid,numeric,timestamptz) TO authenticated;

-- 6) RPC get_salesperson_kpis_v2 — vista Foglio per venditore
CREATE OR REPLACE FUNCTION public.get_salesperson_kpis_v2(
  p_brand_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_user_ids uuid[] DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz;
  v_result json;
BEGIN
  IF NOT user_belongs_to_brand(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  v_from := COALESCE(p_from, date_trunc('month', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome');
  v_to := COALESCE(p_to, now());

  WITH sellers AS (
    SELECT DISTINCT u.id, u.full_name, u.email
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE ur.brand_id = p_brand_id
      AND ur.role IN ('venditore'::app_role, 'responsabile_venditori'::app_role)
      AND (p_user_ids IS NULL OR u.id = ANY(p_user_ids))
  ),
  appts AS (
    SELECT
      a.assigned_sales_user_id AS user_id,
      COUNT(*) FILTER (WHERE a.scheduled_at >= v_from AND a.scheduled_at < v_to) AS programmati,
      COUNT(*) FILTER (WHERE a.scheduled_at >= v_from AND a.scheduled_at < v_to AND a.status = 'completed') AS eseguiti,
      COUNT(*) FILTER (WHERE a.scheduled_at >= v_from AND a.scheduled_at < v_to AND a.status = 'no_show') AS no_show,
      COUNT(*) FILTER (WHERE a.scheduled_at >= v_from AND a.scheduled_at < v_to AND a.status = 'cancelled') AS cancellati,
      COUNT(*) FILTER (WHERE a.scheduled_at >= v_from AND a.scheduled_at < v_to AND a.last_outcome_code = 'executed') AS esiti_executed
    FROM public.appointments a
    WHERE a.brand_id = p_brand_id
      AND a.assigned_sales_user_id IS NOT NULL
    GROUP BY a.assigned_sales_user_id
  ),
  orders_period AS (
    SELECT
      so.assigned_user_id AS user_id,
      COUNT(*) FILTER (WHERE so.status IN ('confirmed','paid') AND COALESCE(so.confirmed_at, so.created_at) >= v_from AND COALESCE(so.confirmed_at, so.created_at) < v_to) AS ordini_venduti,
      COALESCE(SUM(so.total_amount) FILTER (WHERE so.status IN ('confirmed','paid') AND COALESCE(so.confirmed_at, so.created_at) >= v_from AND COALESCE(so.confirmed_at, so.created_at) < v_to), 0)::numeric AS lordo,
      COUNT(*) FILTER (WHERE so.delivered_at IS NOT NULL AND so.delivered_at >= v_from AND so.delivered_at < v_to) AS consegnati_periodo
    FROM public.sales_orders so
    WHERE so.brand_id = p_brand_id
      AND so.assigned_user_id IS NOT NULL
    GROUP BY so.assigned_user_id
  )
  SELECT json_agg(row_to_json(r) ORDER BY r.full_name) INTO v_result
  FROM (
    SELECT
      s.id AS user_id,
      s.full_name,
      s.email,
      COALESCE(ap.programmati, 0) AS appuntamenti_programmati,
      COALESCE(ap.eseguiti, 0) AS appuntamenti_eseguiti,
      COALESCE(ap.no_show, 0) AS no_show,
      COALESCE(ap.cancellati, 0) AS cancellati,
      CASE WHEN COALESCE(ap.programmati,0) > 0
        THEN ROUND(COALESCE(ap.eseguiti,0)::numeric * 100 / ap.programmati, 2)
        ELSE 0 END AS perc_esecuzione,
      COALESCE(op.ordini_venduti, 0) AS ordini_venduti,
      CASE WHEN COALESCE(ap.eseguiti,0) > 0
        THEN ROUND(COALESCE(op.ordini_venduti,0)::numeric * 100 / ap.eseguiti, 2)
        ELSE 0 END AS perc_vendita,
      COALESCE(op.lordo, 0) AS lordo,
      ROUND(COALESCE(op.lordo,0) / 1.22, 2) AS imponibile,
      COALESCE(op.consegnati_periodo, 0) AS consegnati_periodo,
      CASE WHEN COALESCE(op.ordini_venduti,0) > 0
        THEN ROUND(COALESCE(op.consegnati_periodo,0)::numeric * 100 / op.ordini_venduti, 2)
        ELSE 0 END AS perc_consegne_periodo,
      public.compute_bonus_for_amount(p_brand_id, COALESCE(op.lordo,0), v_to) AS bonus
    FROM sellers s
    LEFT JOIN appts ap ON ap.user_id = s.id
    LEFT JOIN orders_period op ON op.user_id = s.id
  ) r;

  RETURN json_build_object(
    'period', json_build_object('from', v_from, 'to', v_to),
    'rows', COALESCE(v_result, '[]'::json),
    'calc_version', 'v2.0'
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_salesperson_kpis_v2(uuid,timestamptz,timestamptz,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_salesperson_kpis_v2(uuid,timestamptz,timestamptz,uuid[]) TO authenticated;

-- 7) RPC aggregate brand
CREATE OR REPLACE FUNCTION public.get_salesperson_kpis_aggregate(
  p_brand_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
  v_from timestamptz;
  v_to timestamptz;
  v_rows jsonb;
BEGIN
  IF NOT user_belongs_to_brand(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  v_from := COALESCE(p_from, date_trunc('month', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome');
  v_to := COALESCE(p_to, now());

  SELECT (public.get_salesperson_kpis_v2(p_brand_id, v_from, v_to, NULL)::jsonb)->'rows' INTO v_rows;

  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'total_sellers', COALESCE(jsonb_array_length(v_rows), 0),
    'appuntamenti_programmati', COALESCE((SELECT SUM((x->>'appuntamenti_programmati')::numeric) FROM jsonb_array_elements(v_rows) x), 0),
    'appuntamenti_eseguiti', COALESCE((SELECT SUM((x->>'appuntamenti_eseguiti')::numeric) FROM jsonb_array_elements(v_rows) x), 0),
    'no_show', COALESCE((SELECT SUM((x->>'no_show')::numeric) FROM jsonb_array_elements(v_rows) x), 0),
    'cancellati', COALESCE((SELECT SUM((x->>'cancellati')::numeric) FROM jsonb_array_elements(v_rows) x), 0),
    'ordini_venduti', COALESCE((SELECT SUM((x->>'ordini_venduti')::numeric) FROM jsonb_array_elements(v_rows) x), 0),
    'lordo', COALESCE((SELECT SUM((x->>'lordo')::numeric) FROM jsonb_array_elements(v_rows) x), 0),
    'imponibile', COALESCE((SELECT SUM((x->>'imponibile')::numeric) FROM jsonb_array_elements(v_rows) x), 0),
    'consegnati_periodo', COALESCE((SELECT SUM((x->>'consegnati_periodo')::numeric) FROM jsonb_array_elements(v_rows) x), 0),
    'bonus_totale', COALESCE((SELECT SUM(((x->'bonus')->>'bonus_amount')::numeric) FROM jsonb_array_elements(v_rows) x), 0),
    'calc_version', 'v2.0'
  ) INTO v;

  RETURN v::json;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_salesperson_kpis_aggregate(uuid,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_salesperson_kpis_aggregate(uuid,timestamptz,timestamptz) TO authenticated;
