-- F6 Frontend incident tracking
CREATE TABLE IF NOT EXISTS public.client_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_id text NOT NULL,
  user_id uuid NULL,
  brand_id uuid NULL,
  route text NULL,
  boundary_label text NULL,
  message text NULL,
  stack_digest text NULL,
  user_agent text NULL,
  build_version text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_incidents_created ON public.client_incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_incidents_user ON public.client_incidents(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_incidents_route ON public.client_incidents(route, created_at DESC) WHERE route IS NOT NULL;

ALTER TABLE public.client_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_incidents_admin_select ON public.client_incidents;
CREATE POLICY client_incidents_admin_select ON public.client_incidents
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'));

-- Nessuna policy INSERT/UPDATE/DELETE: usare solo la RPC SECURITY DEFINER
REVOKE ALL ON public.client_incidents FROM anon, authenticated;
GRANT SELECT ON public.client_incidents TO authenticated;

-- Append-only guard
CREATE OR REPLACE FUNCTION public.client_incidents_block_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.client_incidents_internal', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'client_incidents is append-only' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS client_incidents_no_update ON public.client_incidents;
CREATE TRIGGER client_incidents_no_update BEFORE UPDATE ON public.client_incidents
  FOR EACH ROW EXECUTE FUNCTION public.client_incidents_block_mutation();
DROP TRIGGER IF EXISTS client_incidents_no_delete ON public.client_incidents;
CREATE TRIGGER client_incidents_no_delete BEFORE DELETE ON public.client_incidents
  FOR EACH ROW EXECUTE FUNCTION public.client_incidents_block_mutation();

-- Reporting RPC con rate-limit per utente
CREATE OR REPLACE FUNCTION public.report_client_incident(
  p_error_id text,
  p_route text DEFAULT NULL,
  p_boundary_label text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_stack_digest text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_build_version text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_recent_count integer;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  v_user_id := public.get_user_id(auth.uid());

  IF p_error_id IS NULL OR length(trim(p_error_id)) = 0 THEN
    RAISE EXCEPTION 'p_error_id required' USING ERRCODE = '22023';
  END IF;

  -- Rate-limit: max 30 report/ora per utente
  SELECT count(*) INTO v_recent_count
  FROM public.client_incidents
  WHERE user_id = v_user_id
    AND created_at > now() - interval '1 hour';
  IF v_recent_count >= 30 THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.client_incidents(
    error_id, user_id, route, boundary_label, message, stack_digest,
    user_agent, build_version, metadata
  )
  VALUES (
    substring(p_error_id from 1 for 64),
    v_user_id,
    substring(p_route from 1 for 256),
    substring(p_boundary_label from 1 for 128),
    substring(p_message from 1 for 500),
    substring(p_stack_digest from 1 for 128),
    substring(p_user_agent from 1 for 256),
    substring(p_build_version from 1 for 64),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.report_client_incident(text, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_client_incident(text, text, text, text, text, text, text, jsonb) TO authenticated;