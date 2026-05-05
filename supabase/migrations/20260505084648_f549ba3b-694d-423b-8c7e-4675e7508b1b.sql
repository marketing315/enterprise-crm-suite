
-- ============================================================================
-- A3: AUDIT EVENTS IMMUTABILITY
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (% blocked)', TG_OP
    USING ERRCODE = '42501';
END$$;

DROP TRIGGER IF EXISTS audit_events_no_update ON public.audit_events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_immutable();

DROP TRIGGER IF EXISTS audit_events_no_delete ON public.audit_events;
CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_immutable();

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_events FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- C1: CROSS-BRAND OWNERSHIP CHECK
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assert_brand_access(
  p_user_id   uuid,
  p_brand_id  uuid,
  p_entity_table text,
  p_entity_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_allowed_tables CONSTANT text[] := ARRAY[
    'deals','contacts','appointments','tickets','call_logs',
    'lead_events','action_suggestions','pipeline_stages'
  ];
  v_sql text;
BEGIN
  IF NOT (p_entity_table = ANY (v_allowed_tables)) THEN
    RAISE EXCEPTION 'entity_table % not whitelisted', p_entity_table
      USING ERRCODE = '22023';
  END IF;

  -- Admin/CEO bypass within tenant: still must own the brand
  IF NOT (
    public.has_role(p_user_id, 'admin'::app_role)
    OR public.has_role(p_user_id, 'ceo'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = p_user_id
        AND brand_id = p_brand_id
        AND COALESCE(is_active, true)
    )
  ) THEN
    RAISE EXCEPTION 'user % not in brand %', p_user_id, p_brand_id
      USING ERRCODE = '42501';
  END IF;

  v_sql := format('SELECT brand_id FROM public.%I WHERE id = $1', p_entity_table);
  EXECUTE v_sql INTO v_owner USING p_entity_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'entity %/% not found', p_entity_table, p_entity_id
      USING ERRCODE = '42704';
  END IF;

  IF v_owner <> p_brand_id THEN
    RAISE EXCEPTION 'cross-brand access denied (entity belongs to another brand)'
      USING ERRCODE = '42501';
  END IF;

  RETURN true;
END$$;

REVOKE EXECUTE ON FUNCTION public.assert_brand_access(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_brand_access(uuid, uuid, text, uuid) TO authenticated, service_role;

-- ============================================================================
-- C2: WEBHOOK IDEMPOTENCY (atomic dedup insert)
-- ============================================================================
ALTER TABLE public.webhook_request_dedup
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_webhook_request_dedup_idem_key
  ON public.webhook_request_dedup (source_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ingest_webhook_event_dedup(
  p_idempotency_key text,
  p_source_id uuid,
  p_ttl_hours int DEFAULT 24
) RETURNS TABLE(is_duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.webhook_request_dedup (source_id, idempotency_key, fingerprint, expires_at)
      VALUES (p_source_id, p_idempotency_key, p_idempotency_key,
              now() + make_interval(hours => p_ttl_hours));
    RETURN QUERY SELECT false;
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT true;
  END;
END$$;

REVOKE EXECUTE ON FUNCTION public.ingest_webhook_event_dedup(text, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingest_webhook_event_dedup(text, uuid, int) TO service_role;

-- ============================================================================
-- A2: VAULT-BACKED OAUTH TOKEN COLUMNS (additive — no drop of legacy)
-- ============================================================================
ALTER TABLE public.oauth_tokens
  ADD COLUMN IF NOT EXISTS access_secret_id  uuid,
  ADD COLUMN IF NOT EXISTS refresh_secret_id uuid;

COMMENT ON COLUMN public.oauth_tokens.access_secret_id  IS 'Vault secret id for access token (A2 hardening). Replaces access_token_encrypted once backfilled.';
COMMENT ON COLUMN public.oauth_tokens.refresh_secret_id IS 'Vault secret id for refresh token (A2 hardening). Replaces refresh_token_encrypted once backfilled.';

-- ============================================================================
-- C8: HMAC opt-in flag for webhook sources (default false for backward compat)
-- ============================================================================
ALTER TABLE public.webhook_sources
  ADD COLUMN IF NOT EXISTS require_signature boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.webhook_sources.require_signature
  IS 'When true, edge functions MUST verify HMAC signature; legacy token-only auth rejected (C8 hardening).';
