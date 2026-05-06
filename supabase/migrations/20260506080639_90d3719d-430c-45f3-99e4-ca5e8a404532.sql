
CREATE OR REPLACE FUNCTION public._audit_event_chain_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prev bytea;
  v_seq bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(78231482);
  v_seq := nextval('public.audit_events_chain_seq');

  -- Use MAX over committed rows: tolerates gaps from rolled-back nextvals
  SELECT row_hash INTO v_prev
  FROM public.audit_events
  WHERE chain_seq < v_seq
  ORDER BY chain_seq DESC
  LIMIT 1;

  IF v_prev IS NULL THEN
    v_prev := decode(repeat('00', 32), 'hex');
  END IF;

  NEW.chain_seq := v_seq;
  NEW.prev_hash := v_prev;
  NEW.row_hash  := extensions.digest(
    v_prev || public._audit_event_canonical_bytes(
      NEW.id, NEW.brand_id, NEW.entity_type, NEW.entity_id,
      NEW.action, NEW.actor_user_id, NEW.actor_type, NEW.source,
      NEW.old_value, NEW.new_value, NEW.changed_fields,
      NEW.metadata, NEW.correlation_id, NEW.idempotency_key,
      NEW.occurred_at, v_seq),
    'sha256');
  RETURN NEW;
END$$;

-- verify_audit_chain: ignora gap (rollback) usando il prev row effettivo
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
SET search_path = public, extensions
AS $$
DECLARE
  r RECORD;
  v_prev bytea := decode(repeat('00', 32), 'hex');
  v_expected_hash bytea;
BEGIN
  -- Seed v_prev from the row immediately preceding p_from_seq among COMMITTED rows
  IF p_from_seq IS NOT NULL THEN
    SELECT row_hash INTO v_prev
    FROM public.audit_events
    WHERE audit_events.chain_seq < p_from_seq
    ORDER BY audit_events.chain_seq DESC
    LIMIT 1;
    IF v_prev IS NULL THEN
      v_prev := decode(repeat('00', 32), 'hex');
    END IF;
  END IF;

  FOR r IN
    SELECT * FROM public.audit_events
    WHERE (p_from_seq IS NULL OR audit_events.chain_seq >= p_from_seq)
      AND (p_to_seq   IS NULL OR audit_events.chain_seq <= p_to_seq)
    ORDER BY audit_events.chain_seq
  LOOP
    IF r.prev_hash <> v_prev THEN
      RETURN QUERY SELECT r.chain_seq, r.id, 'prev_hash_mismatch',
                          encode(v_prev,'hex'), encode(r.prev_hash,'hex'),
                          NULL::text, NULL::text;
    END IF;

    v_expected_hash := extensions.digest(
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
  END LOOP;
  RETURN;
END$$;
