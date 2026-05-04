-- Bundle RPC: combines financial + operational KPIs in one round-trip
CREATE OR REPLACE FUNCTION public.get_ceo_dashboard_bundle(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_brand_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_financial jsonb;
  v_operational jsonb;
BEGIN
  v_user_id := public.get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_user_id, 'admin'::app_role)
    OR public.has_role(v_user_id, 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied: requires CEO or admin role' USING ERRCODE = '42501';
  END IF;

  -- Financial KPIs (existing RPC)
  SELECT public.get_ceo_dashboard_kpis(p_brand_id, p_from, p_to) INTO v_financial;

  -- Operational KPIs (existing RPC supports optional p_brand_ids)
  IF p_brand_ids IS NOT NULL AND array_length(p_brand_ids, 1) > 0 THEN
    SELECT public.get_ceo_operational_kpis(p_brand_id, p_from, p_to, p_brand_ids) INTO v_operational;
  ELSE
    SELECT public.get_ceo_operational_kpis(p_brand_id, p_from, p_to) INTO v_operational;
  END IF;

  RETURN jsonb_build_object(
    'financial', v_financial,
    'operational', v_operational
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ceo_dashboard_bundle(uuid, date, date, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ceo_dashboard_bundle(uuid, date, date, uuid[]) TO authenticated;