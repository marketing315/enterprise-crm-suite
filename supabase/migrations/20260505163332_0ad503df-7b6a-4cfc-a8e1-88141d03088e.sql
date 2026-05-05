-- H1: IP-based rate limiting for public webhooks (additive)

CREATE TABLE IF NOT EXISTS public.ip_rate_limit_buckets (
  scope TEXT NOT NULL,
  identifier TEXT NOT NULL,
  tokens INT NOT NULL,
  max_tokens INT NOT NULL,
  refill_rate_per_min INT NOT NULL,
  last_refill_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, identifier)
);

CREATE INDEX IF NOT EXISTS idx_ip_rate_limit_updated ON public.ip_rate_limit_buckets(updated_at);

ALTER TABLE public.ip_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role manages ip rate limit" ON public.ip_rate_limit_buckets;
CREATE POLICY "service_role manages ip rate limit"
  ON public.ip_rate_limit_buckets FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.consume_ip_rate_limit(
  p_scope TEXT,
  p_identifier TEXT,
  p_max_per_min INT DEFAULT 60
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tokens INT;
  v_max INT;
  v_rate INT;
  v_last TIMESTAMPTZ;
  v_elapsed NUMERIC;
  v_to_add INT;
  v_new INT;
BEGIN
  IF p_identifier IS NULL OR length(p_identifier) = 0 THEN
    -- Sconosciuto: fail-open per non bloccare traffico legittimo dietro proxy senza header
    RETURN TRUE;
  END IF;

  INSERT INTO public.ip_rate_limit_buckets (scope, identifier, tokens, max_tokens, refill_rate_per_min)
  VALUES (p_scope, p_identifier, p_max_per_min, p_max_per_min, p_max_per_min)
  ON CONFLICT (scope, identifier) DO NOTHING;

  SELECT tokens, max_tokens, refill_rate_per_min, last_refill_at
    INTO v_tokens, v_max, v_rate, v_last
  FROM public.ip_rate_limit_buckets
  WHERE scope = p_scope AND identifier = p_identifier
  FOR UPDATE;

  v_elapsed := EXTRACT(EPOCH FROM (now() - v_last)) / 60.0;
  v_to_add := FLOOR(v_elapsed * v_rate)::INT;
  v_new := LEAST(v_tokens + v_to_add, v_max);

  IF v_new > 0 THEN
    UPDATE public.ip_rate_limit_buckets
    SET tokens = v_new - 1,
        last_refill_at = CASE WHEN v_to_add > 0 THEN now() ELSE v_last END,
        updated_at = now()
    WHERE scope = p_scope AND identifier = p_identifier;
    RETURN TRUE;
  ELSE
    UPDATE public.ip_rate_limit_buckets
    SET updated_at = now()
    WHERE scope = p_scope AND identifier = p_identifier;
    RETURN FALSE;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_ip_rate_limit(TEXT, TEXT, INT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cleanup_ip_rate_limit_buckets()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM public.ip_rate_limit_buckets
  WHERE updated_at < now() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_ip_rate_limit_buckets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_ip_rate_limit_buckets() TO service_role;