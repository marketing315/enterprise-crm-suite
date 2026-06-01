-- ========== Fase 3: RBAC Modello 3 (open + pending) ==========

-- 1) Enum user_status (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE public.user_status AS ENUM ('pending','active','suspended');
  END IF;
END$$;

-- 2) Estendi notification_type (additivo)
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'user_pending_approval';

-- 3) Colonna users.status (default pending) + backfill
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status public.user_status NOT NULL DEFAULT 'pending';

-- Backfill: utenti esistenti con almeno un ruolo attivo → active
UPDATE public.users u
SET status = 'active'
WHERE status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = u.id AND r.is_active = true
  );

CREATE INDEX IF NOT EXISTS idx_users_status_pending
  ON public.users(created_at DESC) WHERE status = 'pending';

-- 4) Trigger di provisioning su auth.users (idempotente, sempre crea public.users con status=pending)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_provision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text;
  v_avatar text;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_avatar := NEW.raw_user_meta_data->>'avatar_url';

  INSERT INTO public.users (supabase_auth_id, email, full_name, avatar_url, status)
  VALUES (NEW.id, NEW.email, v_full_name, v_avatar, 'pending')
  ON CONFLICT (supabase_auth_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_provision ON auth.users;
CREATE TRIGGER on_auth_user_created_provision
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user_provision();

-- 5) Trigger notifica admin quando viene creato un utente pending
CREATE OR REPLACE FUNCTION public.notify_admins_pending_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_brand uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_admin record;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  FOR v_admin IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.is_active = true
      AND (
        (ur.brand_id = v_system_brand AND ur.role = 'admin'::app_role)
        OR ur.role = 'ceo'::app_role
      )
  LOOP
    INSERT INTO public.notifications (brand_id, user_id, type, title, body, entity_type, entity_id)
    VALUES (
      v_system_brand,
      v_admin.user_id,
      'user_pending_approval',
      'Nuovo utente in attesa di approvazione',
      COALESCE(NEW.full_name, NEW.email) || ' attende l''assegnazione di brand e ruolo.',
      'user',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_pending_notify_admins ON public.users;
CREATE TRIGGER on_user_pending_notify_admins
AFTER INSERT ON public.users
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.notify_admins_pending_user();

-- 6) RPC approve_pending_user
CREATE OR REPLACE FUNCTION public.approve_pending_user(
  p_user_id uuid,
  p_brand_id uuid,
  p_role app_role,
  p_can_access_children boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := get_user_id(auth.uid());
  v_system_brand uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_is_authorized boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  -- Rate limit
  PERFORM consume_critical_rate_limit(v_caller, 'approve_pending_user', 20, 15);

  -- Authz: admin del brand target OR system admin OR CEO
  v_is_authorized :=
       has_role_for_brand(v_caller, p_brand_id, 'admin'::app_role)
    OR has_role_for_brand(v_caller, v_system_brand, 'admin'::app_role)
    OR has_role(v_caller, 'ceo'::app_role);

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Verifica utente esiste e in stato pending
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND status IN ('pending','active')) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND_OR_SUSPENDED' USING ERRCODE = 'P0002';
  END IF;

  -- Attiva utente
  UPDATE public.users
  SET status = 'active', updated_at = now()
  WHERE id = p_user_id;

  -- Assegna ruolo (upsert)
  INSERT INTO public.user_roles (user_id, brand_id, role, is_active, can_access_children)
  VALUES (p_user_id, p_brand_id, p_role, true, COALESCE(p_can_access_children, false))
  ON CONFLICT (user_id, brand_id, role)
  DO UPDATE SET is_active = true, can_access_children = EXCLUDED.can_access_children;

  -- Audit
  PERFORM log_audit_event(
    'user_approved',
    'user',
    p_user_id,
    jsonb_build_object(
      'brand_id', p_brand_id,
      'role', p_role,
      'can_access_children', COALESCE(p_can_access_children, false)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_pending_user(uuid, uuid, app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_pending_user(uuid, uuid, app_role, boolean) TO authenticated;

-- 7) RPC reject_pending_user
CREATE OR REPLACE FUNCTION public.reject_pending_user(
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := get_user_id(auth.uid());
  v_system_brand uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_is_authorized boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  PERFORM consume_critical_rate_limit(v_caller, 'reject_pending_user', 20, 15);

  v_is_authorized :=
       has_role_for_brand(v_caller, v_system_brand, 'admin'::app_role)
    OR has_role(v_caller, 'ceo'::app_role);

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users
  SET status = 'suspended', updated_at = now()
  WHERE id = p_user_id AND status <> 'suspended';

  PERFORM log_audit_event(
    'user_rejected',
    'user',
    p_user_id,
    jsonb_build_object('reason', COALESCE(p_reason, ''))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_pending_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_pending_user(uuid, text) TO authenticated;

-- 8) RPC list_pending_users
CREATE OR REPLACE FUNCTION public.list_pending_users()
RETURNS TABLE (
  id uuid,
  supabase_auth_id uuid,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz,
  provider text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_caller uuid := get_user_id(auth.uid());
  v_system_brand uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_is_authorized boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  v_is_authorized :=
       has_role_for_brand(v_caller, v_system_brand, 'admin'::app_role)
    OR has_role(v_caller, 'ceo'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_caller AND ur.is_active = true AND ur.role = 'admin'::app_role
    );

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.supabase_auth_id,
    u.email,
    u.full_name,
    u.avatar_url,
    u.created_at,
    COALESCE(
      (au.raw_app_meta_data->>'provider'),
      'email'
    )::text AS provider
  FROM public.users u
  LEFT JOIN auth.users au ON au.id = u.supabase_auth_id
  WHERE u.status = 'pending'
  ORDER BY u.created_at DESC
  LIMIT 500;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_pending_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pending_users() TO authenticated;