CREATE TABLE IF NOT EXISTS public.ai_request_quota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  endpoint text NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  request_count integer NOT NULL DEFAULT 0,
  total_input_chars bigint NOT NULL DEFAULT 0,
  last_request_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_request_quota_unique UNIQUE (user_id, endpoint, day)
);

CREATE INDEX IF NOT EXISTS idx_ai_request_quota_user_day
  ON public.ai_request_quota (user_id, day DESC);

CREATE INDEX IF NOT EXISTS idx_ai_request_quota_brand_day
  ON public.ai_request_quota (brand_id, day DESC);

ALTER TABLE public.ai_request_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_request_quota_service_all"
  ON public.ai_request_quota
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "ai_request_quota_admin_select"
  ON public.ai_request_quota
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
  );

CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  p_user_id uuid,
  p_brand_id uuid,
  p_endpoint text,
  p_input_chars integer,
  p_daily_limit integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_count integer;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO public.ai_request_quota (user_id, brand_id, endpoint, day, request_count, total_input_chars, last_request_at, updated_at)
  VALUES (p_user_id, p_brand_id, p_endpoint, v_today, 1, COALESCE(p_input_chars, 0), now(), now())
  ON CONFLICT (user_id, endpoint, day) DO UPDATE
    SET request_count     = ai_request_quota.request_count + 1,
        total_input_chars = ai_request_quota.total_input_chars + COALESCE(EXCLUDED.total_input_chars, 0),
        last_request_at   = now(),
        updated_at        = now()
  RETURNING request_count INTO v_current_count;

  IF v_current_count > p_daily_limit THEN
    UPDATE public.ai_request_quota
       SET request_count     = request_count - 1,
           total_input_chars = total_input_chars - COALESCE(p_input_chars, 0),
           updated_at        = now()
     WHERE user_id = p_user_id AND endpoint = p_endpoint AND day = v_today;

    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'daily_limit', p_daily_limit,
      'used', p_daily_limit
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', GREATEST(0, p_daily_limit - v_current_count),
    'daily_limit', p_daily_limit,
    'used', v_current_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_ai_quota(uuid, uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, uuid, text, integer, integer) TO service_role;

COMMENT ON TABLE public.ai_request_quota IS 'Tracking richieste AI per-utente per-giorno per endpoint. Usata da consume_ai_quota per rate-limit (ai-chat default 300/giorno).';
COMMENT ON FUNCTION public.consume_ai_quota IS 'Incrementa atomico contatore quota AI. Ritorna {allowed, remaining, daily_limit, used}. Da chiamare PRIMA della call al modello.';