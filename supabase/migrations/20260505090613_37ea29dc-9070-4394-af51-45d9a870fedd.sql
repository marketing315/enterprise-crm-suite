-- =========================================================================
-- Settimana 2 P0 — Audit remediation (additive only)
-- =========================================================================

-- ---------- C7: OAuth CSRF + redirect whitelist ----------
CREATE TABLE IF NOT EXISTS public.oauth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  csrf_token text UNIQUE NOT NULL,
  user_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  provider text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_sessions_csrf_active
  ON public.oauth_sessions(csrf_token) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_expires
  ON public.oauth_sessions(expires_at) WHERE consumed_at IS NULL;

ALTER TABLE public.oauth_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oauth_sessions_service_only ON public.oauth_sessions;
CREATE POLICY oauth_sessions_service_only ON public.oauth_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.oauth_redirect_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  redirect_uri text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, redirect_uri)
);

ALTER TABLE public.oauth_redirect_whitelist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oauth_redirect_whitelist_admin_read ON public.oauth_redirect_whitelist;
CREATE POLICY oauth_redirect_whitelist_admin_read ON public.oauth_redirect_whitelist
  FOR SELECT TO authenticated
  USING (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS oauth_redirect_whitelist_service ON public.oauth_redirect_whitelist;
CREATE POLICY oauth_redirect_whitelist_service ON public.oauth_redirect_whitelist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed con i redirect URI Supabase auto-generati per le edge function
INSERT INTO public.oauth_redirect_whitelist (provider, redirect_uri, is_active)
VALUES
  ('google', 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/google-oauth-callback', true),
  ('meta',   'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/meta-oauth-callback',   true)
ON CONFLICT (provider, redirect_uri) DO NOTHING;

-- RPC helper per validare il redirect_uri (chiamato dalle edge function via service_role)
CREATE OR REPLACE FUNCTION public.is_oauth_redirect_allowed(
  p_provider text,
  p_redirect_uri text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.oauth_redirect_whitelist
    WHERE provider = p_provider
      AND redirect_uri = p_redirect_uri
      AND is_active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_oauth_redirect_allowed(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_oauth_redirect_allowed(text, text) TO service_role;

-- RPC atomic: crea session + restituisce CSRF
CREATE OR REPLACE FUNCTION public.create_oauth_session(
  p_user_id uuid,
  p_brand_id uuid,
  p_provider text,
  p_redirect_uri text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_csrf text;
BEGIN
  IF NOT public.is_oauth_redirect_allowed(p_provider, p_redirect_uri) THEN
    RAISE EXCEPTION 'redirect_uri not in whitelist' USING ERRCODE = '42501';
  END IF;
  v_csrf := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.oauth_sessions (csrf_token, user_id, brand_id, provider, redirect_uri)
    VALUES (v_csrf, p_user_id, p_brand_id, p_provider, p_redirect_uri);
  RETURN v_csrf;
END$$;

REVOKE EXECUTE ON FUNCTION public.create_oauth_session(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_oauth_session(uuid, uuid, text, text) TO service_role;

-- RPC atomic: consume + ritorna i metadati (NULL se invalid/expired/already-consumed)
CREATE OR REPLACE FUNCTION public.consume_oauth_session(p_csrf text)
RETURNS TABLE(user_id uuid, brand_id uuid, provider text, redirect_uri text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.oauth_sessions
     SET consumed_at = now()
   WHERE csrf_token = p_csrf
     AND consumed_at IS NULL
     AND expires_at > now()
  RETURNING oauth_sessions.user_id,
            oauth_sessions.brand_id,
            oauth_sessions.provider,
            oauth_sessions.redirect_uri;
END$$;

REVOKE EXECUTE ON FUNCTION public.consume_oauth_session(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_oauth_session(text) TO service_role;


-- ---------- C9: user_roles_guard trigger (defense-in-depth) ----------
CREATE OR REPLACE FUNCTION public.user_roles_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_auth uuid := auth.uid();
  v_caller_internal uuid;
BEGIN
  -- service_role / postgres / migration → bypass (auth.uid() IS NULL)
  IF v_caller_auth IS NULL THEN
    RETURN NEW;
  END IF;

  v_caller_internal := public.get_user_id(v_caller_auth);
  IF v_caller_internal IS NULL THEN
    RETURN NEW;
  END IF;

  -- Solo i grant di ruoli admin/ceo sono governati qui
  IF NEW.role NOT IN ('admin'::app_role, 'ceo'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Global admin (System Brand) può sempre creare admin/ceo
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller_internal
      AND brand_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND role = 'admin'::app_role
      AND is_active = true
  ) THEN
    RETURN NEW;
  END IF;

  -- Altrimenti il caller deve essere admin sul brand del nuovo ruolo
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller_internal
      AND brand_id = NEW.brand_id
      AND role = 'admin'::app_role
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'cross-brand admin grant denied (caller has no admin on brand %)', NEW.brand_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS user_roles_guard_trigger ON public.user_roles;
CREATE TRIGGER user_roles_guard_trigger
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.user_roles_guard();


-- ---------- C10: backup signed URL audit + revoke ----------
CREATE TABLE IF NOT EXISTS public.backup_signed_url_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  run_id uuid NOT NULL,
  storage_path text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid
);

CREATE INDEX IF NOT EXISTS idx_backup_url_audit_run ON public.backup_signed_url_audit(run_id);
CREATE INDEX IF NOT EXISTS idx_backup_url_audit_active
  ON public.backup_signed_url_audit(id) WHERE revoked_at IS NULL;

ALTER TABLE public.backup_signed_url_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backup_url_audit_admin_read ON public.backup_signed_url_audit;
CREATE POLICY backup_url_audit_admin_read ON public.backup_signed_url_audit
  FOR SELECT TO authenticated
  USING (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
  );

DROP POLICY IF EXISTS backup_url_audit_service ON public.backup_signed_url_audit;
CREATE POLICY backup_url_audit_service ON public.backup_signed_url_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.revoke_backup_signed_url(p_audit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_id(auth.uid());
BEGIN
  IF v_caller IS NULL THEN RETURN false; END IF;
  IF NOT (public.has_role(v_caller, 'admin'::app_role) OR public.has_role(v_caller, 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.backup_signed_url_audit
     SET revoked_at = now(), revoked_by = v_caller
   WHERE id = p_audit_id AND revoked_at IS NULL;
  RETURN FOUND;
END$$;

REVOKE EXECUTE ON FUNCTION public.revoke_backup_signed_url(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_backup_signed_url(uuid) TO authenticated, service_role;


-- ---------- C11: cron-relay audit + advisory lock helper ----------
CREATE TABLE IF NOT EXISTS public.cron_relay_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  brand_id uuid,
  request_id text,
  upstream_status int,
  duration_ms int,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_relay_log_created ON public.cron_relay_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_relay_log_job ON public.cron_relay_log(job_name, created_at DESC);

ALTER TABLE public.cron_relay_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_relay_log_admin_read ON public.cron_relay_log;
CREATE POLICY cron_relay_log_admin_read ON public.cron_relay_log
  FOR SELECT TO authenticated
  USING (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS cron_relay_log_service ON public.cron_relay_log;
CREATE POLICY cron_relay_log_service ON public.cron_relay_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tenta lock advisory non-bloccante per (job_name, brand_id?) → false se altro lo detiene
CREATE OR REPLACE FUNCTION public.try_lock_cron_job(p_job_name text, p_brand_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key bigint;
BEGIN
  v_key := hashtextextended(p_job_name || COALESCE(p_brand_id::text, ''), 0);
  RETURN pg_try_advisory_lock(v_key);
END$$;

REVOKE EXECUTE ON FUNCTION public.try_lock_cron_job(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_lock_cron_job(text, uuid) TO service_role;


-- ---------- C4: outbound_webhooks PII safe flag ----------
ALTER TABLE public.outbound_webhooks
  ADD COLUMN IF NOT EXISTS pii_safe_payload boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.outbound_webhooks.pii_safe_payload IS
  'Se true, i campi PII (email, phone, first_name, last_name, address, tax_id, iban) vengono pseudonimizzati (HMAC) prima dell''invio outbound.';
