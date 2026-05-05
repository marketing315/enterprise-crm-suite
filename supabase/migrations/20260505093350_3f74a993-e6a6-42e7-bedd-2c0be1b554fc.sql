-- Auth rate limiting (additive, defense-in-depth, finding A4-A10)
-- Hashed identity (email+ip) bucket per scope (signin/reset).

CREATE TABLE IF NOT EXISTS public.auth_rate_limit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('signin','password_reset')),
  attempts INT NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_rate_limit_unique UNIQUE (identity_hash, scope)
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_locked
  ON public.auth_rate_limit(locked_until)
  WHERE locked_until IS NOT NULL;

ALTER TABLE public.auth_rate_limit ENABLE ROW LEVEL SECURITY;

-- Solo service_role legge / modifica direttamente; client passa via RPC.
CREATE POLICY "auth_rate_limit_service_only"
ON public.auth_rate_limit
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- RPC: consuma un attempt. Ritorna {allowed, retry_after_seconds, attempts_remaining}.
-- Window: 15 min. Soglie: signin=10, password_reset=5. Lock: 15 min al supero.
CREATE OR REPLACE FUNCTION public.consume_auth_rate_limit(
  p_identity_hash TEXT,
  p_scope TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.auth_rate_limit;
  v_window_minutes INT := 15;
  v_max_attempts INT;
  v_lock_minutes INT := 15;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_scope NOT IN ('signin','password_reset') THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'invalid_scope');
  END IF;

  v_max_attempts := CASE p_scope WHEN 'signin' THEN 10 ELSE 5 END;

  INSERT INTO public.auth_rate_limit(identity_hash, scope, attempts, window_started_at, last_attempt_at)
  VALUES (p_identity_hash, p_scope, 1, v_now, v_now)
  ON CONFLICT (identity_hash, scope) DO UPDATE
    SET attempts = CASE
        WHEN public.auth_rate_limit.locked_until IS NOT NULL AND public.auth_rate_limit.locked_until > v_now
          THEN public.auth_rate_limit.attempts
        WHEN public.auth_rate_limit.window_started_at < v_now - (v_window_minutes || ' minutes')::interval
          THEN 1
        ELSE public.auth_rate_limit.attempts + 1
      END,
      window_started_at = CASE
        WHEN public.auth_rate_limit.locked_until IS NOT NULL AND public.auth_rate_limit.locked_until > v_now
          THEN public.auth_rate_limit.window_started_at
        WHEN public.auth_rate_limit.window_started_at < v_now - (v_window_minutes || ' minutes')::interval
          THEN v_now
        ELSE public.auth_rate_limit.window_started_at
      END,
      last_attempt_at = v_now
  RETURNING * INTO v_row;

  -- Lock attivo
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'locked', true,
      'retry_after_seconds', GREATEST(1, EXTRACT(EPOCH FROM (v_row.locked_until - v_now))::INT)
    );
  END IF;

  -- Supero soglia: applica lock
  IF v_row.attempts > v_max_attempts THEN
    UPDATE public.auth_rate_limit
       SET locked_until = v_now + (v_lock_minutes || ' minutes')::interval
     WHERE id = v_row.id
    RETURNING * INTO v_row;
    RETURN jsonb_build_object(
      'allowed', false,
      'locked', true,
      'retry_after_seconds', v_lock_minutes * 60
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'attempts_remaining', GREATEST(0, v_max_attempts - v_row.attempts)
  );
END;
$$;

-- RPC: reset al successo (signin OK)
CREATE OR REPLACE FUNCTION public.reset_auth_rate_limit(
  p_identity_hash TEXT,
  p_scope TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.auth_rate_limit
     SET attempts = 0, locked_until = NULL, window_started_at = now()
   WHERE identity_hash = p_identity_hash AND scope = p_scope;
END;
$$;

-- Public: anon + authenticated possono chiamare consume (login deve funzionare prima dell'auth).
GRANT EXECUTE ON FUNCTION public.consume_auth_rate_limit(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_auth_rate_limit(TEXT, TEXT) TO anon, authenticated;

-- Pulizia righe vecchie (>7 giorni senza lock attivo)
CREATE OR REPLACE FUNCTION public.cleanup_auth_rate_limit()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH del AS (
    DELETE FROM public.auth_rate_limit
    WHERE last_attempt_at < now() - interval '7 days'
      AND (locked_until IS NULL OR locked_until < now())
    RETURNING 1
  )
  SELECT count(*)::INT FROM del;
$$;