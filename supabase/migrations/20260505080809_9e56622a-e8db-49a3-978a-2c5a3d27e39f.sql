
-- ============================================================
-- Giro Venditori: schedules, dispatches, columns, RPCs
-- Additive-only migration. No DROP, no destructive change.
-- ============================================================

-- 1. Confirmed by callcenter timestamp (optional, nullable)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmed_by_callcenter_at timestamptz;

CREATE INDEX IF NOT EXISTS ix_appointments_confirmed_callcenter
  ON public.appointments (brand_id, confirmed_by_callcenter_at)
  WHERE confirmed_by_callcenter_at IS NOT NULL;

-- 2. Schedule table (per-brand cron config)
CREATE TABLE IF NOT EXISTS public.sales_route_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL UNIQUE REFERENCES public.brands(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  -- ISO weekdays 1=Mon ... 7=Sun
  days_of_week int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::int[],
  -- HH:MM in local timezone
  send_at_local time NOT NULL DEFAULT '20:00'::time,
  timezone text NOT NULL DEFAULT 'Europe/Rome',
  -- 'with_appointments' (default): only sales users with >=1 appointment in window
  recipients_mode text NOT NULL DEFAULT 'with_appointments',
  -- Aggregate recipients (sales managers + CEO emails)
  aggregate_recipient_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  aggregate_extra_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  send_aggregate boolean NOT NULL DEFAULT true,
  -- Last execution tracking
  last_run_at timestamptz,
  last_run_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_route_recipients_mode_chk
    CHECK (recipients_mode IN ('with_appointments','all_active'))
);

ALTER TABLE public.sales_route_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand members read schedules"
ON public.sales_route_schedules FOR SELECT TO authenticated
USING (public.user_belongs_to_brand(public.get_user_id(auth.uid()), brand_id));

CREATE POLICY "admins manage schedules"
ON public.sales_route_schedules FOR ALL TO authenticated
USING (
  public.user_belongs_to_brand(public.get_user_id(auth.uid()), brand_id)
  AND (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::public.app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::public.app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'responsabile_venditori'::public.app_role)
  )
)
WITH CHECK (
  public.user_belongs_to_brand(public.get_user_id(auth.uid()), brand_id)
  AND (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::public.app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::public.app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'responsabile_venditori'::public.app_role)
  )
);

CREATE TRIGGER trg_sales_route_schedules_updated_at
BEFORE UPDATE ON public.sales_route_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Dispatches log (append-only)
CREATE TABLE IF NOT EXISTS public.sales_route_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  route_date date NOT NULL,
  dispatch_type text NOT NULL, -- 'individual' | 'aggregate'
  audience text NOT NULL, -- 'sales' | 'managers'
  recipient_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  appointments_count int NOT NULL DEFAULT 0,
  appointment_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  email_message_id text,
  status text NOT NULL DEFAULT 'pending', -- pending|sent|failed|skipped
  error_message text,
  triggered_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  trigger_source text NOT NULL DEFAULT 'cron', -- 'cron'|'manual_single'|'manual_bulk'
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sales_route_dispatches_brand_date
  ON public.sales_route_dispatches (brand_id, route_date DESC);

CREATE INDEX IF NOT EXISTS ix_sales_route_dispatches_recipient
  ON public.sales_route_dispatches (recipient_user_id, route_date DESC);

ALTER TABLE public.sales_route_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand managers read dispatches"
ON public.sales_route_dispatches FOR SELECT TO authenticated
USING (
  public.user_belongs_to_brand(public.get_user_id(auth.uid()), brand_id)
  AND (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::public.app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::public.app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'responsabile_venditori'::public.app_role)
    OR recipient_user_id = public.get_user_id(auth.uid())
  )
);

-- service_role inserts via edge function; no INSERT policy for clients

