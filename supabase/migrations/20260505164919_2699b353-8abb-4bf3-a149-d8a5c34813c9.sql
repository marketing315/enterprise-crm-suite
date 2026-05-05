-- H8: Generic idempotency for sensitive endpoints

-- ============ Tables ============
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text NOT NULL,                   -- e.g. 'voispeed-call-request'
  caller_id       uuid,                            -- internal user id when known
  caller_fp       text NOT NULL,                   -- fallback identity (ip+ua hash) when no user
  idem_key        text NOT NULL,                   -- client-supplied Idempotency-Key
  payload_fp      text NOT NULL,                   -- sha256 of normalized payload (replay-safety)
  status          text NOT NULL CHECK (status IN ('in_progress','completed','failed')),
  response_status integer,                         -- HTTP status of completed response
  response_body   jsonb,                           -- cached body (truncated server-side if large)
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT idempotency_keys_unique UNIQUE (scope, caller_fp, idem_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON public.idempotency_keys (expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_caller_user ON public.idempotency_keys (caller_id, scope, created_at DESC) WHERE caller_id IS NOT NULL;

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "idempotency_keys_service_only" ON public.idempotency_keys;
CREATE POLICY "idempotency_keys_service_only" ON public.idempotency_keys
  TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.idempotency_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id          uuid REFERENCES public.idempotency_keys(id) ON DELETE CASCADE,
  scope           text NOT NULL,
  idem_key        text NOT NULL,
  caller_id       uuid,
  caller_fp       text NOT NULL,
  event           text NOT NULL CHECK (event IN ('claimed','replayed','payload_mismatch','completed','failed')),
  detail          jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_events_scope_time ON public.idempotency_events (scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idempotency_events_key ON public.idempotency_events (key_id);

ALTER TABLE public.idempotency_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "idempotency_events_service_only" ON public.idempotency_events;
CREATE POLICY "idempotency_events_service_only" ON public.idempotency_events
  TO service_role USING (true) WITH CHECK (true);

-- Append-only: deny UPDATE/DELETE entirely (no policy => no rows mutable for any role under RLS).
-- Also block via revoke for service_role (still allowed via policy, so use trigger):
CREATE OR REPLACE FUNCTION public.idempotency_events_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'idempotency_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_idempotency_events_no_update ON public.idempotency_events;
CREATE TRIGGER trg_idempotency_events_no_update
  BEFORE UPDATE OR DELETE ON public.idempotency_events
  FOR EACH ROW EXECUTE FUNCTION public.idempotency_events_block_mutation();

-- ============ RPC: claim ============
CREATE OR REPLACE FUNCTION public.claim_idempotency_key(
  p_scope       text,
  p_caller_id   uuid,
  p_caller_fp   text,
  p_idem_key    text,
  p_payload_fp  text,
  p_ttl_seconds integer DEFAULT 86400
)
RETURNS TABLE (
  outcome           text,            -- 'inserted' | 'replay' | 'in_progress' | 'payload_mismatch'
  key_id            uuid,
  cached_status     integer,
  cached_body       jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.idempotency_keys%ROWTYPE;
  v_id       uuid;
BEGIN
  IF p_scope IS NULL OR p_idem_key IS NULL OR p_payload_fp IS NULL OR p_caller_fp IS NULL THEN
    RAISE EXCEPTION 'claim_idempotency_key: missing required arguments';
  END IF;

  -- Try insert; if conflict, examine existing row.
  BEGIN
    INSERT INTO public.idempotency_keys (scope, caller_id, caller_fp, idem_key, payload_fp, status, expires_at)
    VALUES (p_scope, p_caller_id, p_caller_fp, p_idem_key, p_payload_fp, 'in_progress',
            now() + make_interval(secs => p_ttl_seconds))
    RETURNING id INTO v_id;

    INSERT INTO public.idempotency_events (key_id, scope, idem_key, caller_id, caller_fp, event, detail)
    VALUES (v_id, p_scope, p_idem_key, p_caller_id, p_caller_fp, 'claimed',
            jsonb_build_object('payload_fp', p_payload_fp));

    outcome := 'inserted';
    key_id := v_id;
    cached_status := NULL;
    cached_body := NULL;
    RETURN NEXT;
    RETURN;
  EXCEPTION WHEN unique_violation THEN
    -- Fall through to replay handling.
    NULL;
  END;

  SELECT * INTO v_existing
  FROM public.idempotency_keys
  WHERE scope = p_scope AND caller_fp = p_caller_fp AND idem_key = p_idem_key
  LIMIT 1;

  IF v_existing.payload_fp IS DISTINCT FROM p_payload_fp THEN
    INSERT INTO public.idempotency_events (key_id, scope, idem_key, caller_id, caller_fp, event, detail)
    VALUES (v_existing.id, p_scope, p_idem_key, p_caller_id, p_caller_fp, 'payload_mismatch',
            jsonb_build_object('expected_fp', v_existing.payload_fp, 'received_fp', p_payload_fp));
    outcome := 'payload_mismatch';
    key_id := v_existing.id;
    cached_status := NULL;
    cached_body := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_existing.status = 'in_progress' THEN
    INSERT INTO public.idempotency_events (key_id, scope, idem_key, caller_id, caller_fp, event, detail)
    VALUES (v_existing.id, p_scope, p_idem_key, p_caller_id, p_caller_fp, 'replayed',
            jsonb_build_object('reason', 'in_progress'));
    outcome := 'in_progress';
    key_id := v_existing.id;
    cached_status := NULL;
    cached_body := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- completed or failed -> return cached
  INSERT INTO public.idempotency_events (key_id, scope, idem_key, caller_id, caller_fp, event, detail)
  VALUES (v_existing.id, p_scope, p_idem_key, p_caller_id, p_caller_fp, 'replayed',
          jsonb_build_object('reason', v_existing.status));

  outcome := 'replay';
  key_id := v_existing.id;
  cached_status := v_existing.response_status;
  cached_body := v_existing.response_body;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_idempotency_key(text,uuid,text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_idempotency_key(text,uuid,text,text,text,integer) TO service_role;

-- ============ RPC: complete ============
CREATE OR REPLACE FUNCTION public.complete_idempotency_key(
  p_key_id          uuid,
  p_response_status integer,
  p_response_body   jsonb,
  p_failed          boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.idempotency_keys%ROWTYPE;
BEGIN
  UPDATE public.idempotency_keys
  SET status = CASE WHEN p_failed THEN 'failed' ELSE 'completed' END,
      response_status = p_response_status,
      response_body = p_response_body,
      completed_at = now()
  WHERE id = p_key_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_idempotency_key: key % not found', p_key_id;
  END IF;

  INSERT INTO public.idempotency_events (key_id, scope, idem_key, caller_id, caller_fp, event, detail)
  VALUES (
    v_row.id, v_row.scope, v_row.idem_key, v_row.caller_id, v_row.caller_fp,
    CASE WHEN p_failed THEN 'failed' ELSE 'completed' END,
    jsonb_build_object('status', p_response_status)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_idempotency_key(uuid,integer,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_idempotency_key(uuid,integer,jsonb,boolean) TO service_role;

-- ============ Cleanup ============
CREATE OR REPLACE FUNCTION public.cleanup_idempotency_keys()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH d AS (
    DELETE FROM public.idempotency_keys
    WHERE expires_at < now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_idempotency_keys() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_idempotency_keys() TO service_role;