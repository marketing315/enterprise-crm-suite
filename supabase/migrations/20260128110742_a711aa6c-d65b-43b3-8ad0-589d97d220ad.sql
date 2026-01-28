
-- ============================================================
-- FIX 2.1: Update search_lead_events with role check for p_include_archived
-- FIX 2.2: Create set_lead_event_archived RPC (no direct UPDATE)
-- STEP 3: Appointments table + RPCs + RLS
-- ============================================================

-- ============================================================
-- FIX 2.1: Update search_lead_events to enforce role check
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_lead_events(
  p_brand_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_source_name text DEFAULT NULL,
  p_archived boolean DEFAULT false,
  p_include_archived boolean DEFAULT false,
  p_tag_ids uuid[] DEFAULT NULL,
  p_match_all_tags boolean DEFAULT false,
  p_priority_min int DEFAULT NULL,
  p_priority_max int DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_tag_count INTEGER;
  v_user_id uuid;
  v_user_role app_role;
BEGIN
  -- Get current user
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.supabase_auth_id = auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no application user found';
  END IF;
  
  -- Check user has access to brand
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to this brand';
  END IF;
  
  -- Get user role for this brand
  SELECT ur.role INTO v_user_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id AND ur.brand_id = p_brand_id
  LIMIT 1;
  
  -- FIX 2.1: Enforce archived visibility restriction
  IF p_include_archived = TRUE AND v_user_role NOT IN ('admin', 'ceo') THEN
    RAISE EXCEPTION 'Forbidden: archived visibility requires admin or ceo role';
  END IF;
  
  v_tag_count := COALESCE(array_length(p_tag_ids, 1), 0);
  
  WITH filtered_events AS (
    SELECT 
      le.id,
      le.brand_id,
      le.contact_id,
      le.deal_id,
      le.source,
      le.source_name,
      le.occurred_at,
      le.received_at,
      le.ai_priority,
      le.ai_confidence,
      le.ai_rationale,
      le.lead_type,
      le.archived,
      le.raw_payload,
      le.created_at,
      jsonb_build_object(
        'id', c.id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'status', c.status,
        'primary_phone', (
          SELECT cp.phone_raw 
          FROM contact_phones cp 
          WHERE cp.contact_id = c.id AND cp.is_primary = true 
          LIMIT 1
        )
      ) AS contact,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', t.id,
              'name', t.name,
              'color', t.color,
              'scope', t.scope
            )
          )
          FROM tag_assignments ta
          JOIN tags t ON t.id = ta.tag_id
          WHERE ta.lead_event_id = le.id
        ),
        '[]'::jsonb
      ) AS tags
    FROM lead_events le
    LEFT JOIN contacts c ON c.id = le.contact_id
    WHERE le.brand_id = p_brand_id
      AND (p_date_from IS NULL OR le.received_at >= p_date_from)
      AND (p_date_to IS NULL OR le.received_at <= p_date_to)
      AND (p_source IS NULL OR le.source::text = p_source)
      AND (p_source_name IS NULL OR le.source_name = p_source_name)
      AND (p_include_archived = TRUE OR le.archived = FALSE)
      AND (p_priority_min IS NULL OR le.ai_priority >= p_priority_min)
      AND (p_priority_max IS NULL OR le.ai_priority <= p_priority_max)
      AND (
        v_tag_count = 0 
        OR (
          p_match_all_tags = FALSE AND EXISTS (
            SELECT 1 FROM tag_assignments ta
            WHERE ta.lead_event_id = le.id AND ta.tag_id = ANY(p_tag_ids)
          )
        )
        OR (
          p_match_all_tags = TRUE AND (
            SELECT COUNT(DISTINCT ta.tag_id) 
            FROM tag_assignments ta
            WHERE ta.lead_event_id = le.id AND ta.tag_id = ANY(p_tag_ids)
          ) = v_tag_count
        )
      )
    ORDER BY le.received_at DESC
  ),
  counted AS (
    SELECT COUNT(*) as total FROM filtered_events
  ),
  paginated AS (
    SELECT * FROM filtered_events
    LIMIT p_limit OFFSET p_offset
  )
  SELECT 
    jsonb_build_object(
      'total', (SELECT total FROM counted),
      'limit', p_limit,
      'offset', p_offset,
      'events', COALESCE((SELECT jsonb_agg(row_to_json(p.*)) FROM paginated p), '[]'::jsonb)
    )::json
  INTO v_result;
  
  RETURN v_result;