-- 4. RPC: get individual route (for one sales user, on a date)
CREATE OR REPLACE FUNCTION public.get_sales_route_for_user(
  p_brand_id uuid,
  p_user_id uuid,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_id(auth.uid());
  v_user record;
  v_appointments jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Caller must be admin/CEO/manager of brand OR the user themselves
  IF NOT public.user_belongs_to_brand(v_caller, p_brand_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_caller <> p_user_id
     AND NOT public.has_role(v_caller, 'admin'::public.app_role)
     AND NOT public.has_role(v_caller, 'ceo'::public.app_role)
     AND NOT public.has_role(v_caller, 'responsabile_venditori'::public.app_role)
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id, full_name, email
    INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = '02000';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb ORDER BY (a->>'scheduled_at')), '[]'::jsonb)
    INTO v_appointments
  FROM (
    SELECT
      ap.id,
      ap.scheduled_at,
      ap.duration_minutes,
      ap.status::text AS status,
      ap.appointment_type::text AS appointment_type,
      ap.appointment_order,
      ap.address,
      ap.city,
      ap.cap,
      ap.notes,
      ap.last_outcome_code::text AS last_outcome_code,
      ap.last_outcome_at,
      ap.risk_score,
      jsonb_build_object(
        'id', c.id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'phone', c.phone,
        'phone_normalized', c.phone_normalized,
        'address', COALESCE(c.address, ap.address),
        'city', COALESCE(c.city, ap.city),
        'cap', COALESCE(c.cap, ap.cap),
        'notes', c.notes
      ) AS contact
    FROM public.appointments ap
    JOIN public.contacts c ON c.id = ap.contact_id
    WHERE ap.brand_id = p_brand_id
      AND ap.assigned_sales_user_id = p_user_id
      AND ap.scheduled_at >= (p_date::timestamp AT TIME ZONE 'Europe/Rome')
      AND ap.scheduled_at <  ((p_date + 1)::timestamp AT TIME ZONE 'Europe/Rome')
      AND ap.status IN ('confirmed','scheduled')
    ORDER BY ap.scheduled_at
    LIMIT 100
  ) a;

  RETURN jsonb_build_object(
    'user', jsonb_build_object('id', v_user.id, 'full_name', v_user.full_name, 'email', v_user.email),
    'route_date', p_date,
    'brand_id', p_brand_id,
    'appointments', v_appointments,
    'count', jsonb_array_length(v_appointments)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_sales_route_for_user(uuid,uuid,date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_sales_route_for_user(uuid,uuid,date) TO authenticated, service_role;

-- 5. RPC: aggregate route for managers/CEO
CREATE OR REPLACE FUNCTION public.get_sales_route_aggregate(
  p_brand_id uuid,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_id(auth.uid());
  v_groups jsonb;
  v_total int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.user_belongs_to_brand(v_caller, p_brand_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_caller, 'admin'::public.app_role)
    OR public.has_role(v_caller, 'ceo'::public.app_role)
    OR public.has_role(v_caller, 'responsabile_venditori'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->'user'->>'full_name'), '[]'::jsonb), COALESCE(SUM((g->>'count')::int), 0)
    INTO v_groups, v_total
  FROM (
    SELECT jsonb_build_object(
      'user', jsonb_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email),
      'count', COUNT(ap.id),
      'appointments', jsonb_agg(jsonb_build_object(
        'id', ap.id,
        'scheduled_at', ap.scheduled_at,
        'status', ap.status,
        'address', COALESCE(c.address, ap.address),
        'city', COALESCE(c.city, ap.city),
        'contact_name', trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))
      ) ORDER BY ap.scheduled_at)
    ) AS g
    FROM public.appointments ap
    JOIN public.users u ON u.id = ap.assigned_sales_user_id
    JOIN public.contacts c ON c.id = ap.contact_id
    WHERE ap.brand_id = p_brand_id
      AND ap.scheduled_at >= (p_date::timestamp AT TIME ZONE 'Europe/Rome')
      AND ap.scheduled_at <  ((p_date + 1)::timestamp AT TIME ZONE 'Europe/Rome')
      AND ap.status IN ('confirmed','scheduled')
      AND ap.assigned_sales_user_id IS NOT NULL
    GROUP BY u.id, u.full_name, u.email
  ) groups;

  RETURN jsonb_build_object(
    'brand_id', p_brand_id,
    'route_date', p_date,
    'groups', v_groups,
    'total_appointments', v_total,
    'sellers_count', jsonb_array_length(v_groups)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_sales_route_aggregate(uuid,date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_sales_route_aggregate(uuid,date) TO authenticated, service_role;

-- 6. RPC: default recipients (sales users with >=1 appointment)
CREATE OR REPLACE FUNCTION public.get_sales_route_recipients_default(
  p_brand_id uuid,
  p_date date
)
RETURNS TABLE(user_id uuid, full_name text, email text, appointments_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.full_name, u.email, COUNT(ap.id)::int AS appointments_count
  FROM public.users u
  JOIN public.appointments ap ON ap.assigned_sales_user_id = u.id
  WHERE ap.brand_id = p_brand_id
    AND ap.scheduled_at >= (p_date::timestamp AT TIME ZONE 'Europe/Rome')
    AND ap.scheduled_at <  ((p_date + 1)::timestamp AT TIME ZONE 'Europe/Rome')
    AND ap.status IN ('confirmed','scheduled')
    AND u.email IS NOT NULL AND u.email <> ''
  GROUP BY u.id, u.full_name, u.email
  HAVING COUNT(ap.id) > 0
  ORDER BY u.full_name
  LIMIT 200;
$$;

REVOKE EXECUTE ON FUNCTION public.get_sales_route_recipients_default(uuid,date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_sales_route_recipients_default(uuid,date) TO authenticated, service_role;

-- 7. RPC: upsert schedule
CREATE OR REPLACE FUNCTION public.upsert_sales_route_schedule(p_payload jsonb)
RETURNS public.sales_route_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_id(auth.uid());
  v_brand uuid := (p_payload->>'brand_id')::uuid;
  v_row public.sales_route_schedules;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'brand_id required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.user_belongs_to_brand(v_caller, v_brand) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(v_caller, 'admin'::public.app_role)
    OR public.has_role(v_caller, 'ceo'::public.app_role)
    OR public.has_role(v_caller, 'responsabile_venditori'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden: admin/ceo/responsabile_venditori only' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sales_route_schedules AS s (
    brand_id, is_active, days_of_week, send_at_local, timezone,
    recipients_mode, aggregate_recipient_user_ids, aggregate_extra_emails, send_aggregate
  ) VALUES (
    v_brand,
    COALESCE((p_payload->>'is_active')::boolean, false),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'days_of_week'))::int[], ARRAY[1,2,3,4,5]),
    COALESCE((p_payload->>'send_at_local')::time, '20:00'::time),
    COALESCE(p_payload->>'timezone', 'Europe/Rome'),
    COALESCE(p_payload->>'recipients_mode', 'with_appointments'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'aggregate_recipient_user_ids'))::uuid[], ARRAY[]::uuid[]),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'aggregate_extra_emails'))::text[], ARRAY[]::text[]),
    COALESCE((p_payload->>'send_aggregate')::boolean, true)
  )
  ON CONFLICT (brand_id) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    days_of_week = EXCLUDED.days_of_week,
    send_at_local = EXCLUDED.send_at_local,
    timezone = EXCLUDED.timezone,
    recipients_mode = EXCLUDED.recipients_mode,
    aggregate_recipient_user_ids = EXCLUDED.aggregate_recipient_user_ids,
    aggregate_extra_emails = EXCLUDED.aggregate_extra_emails,
    send_aggregate = EXCLUDED.send_aggregate,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_sales_route_schedule(jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.upsert_sales_route_schedule(jsonb) TO authenticated;

-- 8. RPC: list dispatches
CREATE OR REPLACE FUNCTION public.list_sales_route_dispatches(
  p_brand_id uuid,
  p_from date DEFAULT (now()::date - 30),
  p_to date DEFAULT (now()::date + 1)
)
RETURNS SETOF public.sales_route_dispatches
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.sales_route_dispatches
  WHERE brand_id = p_brand_id
    AND route_date BETWEEN p_from AND p_to
  ORDER BY created_at DESC
  LIMIT 500;
$$;

REVOKE EXECUTE ON FUNCTION public.list_sales_route_dispatches(uuid,date,date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.list_sales_route_dispatches(uuid,date,date) TO authenticated, service_role;
