
-- 1. Tabella stato setup per admin
CREATE TABLE IF NOT EXISTS public.admin_setup_progress (
  user_id uuid PRIMARY KEY,
  brand_created_at timestamptz,
  users_invited_at timestamptz,
  webhook_source_created_at timestamptz,
  ticket_sla_configured_at timestamptz,
  integration_connected_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_setup_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can read own setup progress"
ON public.admin_setup_progress FOR SELECT TO authenticated
USING (user_id = public.get_user_id(auth.uid()));

CREATE POLICY "owner can upsert own setup progress"
ON public.admin_setup_progress FOR INSERT TO authenticated
WITH CHECK (user_id = public.get_user_id(auth.uid()));

CREATE POLICY "owner can update own setup progress"
ON public.admin_setup_progress FOR UPDATE TO authenticated
USING (user_id = public.get_user_id(auth.uid()))
WITH CHECK (user_id = public.get_user_id(auth.uid()));

CREATE TRIGGER trg_admin_setup_progress_updated_at
BEFORE UPDATE ON public.admin_setup_progress
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. RPC: mark step complete (or dismiss whole wizard)
CREATE OR REPLACE FUNCTION public.mark_admin_setup_step(p_step text)
RETURNS public.admin_setup_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := public.get_user_id(auth.uid());
  v_row public.admin_setup_progress;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_role(v_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: admin only' USING ERRCODE = '42501';
  END IF;

  IF p_step NOT IN (
    'brand_created','users_invited','webhook_source_created',
    'ticket_sla_configured','integration_connected','dismissed'
  ) THEN
    RAISE EXCEPTION 'invalid step: %', p_step USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_setup_progress (user_id) VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.admin_setup_progress
  SET
    brand_created_at = CASE WHEN p_step = 'brand_created' THEN COALESCE(brand_created_at, now()) ELSE brand_created_at END,
    users_invited_at = CASE WHEN p_step = 'users_invited' THEN COALESCE(users_invited_at, now()) ELSE users_invited_at END,
    webhook_source_created_at = CASE WHEN p_step = 'webhook_source_created' THEN COALESCE(webhook_source_created_at, now()) ELSE webhook_source_created_at END,
    ticket_sla_configured_at = CASE WHEN p_step = 'ticket_sla_configured' THEN COALESCE(ticket_sla_configured_at, now()) ELSE ticket_sla_configured_at END,
    integration_connected_at = CASE WHEN p_step = 'integration_connected' THEN COALESCE(integration_connected_at, now()) ELSE integration_connected_at END,
    dismissed_at = CASE WHEN p_step = 'dismissed' THEN COALESCE(dismissed_at, now()) ELSE dismissed_at END
  WHERE user_id = v_user_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_admin_setup_step(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_admin_setup_step(text) TO authenticated;

-- 3. RPC: get progress + auto-detection
CREATE OR REPLACE FUNCTION public.get_admin_setup_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := public.get_user_id(auth.uid());
  v_row public.admin_setup_progress;
  v_brands int;
  v_users int;
  v_webhooks int;
  v_sla int;
  v_integrations int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_role(v_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: admin only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.admin_setup_progress WHERE user_id = v_user_id;

  SELECT count(*) INTO v_brands FROM public.brands
    WHERE id <> '00000000-0000-0000-0000-000000000000'::uuid;

  SELECT count(*) INTO v_users FROM public.users;

  SELECT count(*) INTO v_webhooks FROM public.webhook_sources;

  SELECT count(*) INTO v_sla FROM public.ticket_escalation_policies;

  -- Best-effort: count any oauth integration row if table exists
  v_integrations := 0;
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.oauth_integrations' INTO v_integrations;
  EXCEPTION WHEN undefined_table THEN
    v_integrations := 0;
  END;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'manual', jsonb_build_object(
      'brand_created_at', v_row.brand_created_at,
      'users_invited_at', v_row.users_invited_at,
      'webhook_source_created_at', v_row.webhook_source_created_at,
      'ticket_sla_configured_at', v_row.ticket_sla_configured_at,
      'integration_connected_at', v_row.integration_connected_at,
      'dismissed_at', v_row.dismissed_at
    ),
    'auto_detected', jsonb_build_object(
      'brand_created', v_brands > 0,
      'users_invited', v_users >= 3,
      'webhook_source_created', v_webhooks > 0,
      'ticket_sla_configured', v_sla > 0,
      'integration_connected', v_integrations > 0
    ),
    'counts', jsonb_build_object(
      'brands', v_brands,
      'users', v_users,
      'webhook_sources', v_webhooks,
      'ticket_policies', v_sla,
      'integrations', v_integrations
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_setup_progress() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_admin_setup_progress() TO authenticated;
