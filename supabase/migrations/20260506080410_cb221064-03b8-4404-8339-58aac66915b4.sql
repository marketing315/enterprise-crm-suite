
ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS chain_seq bigint,
  ADD COLUMN IF NOT EXISTS prev_hash bytea,
  ADD COLUMN IF NOT EXISTS row_hash  bytea;

CREATE SEQUENCE IF NOT EXISTS public.audit_events_chain_seq;

CREATE OR REPLACE FUNCTION public._audit_event_canonical_bytes(
  p_id uuid, p_brand_id uuid, p_entity_type text, p_entity_id uuid,
  p_action text, p_actor_user_id uuid, p_actor_type text, p_source text,
  p_old_value jsonb, p_new_value jsonb, p_changed_fields text[],
  p_metadata jsonb, p_correlation_id text, p_idempotency_key text,
  p_occurred_at timestamptz, p_chain_seq bigint
) RETURNS bytea
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT convert_to(
    jsonb_build_object(
      'id', p_id,
      'brand_id', p_brand_id,
      'entity_type', p_entity_type,
      'entity_id', p_entity_id,
      'action', p_action,
      'actor_user_id', p_actor_user_id,
      'actor_type', p_actor_type,
      'source', p_source,
      'old_value', COALESCE(p_old_value, 'null'::jsonb),
      'new_value', COALESCE(p_new_value, 'null'::jsonb),
      'changed_fields', COALESCE(to_jsonb(p_changed_fields), 'null'::jsonb),
      'metadata', COALESCE(p_metadata, '{}'::jsonb),
      'correlation_id', COALESCE(p_correlation_id, ''),
      'idempotency_key', COALESCE(p_idempotency_key, ''),
      'occurred_at', to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'chain_seq', p_chain_seq
    )::text, 'UTF8')
$$;

CREATE OR REPLACE FUNCTION public._audit_event_chain_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev bytea;
  v_seq bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(78231482);
  v_seq := nextval('public.audit_events_chain_seq');

  SELECT row_hash INTO v_prev
  FROM public.audit_events
  WHERE chain_seq = v_seq - 1;

  IF v_prev IS NULL THEN
    v_prev := decode(repeat('00', 32), 'hex');
  END IF;

  NEW.chain_seq := v_seq;
  NEW.prev_hash := v_prev;
  NEW.row_hash  := digest(
    v_prev || public._audit_event_canonical_bytes(
      NEW.id, NEW.brand_id, NEW.entity_type, NEW.entity_id,
      NEW.action, NEW.actor_user_id, NEW.actor_type, NEW.source,
      NEW.old_value, NEW.new_value, NEW.changed_fields,
      NEW.metadata, NEW.correlation_id, NEW.idempotency_key,
      NEW.occurred_at, v_seq),
    'sha256');
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS audit_events_chain_insert ON public.audit_events;
CREATE TRIGGER audit_events_chain_insert
  BEFORE INSERT ON public.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public._audit_event_chain_insert();

-- Backfill: temporarily disable existing immutability triggers
DO $$
DECLARE
  r RECORD;
  v_prev bytea := decode(repeat('00', 32), 'hex');
  v_seq bigint := 0;
  v_hash bytea;
BEGIN
  ALTER TABLE public.audit_events DISABLE TRIGGER audit_events_no_update;
  ALTER TABLE public.audit_events DISABLE TRIGGER audit_events_no_delete;
  ALTER TABLE public.audit_events DISABLE TRIGGER audit_events_chain_insert;

  FOR r IN
    SELECT id, brand_id, entity_type, entity_id, action, actor_user_id, actor_type,
           source, old_value, new_value, changed_fields, metadata,
           correlation_id, idempotency_key, occurred_at
    FROM public.audit_events
    WHERE chain_seq IS NULL
    ORDER BY created_at, id
  LOOP
    v_seq := v_seq + 1;
    v_hash := digest(
      v_prev || public._audit_event_canonical_bytes(
        r.id, r.brand_id, r.entity_type, r.entity_id, r.action,
        r.actor_user_id, r.actor_type, r.source, r.old_value, r.new_value,
        r.changed_fields, r.metadata, r.correlation_id, r.idempotency_key,
        r.occurred_at, v_seq),
      'sha256');
    UPDATE public.audit_events
       SET chain_seq = v_seq, prev_hash = v_prev, row_hash = v_hash
     WHERE id = r.id;
    v_prev := v_hash;
  END LOOP;

  IF v_seq > 0 THEN
    PERFORM setval('public.audit_events_chain_seq', v_seq, true);
  END IF;

  ALTER TABLE public.audit_events ENABLE TRIGGER audit_events_chain_insert;
  ALTER TABLE public.audit_events ENABLE TRIGGER audit_events_no_update;
  ALTER TABLE public.audit_events ENABLE TRIGGER audit_events_no_delete;
