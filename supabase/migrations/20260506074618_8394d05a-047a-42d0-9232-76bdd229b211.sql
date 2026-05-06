-- H7: Circuit breaker persistente per chiamate upstream
CREATE TABLE IF NOT EXISTS public.circuit_breaker_state (
  name              text PRIMARY KEY,
  state             text NOT NULL DEFAULT 'closed' CHECK (state IN ('closed','open','half_open')),
  failure_count     integer NOT NULL DEFAULT 0,
  success_count     integer NOT NULL DEFAULT 0,
  consecutive_fail  integer NOT NULL DEFAULT 0,
  last_failure_at   timestamptz,
  last_success_at   timestamptz,
  opened_at         timestamptz,
  next_attempt_at   timestamptz,
  last_error        text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.circuit_breaker_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cb_admin_select" ON public.circuit_breaker_state;
CREATE POLICY "cb_admin_select" ON public.circuit_breaker_state
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'));

-- No INSERT/UPDATE/DELETE policies — only service_role (bypass RLS) can mutate.

-- Atomic check + transition. Returns the row AFTER any cooldown→half_open transition.
CREATE OR REPLACE FUNCTION public.cb_check_state(p_name text)
RETURNS public.circuit_breaker_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.circuit_breaker_state;
BEGIN
  INSERT INTO public.circuit_breaker_state(name) VALUES (p_name)
  ON CONFLICT (name) DO NOTHING;

  SELECT * INTO r FROM public.circuit_breaker_state WHERE name = p_name FOR UPDATE;

  -- If open and cooldown elapsed → half_open (allow one probe)
  IF r.state = 'open' AND r.next_attempt_at IS NOT NULL AND r.next_attempt_at <= now() THEN
    UPDATE public.circuit_breaker_state
       SET state = 'half_open', updated_at = now()
     WHERE name = p_name
     RETURNING * INTO r;
  END IF;

  RETURN r;
END;
$$;

-- Atomic outcome recording. p_success boolean; opens after p_threshold consecutive failures.
CREATE OR REPLACE FUNCTION public.cb_record_outcome(
  p_name text,
  p_success boolean,
  p_threshold integer DEFAULT 5,
  p_cooldown_seconds integer DEFAULT 60,
  p_error text DEFAULT NULL
) RETURNS public.circuit_breaker_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.circuit_breaker_state;
BEGIN
  INSERT INTO public.circuit_breaker_state(name) VALUES (p_name)
  ON CONFLICT (name) DO NOTHING;

  IF p_success THEN
    UPDATE public.circuit_breaker_state
       SET state = 'closed',
           success_count = success_count + 1,
           consecutive_fail = 0,
           last_success_at = now(),
           opened_at = NULL,
           next_attempt_at = NULL,
           last_error = NULL,
           updated_at = now()
     WHERE name = p_name
     RETURNING * INTO r;
  ELSE
    UPDATE public.circuit_breaker_state
       SET failure_count = failure_count + 1,
           consecutive_fail = consecutive_fail + 1,
           last_failure_at = now(),
           last_error = LEFT(COALESCE(p_error, last_error, ''), 500),
           state = CASE
             WHEN consecutive_fail + 1 >= p_threshold THEN 'open'
             ELSE state
           END,
           opened_at = CASE
             WHEN consecutive_fail + 1 >= p_threshold AND state <> 'open' THEN now()
             ELSE opened_at
           END,
           next_attempt_at = CASE
             WHEN consecutive_fail + 1 >= p_threshold THEN now() + make_interval(secs => p_cooldown_seconds)
             ELSE next_attempt_at
           END,
           updated_at = now()
     WHERE name = p_name
     RETURNING * INTO r;
  END IF;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.cb_check_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cb_record_outcome(text, boolean, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cb_check_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cb_record_outcome(text, boolean, integer, integer, text) TO service_role;