-- ============================================================
-- HARDENING STEP 3 - Appointments Security & Audit
-- ============================================================

-- 1) Fix set_updated_at with proper search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2) Create audit_log table if not exists (for appointment changes)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_log_entity ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_brand_created ON public.audit_log (brand_id, created_at DESC);

-- RLS for audit_log (read-only for brand members)
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view audit logs in their brands" ON public.audit_log;
CREATE POLICY "Users can view audit logs in their brands"
ON public.audit_log FOR SELECT
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- 3) Hardened create_appointment with validation + audit
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
  v_contact_brand uuid;
  v_deal_contact uuid;
  v_sales_role app_role;
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

  -- VALIDATION: Contact must belong to brand
  SELECT brand_id INTO v_contact_brand
  FROM public.contacts
  WHERE id = p_contact_id;

  IF v_contact_brand IS NULL THEN
    RAISE EXCEPTION 'Not found: contact does not exist';
  END IF;

  IF v_contact_brand != p_brand_id THEN
    RAISE EXCEPTION 'Forbidden: contact does not belong to this brand';
  END IF;

  -- VALIDATION: If deal provided, must belong to same brand and same contact
  IF p_deal_id IS NOT NULL THEN
    SELECT contact_id INTO v_deal_contact
    FROM public.deals
    WHERE id = p_deal_id AND brand_id = p_brand_id;

    IF v_deal_contact IS NULL THEN
      RAISE EXCEPTION 'Forbidden: deal does not exist or does not belong to this brand';
    END IF;

    IF v_deal_contact != p_contact_id THEN
      RAISE EXCEPTION 'Forbidden: deal contact mismatch';
    END IF;
  END IF;

  -- VALIDATION: If sales user assigned, must have sales role for this brand
  IF p_assigned_sales_user_id IS NOT NULL THEN
    SELECT ur.role INTO v_sales_role
    FROM public.user_roles ur
    WHERE ur.user_id = p_assigned_sales_user_id 
      AND ur.brand_id = p_brand_id
      AND ur.role = 'sales'
    LIMIT 1;

    IF v_sales_role IS NULL THEN
      RAISE EXCEPTION 'Forbidden: assigned user is not a sales for this brand';
    END IF;
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

  -- AUDIT: Log creation
  INSERT INTO public.audit_log (
    brand_id, entity_type, entity_id, action, actor_user_id, new_value
  )
  SELECT 
    p_brand_id, 
    'appointment', 
    v_appointment_id, 
    'create',
    v_user_id,
    row_to_json(a.*)::jsonb
  FROM public.appointments a WHERE a.id = v_appointment_id;

  RETURN v_appointment_id;
END;
$$;

-- 4) Hardened assign_appointment_sales with sales role validation + audit
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
  v_sales_role app_role;
  v_old_value jsonb;
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

  -- VALIDATION: Target user must be sales for this brand
  SELECT ur.role INTO v_sales_role
  FROM public.user_roles ur
  WHERE ur.user_id = p_sales_user_id 
    AND ur.brand_id = v_brand_id
    AND ur.role = 'sales'
  LIMIT 1;

  IF v_sales_role IS NULL THEN
    RAISE EXCEPTION 'Forbidden: target user is not a sales for this brand';
  END IF;

  -- Capture old state for audit
  SELECT row_to_json(a.*)::jsonb INTO v_old_value
  FROM public.appointments a WHERE a.id = p_appointment_id;

  UPDATE public.appointments
  SET assigned_sales_user_id = p_sales_user_id
  WHERE id = p_appointment_id;

  -- AUDIT
  INSERT INTO public.audit_log (
    brand_id, entity_type, entity_id, action, actor_user_id, old_value, new_value
  )
  SELECT 
    v_brand_id, 
    'appointment', 
    p_appointment_id, 
    'assign_sales',
    v_user_id,
    v_old_value,
    row_to_json(a.*)::jsonb
  FROM public.appointments a WHERE a.id = p_appointment_id;
END;
$$;

-- 5) Hardened set_appointment_status with audit
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
  v_old_value jsonb;
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

  -- Capture old state
  SELECT row_to_json(a.*)::jsonb INTO v_old_value
  FROM public.appointments a WHERE a.id = p_appointment_id;

  UPDATE public.appointments
  SET status = p_status
  WHERE id = p_appointment_id;

  -- AUDIT
  INSERT INTO public.audit_log (
    brand_id, entity_type, entity_id, action, actor_user_id, old_value, new_value,
    metadata
  )
  SELECT 
    v_brand_id, 
    'appointment', 
    p_appointment_id, 
    'status_change',
    v_user_id,
    v_old_value,
    row_to_json(a.*)::jsonb,
    jsonb_build_object('new_status', p_status::text)
  FROM public.appointments a WHERE a.id = p_appointment_id;
END;
$$;

-- 6) Hardened update_appointment with audit
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
  v_old_value jsonb;
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

  -- Capture old state
  SELECT row_to_json(a.*)::jsonb INTO v_old_value
  FROM public.appointments a WHERE a.id = p_appointment_id;

  UPDATE public.appointments SET
    scheduled_at = COALESCE(p_scheduled_at, scheduled_at),
    duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
    address = COALESCE(p_address, address),
    city = COALESCE(p_city, city),
    cap = COALESCE(p_cap, cap),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_appointment_id;

  -- AUDIT
  INSERT INTO public.audit_log (
    brand_id, entity_type, entity_id, action, actor_user_id, old_value, new_value
  )
  SELECT 
    v_brand_id, 
    'appointment', 
    p_appointment_id, 
    'update',
    v_user_id,
    v_old_value,
    row_to_json(a.*)::jsonb
  FROM public.appointments a WHERE a.id = p_appointment_id;
END;
$$;