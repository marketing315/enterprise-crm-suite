-- ============================================================
-- SALES AVAILABILITY & CAPACITY (PURELY ADDITIVE)
-- ============================================================

-- 1) Recurring weekly availability slots
CREATE TABLE IF NOT EXISTS public.sales_availability (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL,
  user_id       uuid NOT NULL,
  weekday       smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sun, 6=Sat (matches PostgreSQL DOW)
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  valid_from    date NOT NULL DEFAULT current_date,
  valid_to      date,
  notes         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_availability_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_sales_availability_brand_user
  ON public.sales_availability(brand_id, user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sales_availability_weekday
  ON public.sales_availability(weekday) WHERE is_active = true;

-- 2) Time off / exceptions
DO $$ BEGIN
  CREATE TYPE public.sales_time_off_type AS ENUM ('vacation', 'sick', 'personal', 'training', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.sales_time_off (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL,
  user_id     uuid NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  off_type    public.sales_time_off_type NOT NULL DEFAULT 'vacation',
  reason      text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_time_off_date_order CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_sales_time_off_brand_user
  ON public.sales_time_off(brand_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sales_time_off_dates
  ON public.sales_time_off(start_date, end_date);

-- 3) RLS
ALTER TABLE public.sales_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_time_off ENABLE ROW LEVEL SECURITY;

-- SELECT: brand members can see their brand's slots
DO $$ BEGIN
  CREATE POLICY "sales_availability_select_brand" ON public.sales_availability
    FOR SELECT TO authenticated
    USING (
      brand_id = '00000000-0000-0000-0000-000000000000'::uuid
      OR public.user_belongs_to_brand(public.get_user_id(auth.uid()), brand_id)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sales_time_off_select_brand" ON public.sales_time_off
    FOR SELECT TO authenticated
    USING (public.user_belongs_to_brand(public.get_user_id(auth.uid()), brand_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- INSERT/UPDATE/DELETE: only admins/responsabili
DO $$ BEGIN
  CREATE POLICY "sales_availability_write_admins" ON public.sales_availability
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = public.get_user_id(auth.uid())
          AND ur.brand_id = sales_availability.brand_id
          AND ur.is_active = true
          AND ur.role IN ('admin', 'responsabile_venditori')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = public.get_user_id(auth.uid())
          AND ur.brand_id = sales_availability.brand_id
          AND ur.is_active = true
          AND ur.role IN ('admin', 'responsabile_venditori')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sales_time_off_write_admins" ON public.sales_time_off
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = public.get_user_id(auth.uid())
          AND ur.brand_id = sales_time_off.brand_id
          AND ur.is_active = true
          AND ur.role IN ('admin', 'responsabile_venditori')
      )
      OR user_id = public.get_user_id(auth.uid())  -- Sales can manage their own time off
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = public.get_user_id(auth.uid())
          AND ur.brand_id = sales_time_off.brand_id
          AND ur.is_active = true
          AND ur.role IN ('admin', 'responsabile_venditori')
      )
      OR user_id = public.get_user_id(auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Updated_at trigger for sales_availability
CREATE OR REPLACE FUNCTION public.touch_sales_availability_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_availability_updated_at ON public.sales_availability;
CREATE TRIGGER trg_sales_availability_updated_at
BEFORE UPDATE ON public.sales_availability
FOR EACH ROW EXECUTE FUNCTION public.touch_sales_availability_updated_at();

-- 5) Capacity RPC: aggregate available vs booked minutes per sales over a range
CREATE OR REPLACE FUNCTION public.get_sales_capacity(
  p_brand_id  uuid,
  p_date_from date,
  p_date_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_date_to < p_date_from THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH
  -- All sales users for this brand
  sales_users AS (
    SELECT DISTINCT u.id, u.full_name, u.email
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE ur.brand_id = p_brand_id
      AND ur.is_active = true
      AND ur.role IN ('venditore', 'responsabile_venditori', 'sales')
    LIMIT 500
  ),
  -- Days in range
  days AS (
    SELECT d::date AS day, EXTRACT(DOW FROM d)::smallint AS weekday
    FROM generate_series(p_date_from, p_date_to, interval '1 day') d
  ),
  -- Available minutes per (sales, day): sum of slot durations matching weekday, minus time off
  avail_per_day AS (
    SELECT
      su.id AS user_id,
      d.day,
      COALESCE(SUM(EXTRACT(EPOCH FROM (sa.end_time - sa.start_time)) / 60)::int, 0) AS available_minutes
    FROM sales_users su
    CROSS JOIN days d
    LEFT JOIN public.sales_availability sa
      ON sa.user_id = su.id
      AND sa.brand_id = p_brand_id
      AND sa.is_active = true
      AND sa.weekday = d.weekday
      AND sa.valid_from <= d.day
      AND (sa.valid_to IS NULL OR sa.valid_to >= d.day)
    LEFT JOIN public.sales_time_off sto
      ON sto.user_id = su.id
      AND sto.brand_id = p_brand_id
      AND d.day BETWEEN sto.start_date AND sto.end_date
    WHERE sto.id IS NULL  -- exclude days off
    GROUP BY su.id, d.day
  ),
  -- Booked minutes per sales in range
  booked AS (
    SELECT
      a.assigned_sales_user_id AS user_id,
      COALESCE(SUM(a.duration_minutes), 0)::int AS booked_minutes,
      COUNT(*)::int AS appointment_count
    FROM public.appointments a
    WHERE a.brand_id = p_brand_id
      AND a.assigned_sales_user_id IS NOT NULL
      AND a.scheduled_at::date BETWEEN p_date_from AND p_date_to
      AND a.status NOT IN ('cancelled', 'no_show')
    GROUP BY a.assigned_sales_user_id
    LIMIT 500
  ),
  -- Aggregated availability per sales
  agg AS (
    SELECT
      user_id,
      SUM(available_minutes)::int AS available_minutes,
      COUNT(*) FILTER (WHERE available_minutes > 0)::int AS working_days
    FROM avail_per_day
    GROUP BY user_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id', su.id,
      'full_name', su.full_name,
      'email', su.email,
      'available_minutes', COALESCE(agg.available_minutes, 0),
      'booked_minutes', COALESCE(b.booked_minutes, 0),
      'appointment_count', COALESCE(b.appointment_count, 0),
      'working_days', COALESCE(agg.working_days, 0),
      'utilization_pct', CASE
        WHEN COALESCE(agg.available_minutes, 0) > 0
          THEN ROUND((COALESCE(b.booked_minutes, 0)::numeric / agg.available_minutes) * 100, 1)
        ELSE NULL
      END
    )
    ORDER BY su.full_name
  )
  INTO v_result
  FROM sales_users su
  LEFT JOIN agg ON agg.user_id = su.id
  LEFT JOIN booked b ON b.user_id = su.id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_sales_capacity(uuid, date, date) IS
'Returns capacity per sales user for date range: available_minutes (from recurring slots minus time off) vs booked_minutes (from active appointments).';