END$$;

ALTER TABLE public.audit_events
  ALTER COLUMN chain_seq SET NOT NULL,
  ALTER COLUMN prev_hash SET NOT NULL,
  ALTER COLUMN row_hash  SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS audit_events_chain_seq_uidx
  ON public.audit_events(chain_seq);

CREATE OR REPLACE FUNCTION public.verify_audit_chain(
  p_from_seq bigint DEFAULT NULL,
  p_to_seq bigint DEFAULT NULL
)
RETURNS TABLE(
  chain_seq bigint, audit_id uuid, issue text,
  expected_prev_hash text, stored_prev_hash text,
  expected_row_hash text, stored_row_hash text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_prev bytea := decode(repeat('00', 32), 'hex');
  v_expected_seq bigint := COALESCE(p_from_seq, 1);
  v_expected_hash bytea;
BEGIN
  IF p_from_seq IS NOT NULL AND p_from_seq > 1 THEN
    SELECT row_hash INTO v_prev
    FROM public.audit_events
    WHERE audit_events.chain_seq = p_from_seq - 1;
    IF v_prev IS NULL THEN
      RETURN QUERY SELECT p_from_seq - 1, NULL::uuid, 'missing_anchor_row',
                          NULL::text, NULL::text, NULL::text, NULL::text;
      RETURN;
    END IF;
  END IF;

  FOR r IN
    SELECT * FROM public.audit_events
    WHERE (p_from_seq IS NULL OR audit_events.chain_seq >= p_from_seq)
      AND (p_to_seq   IS NULL OR audit_events.chain_seq <= p_to_seq)
    ORDER BY audit_events.chain_seq
  LOOP
    IF r.chain_seq <> v_expected_seq THEN
      RETURN QUERY SELECT v_expected_seq, NULL::uuid, 'missing_seq',
                          encode(v_prev,'hex'), NULL::text, NULL::text, NULL::text;
      v_expected_seq := r.chain_seq;
    END IF;

    IF r.prev_hash <> v_prev THEN
      RETURN QUERY SELECT r.chain_seq, r.id, 'prev_hash_mismatch',
                          encode(v_prev,'hex'), encode(r.prev_hash,'hex'),
                          NULL::text, NULL::text;
    END IF;

    v_expected_hash := digest(
      r.prev_hash || public._audit_event_canonical_bytes(
        r.id, r.brand_id, r.entity_type, r.entity_id, r.action,
        r.actor_user_id, r.actor_type, r.source, r.old_value, r.new_value,
        r.changed_fields, r.metadata, r.correlation_id, r.idempotency_key,
        r.occurred_at, r.chain_seq),
      'sha256');

    IF v_expected_hash <> r.row_hash THEN
      RETURN QUERY SELECT r.chain_seq, r.id, 'row_hash_mismatch',
                          NULL::text, NULL::text,
                          encode(v_expected_hash,'hex'), encode(r.row_hash,'hex');
    END IF;

    v_prev := r.row_hash;
    v_expected_seq := r.chain_seq + 1;
  END LOOP;
  RETURN;
END$$;

REVOKE ALL ON FUNCTION public.verify_audit_chain(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(bigint, bigint) TO authenticated, service_role;

COMMENT ON COLUMN public.audit_events.chain_seq IS 'A3 hash chain: monotonic sequence';
COMMENT ON COLUMN public.audit_events.prev_hash IS 'A3 hash chain: SHA-256 row_hash of chain_seq-1';
COMMENT ON COLUMN public.audit_events.row_hash  IS 'A3 hash chain: SHA-256(prev_hash || canonical_bytes(this_row))';
