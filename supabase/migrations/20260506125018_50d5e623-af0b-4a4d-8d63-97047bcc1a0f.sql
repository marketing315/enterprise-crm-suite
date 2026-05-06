-- A2: Vault-backed storage for meta_apps / meta_lead_sources access tokens
-- Pattern identico a oauth_tokens (vault_put_oauth_secret / vault_get_oauth_secret):
-- - aggiunge access_secret_id (uuid) che referenzia vault.secrets
-- - RPC put/get SECURITY DEFINER con fallback alla colonna legacy access_token
-- - REVOKE da public/anon/authenticated, GRANT solo a service_role
-- Migrazione PURELY ADDITIVE: la colonna legacy access_token resta per fallback.
-- Il backfill (vault.create_secret) viene fatto separatamente via insert tool.

ALTER TABLE public.meta_apps
  ADD COLUMN IF NOT EXISTS access_secret_id uuid;

ALTER TABLE public.meta_lead_sources
  ADD COLUMN IF NOT EXISTS access_secret_id uuid;

-- ---------- meta_apps ----------
CREATE OR REPLACE FUNCTION public.meta_apps_put_access_token(p_id uuid, p_value text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_existing_id uuid;
  v_secret_name text;
  v_brand uuid;
BEGIN
  SELECT brand_id, access_secret_id
    INTO v_brand, v_existing_id
    FROM public.meta_apps WHERE id = p_id;

  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'meta_apps row % not found', p_id USING ERRCODE = 'P0002';
  END IF;

  IF p_value IS NULL OR length(p_value) = 0 THEN
    IF v_existing_id IS NOT NULL THEN
      BEGIN PERFORM vault.update_secret(v_existing_id, ''); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    UPDATE public.meta_apps
       SET access_secret_id = NULL,
           access_token = '',
           updated_at = now()
     WHERE id = p_id;
    RETURN NULL;
  END IF;

  v_secret_name := 'meta_apps:' || p_id::text || ':access';

  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_id, p_value);
  ELSE
    v_existing_id := vault.create_secret(p_value, v_secret_name, 'Meta App access token');
  END IF;

  UPDATE public.meta_apps
     SET access_secret_id = v_existing_id,
         access_token = '',
         updated_at = now()
   WHERE id = p_id;

  RETURN v_existing_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.meta_apps_get_access_token(p_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_secret_id uuid;
  v_legacy text;
  v_value text;
BEGIN
  SELECT access_secret_id, access_token
    INTO v_secret_id, v_legacy
    FROM public.meta_apps WHERE id = p_id;

  IF v_secret_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_value
      FROM vault.decrypted_secrets WHERE id = v_secret_id;
    IF v_value IS NOT NULL AND length(v_value) > 0 THEN
      RETURN v_value;
    END IF;
  END IF;

  IF v_legacy IS NOT NULL AND length(v_legacy) > 0 THEN
    RETURN v_legacy;
  END IF;

  RETURN NULL;
END;
$fn$;

-- ---------- meta_lead_sources ----------
CREATE OR REPLACE FUNCTION public.meta_lead_sources_put_access_token(p_id uuid, p_value text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_existing_id uuid;
  v_secret_name text;
  v_exists boolean;
BEGIN
  SELECT TRUE, access_secret_id
    INTO v_exists, v_existing_id
    FROM public.meta_lead_sources WHERE id = p_id;

  IF v_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'meta_lead_sources row % not found', p_id USING ERRCODE = 'P0002';
  END IF;

  IF p_value IS NULL OR length(p_value) = 0 THEN
    IF v_existing_id IS NOT NULL THEN
      BEGIN PERFORM vault.update_secret(v_existing_id, ''); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    UPDATE public.meta_lead_sources
       SET access_secret_id = NULL,
           access_token = ''
     WHERE id = p_id;
    RETURN NULL;
  END IF;

  v_secret_name := 'meta_lead_sources:' || p_id::text || ':access';

  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_id, p_value);
  ELSE
    v_existing_id := vault.create_secret(p_value, v_secret_name, 'Meta Lead Source access token');
  END IF;

  UPDATE public.meta_lead_sources
     SET access_secret_id = v_existing_id,
         access_token = ''
   WHERE id = p_id;

  RETURN v_existing_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.meta_lead_sources_get_access_token(p_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_secret_id uuid;
  v_legacy text;
  v_value text;
BEGIN
  SELECT access_secret_id, access_token
    INTO v_secret_id, v_legacy
    FROM public.meta_lead_sources WHERE id = p_id;

  IF v_secret_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_value
      FROM vault.decrypted_secrets WHERE id = v_secret_id;
    IF v_value IS NOT NULL AND length(v_value) > 0 THEN
      RETURN v_value;
    END IF;
  END IF;

  IF v_legacy IS NOT NULL AND length(v_legacy) > 0 THEN
    RETURN v_legacy;
  END IF;

  RETURN NULL;
END;
$fn$;

-- Lock down execution: only service_role (edge functions) can call these.
REVOKE ALL ON FUNCTION public.meta_apps_put_access_token(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_apps_get_access_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_lead_sources_put_access_token(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_lead_sources_get_access_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meta_apps_put_access_token(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_apps_get_access_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_lead_sources_put_access_token(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_lead_sources_get_access_token(uuid) TO service_role;