
-- A2: OAuth tokens via Supabase Vault (additive, backward-compatible)

CREATE OR REPLACE FUNCTION public.vault_put_oauth_secret(
  p_token_id uuid,
  p_kind text,
  p_value text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_existing_id uuid;
  v_secret_name text;
  v_brand uuid;
BEGIN
  IF p_kind NOT IN ('access','refresh') THEN
    RAISE EXCEPTION 'invalid kind %, expected access|refresh', p_kind USING ERRCODE = '22023';
  END IF;

  SELECT brand_id INTO v_brand FROM public.oauth_tokens WHERE id = p_token_id;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'oauth_tokens row % not found', p_token_id USING ERRCODE = 'P0002';
  END IF;

  IF p_kind = 'access' THEN
    SELECT access_secret_id INTO v_existing_id FROM public.oauth_tokens WHERE id = p_token_id;
  ELSE
    SELECT refresh_secret_id INTO v_existing_id FROM public.oauth_tokens WHERE id = p_token_id;
  END IF;

  -- Empty value: clear secret + column
  IF p_value IS NULL OR length(p_value) = 0 THEN
    IF v_existing_id IS NOT NULL THEN
      BEGIN
        PERFORM vault.update_secret(v_existing_id, '');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
    IF p_kind = 'access' THEN
      UPDATE public.oauth_tokens
        SET access_secret_id = NULL, access_token_encrypted = '', updated_at = now()
        WHERE id = p_token_id;
    ELSE
      UPDATE public.oauth_tokens
        SET refresh_secret_id = NULL, refresh_token_encrypted = '', updated_at = now()
        WHERE id = p_token_id;
    END IF;
    RETURN NULL;
  END IF;

  v_secret_name := 'oauth:' || p_token_id::text || ':' || p_kind;

  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_id, p_value);
  ELSE
    v_existing_id := vault.create_secret(p_value, v_secret_name, 'OAuth ' || p_kind || ' token for oauth_tokens row');
  END IF;

  IF p_kind = 'access' THEN
    UPDATE public.oauth_tokens
      SET access_secret_id = v_existing_id,
          access_token_encrypted = '',
          updated_at = now()
      WHERE id = p_token_id;
  ELSE
    UPDATE public.oauth_tokens
      SET refresh_secret_id = v_existing_id,
          refresh_token_encrypted = '',
          updated_at = now()
      WHERE id = p_token_id;
  END IF;

  RETURN v_existing_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_get_oauth_secret(
  p_token_id uuid,
  p_kind text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_legacy text;
  v_value text;
BEGIN
  IF p_kind NOT IN ('access','refresh') THEN
    RAISE EXCEPTION 'invalid kind %, expected access|refresh', p_kind USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'access' THEN
    SELECT access_secret_id, access_token_encrypted
      INTO v_secret_id, v_legacy
      FROM public.oauth_tokens WHERE id = p_token_id;
  ELSE
    SELECT refresh_secret_id, refresh_token_encrypted
      INTO v_secret_id, v_legacy
      FROM public.oauth_tokens WHERE id = p_token_id;
  END IF;

  IF v_secret_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_value
      FROM vault.decrypted_secrets
      WHERE id = v_secret_id;
    IF v_value IS NOT NULL AND length(v_value) > 0 THEN
      RETURN v_value;
    END IF;
  END IF;

  -- Fallback to legacy column
  IF v_legacy IS NOT NULL AND length(v_legacy) > 0 THEN
    RETURN v_legacy;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vault_put_oauth_secret(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vault_get_oauth_secret(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_put_oauth_secret(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_get_oauth_secret(uuid, text) TO service_role;

-- Idempotent backfill: move existing legacy tokens into Vault
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id, access_token_encrypted, refresh_token_encrypted, access_secret_id, refresh_secret_id
    FROM public.oauth_tokens
  LOOP
    IF r.access_secret_id IS NULL AND r.access_token_encrypted IS NOT NULL AND length(r.access_token_encrypted) > 0 THEN
      PERFORM public.vault_put_oauth_secret(r.id, 'access', r.access_token_encrypted);
    END IF;
    IF r.refresh_secret_id IS NULL AND r.refresh_token_encrypted IS NOT NULL AND length(r.refresh_token_encrypted) > 0 THEN
      PERFORM public.vault_put_oauth_secret(r.id, 'refresh', r.refresh_token_encrypted);
    END IF;
  END LOOP;
END $$;