END;
$$;

-- ============================================================
-- FIX 2.2: Create RPC for archiving lead_events (controlled access)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_lead_event_archived(
  p_event_id uuid,
  p_archived boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role app_role;
  v_brand_id uuid;
BEGIN
  -- Get current user
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.supabase_auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no application user found';
  END IF;

  -- Get event brand_id
  SELECT brand_id INTO v_brand_id
  FROM public.lead_events
  WHERE id = p_event_id;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Not found: event does not exist';
  END IF;

  -- Get user role for this brand
  SELECT ur.role INTO v_user_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id AND ur.brand_id = v_brand_id
  LIMIT 1;

  -- Only admin, ceo, callcenter can archive
  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'ceo', 'callcenter') THEN
    RAISE EXCEPTION 'Forbidden: archiving requires admin, ceo, or callcenter role';
  END IF;

  -- Perform the update
  UPDATE public.lead_events
  SET archived = p_archived
  WHERE id = p_event_id;

END;
$$;

GRANT EXECUTE ON FUNCTION public.set_lead_event_archived TO authenticated;

-- ============================================================
-- STEP 3: Appointments
-- ============================================================

-- 3.1 Create appointment_status enum
DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM (
    'scheduled',
    'confirmed', 
    'cancelled',
    'rescheduled',
    'visited',
    'no_show'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3.2 Create appointments table
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id uuid NULL REFERENCES public.deals(id) ON DELETE SET NULL,
  
  scheduled_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 60,
  
  address text NULL,
  city text NULL,
  cap text NULL,
  notes text NULL,
  
  status appointment_status NOT NULL DEFAULT 'scheduled',
  
  assigned_sales_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.3 Indexes for appointments
CREATE INDEX IF NOT EXISTS ix_appointments_brand_scheduled
ON public.appointments (brand_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS ix_appointments_brand_status
ON public.appointments (brand_id, status);

CREATE INDEX IF NOT EXISTS ix_appointments_contact
ON public.appointments (contact_id);

CREATE INDEX IF NOT EXISTS ix_appointments_sales_user
ON public.appointments (assigned_sales_user_id);

-- 3.4 Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3.5 Enable RLS on appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view appointments in their brands
CREATE POLICY "Users can view appointments in their brands"
ON public.appointments FOR SELECT
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- RLS: No direct INSERT/UPDATE/DELETE - use RPCs
-- (This is intentional for audit control)

-- ============================================================
-- 3.6 Appointment RPCs
-- ============================================================

-- Create appointment (admin/ceo/callcenter only)
CREATE OR REPLACE FUNCTION public.create_appointment(
  p_brand_id uuid,
  p_contact_id uuid,
  p_deal_id uuid DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_duration_minutes int DEFAULT 60,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_cap text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_assigned_sales_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role app_role;
  v_appointment_id uuid;
BEGIN
  -- Get current user
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.supabase_auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Check brand access
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to this brand';
  END IF;

  -- Get role
  SELECT ur.role INTO v_user_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id AND ur.brand_id = p_brand_id
  LIMIT 1;

  -- Only admin/ceo/callcenter can create appointments
  IF v_user_role NOT IN ('admin', 'ceo', 'callcenter') THEN
    RAISE EXCEPTION 'Forbidden: creating appointments requires admin, ceo, or callcenter role';
  END IF;

  -- Insert appointment
  INSERT INTO public.appointments (
    brand_id,
    contact_id,
    deal_id,
    scheduled_at,
    duration_minutes,
    address,
    city,
    cap,
    notes,
    assigned_sales_user_id,
    created_by_user_id
  ) VALUES (
    p_brand_id,
    p_contact_id,
    p_deal_id,
    COALESCE(p_scheduled_at, now() + interval '1 day'),
    p_duration_minutes,
    p_address,
    p_city,
    p_cap,
    p_notes,
    p_assigned_sales_user_id,
    v_user_id
  )
  RETURNING id INTO v_appointment_id;

  RETURN v_appointment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_appointment TO authenticated;

-- Update appointment (admin/ceo/callcenter)
CREATE OR REPLACE FUNCTION public.update_appointment(
  p_appointment_id uuid,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_duration_minutes int DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_cap text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role app_role;
  v_brand_id uuid;
BEGIN
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.supabase_auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT brand_id INTO v_brand_id
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Not found';
  END IF;

  SELECT ur.role INTO v_user_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id AND ur.brand_id = v_brand_id
  LIMIT 1;

  IF v_user_role NOT IN ('admin', 'ceo', 'callcenter') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.appointments SET
    scheduled_at = COALESCE(p_scheduled_at, scheduled_at),
    duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
    address = COALESCE(p_address, address),
    city = COALESCE(p_city, city),
    cap = COALESCE(p_cap, cap),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_appointment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_appointment TO authenticated;

-- Assign sales user (admin/ceo/callcenter)
CREATE OR REPLACE FUNCTION public.assign_appointment_sales(
  p_appointment_id uuid,
  p_sales_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role app_role;
  v_brand_id uuid;
BEGIN
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.supabase_auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT brand_id INTO v_brand_id
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Not found';
  END IF;

  SELECT ur.role INTO v_user_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id AND ur.brand_id = v_brand_id
  LIMIT 1;

  IF v_user_role NOT IN ('admin', 'ceo', 'callcenter') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.appointments
  SET assigned_sales_user_id = p_sales_user_id
  WHERE id = p_appointment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_appointment_sales TO authenticated;

-- Set appointment status (admin/ceo/callcenter can set any, sales can set visited/no_show)
CREATE OR REPLACE FUNCTION public.set_appointment_status(
  p_appointment_id uuid,
  p_status appointment_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role app_role;
  v_brand_id uuid;
BEGIN
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.supabase_auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT brand_id INTO v_brand_id
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Not found';
  END IF;

  SELECT ur.role INTO v_user_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id AND ur.brand_id = v_brand_id
  LIMIT 1;

  -- Sales can only set visited/no_show, admin/ceo/callcenter can set any
  IF v_user_role = 'sales' THEN
    IF p_status NOT IN ('visited', 'no_show') THEN
      RAISE EXCEPTION 'Forbidden: sales can only set visited or no_show status';
    END IF;
  ELSIF v_user_role NOT IN ('admin', 'ceo', 'callcenter') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.appointments
  SET status = p_status
  WHERE id = p_appointment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_appointment_status TO authenticated;

-- Search appointments RPC
CREATE OR REPLACE FUNCTION public.search_appointments(
  p_brand_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_status appointment_status DEFAULT NULL,
  p_sales_user_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_user_id uuid;
BEGIN
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.supabase_auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH filtered AS (
    SELECT 
      a.id,
      a.brand_id,
      a.contact_id,
      a.deal_id,
      a.scheduled_at,
      a.duration_minutes,
      a.address,
      a.city,
      a.cap,
      a.notes,
      a.status,
      a.assigned_sales_user_id,
      a.created_by_user_id,
      a.created_at,
      a.updated_at,
      jsonb_build_object(
        'id', c.id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'primary_phone', (
          SELECT cp.phone_raw 
          FROM contact_phones cp 
          WHERE cp.contact_id = c.id AND cp.is_primary = true 
          LIMIT 1
        )
      ) AS contact,
      CASE WHEN su.id IS NOT NULL THEN
        jsonb_build_object(
          'id', su.id,
          'full_name', su.full_name,
          'email', su.email
        )
      ELSE NULL END AS sales_user
    FROM public.appointments a
    LEFT JOIN public.contacts c ON c.id = a.contact_id
    LEFT JOIN public.users su ON su.id = a.assigned_sales_user_id
    WHERE a.brand_id = p_brand_id
      AND (p_date_from IS NULL OR a.scheduled_at >= p_date_from)
      AND (p_date_to IS NULL OR a.scheduled_at <= p_date_to)
      AND (p_status IS NULL OR a.status = p_status)
      AND (p_sales_user_id IS NULL OR a.assigned_sales_user_id = p_sales_user_id)
      AND (p_contact_id IS NULL OR a.contact_id = p_contact_id)
    ORDER BY a.scheduled_at ASC
  ),
  counted AS (
    SELECT COUNT(*) as total FROM filtered
  ),
  paginated AS (
    SELECT * FROM filtered
    LIMIT p_limit OFFSET p_offset
  )
  SELECT 
    jsonb_build_object(
      'total', (SELECT total FROM counted),
      'limit', p_limit,
      'offset', p_offset,
      'appointments', COALESCE((SELECT jsonb_agg(row_to_json(p.*)) FROM paginated p), '[]'::jsonb)
    )::json
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_appointments TO authenticated;
