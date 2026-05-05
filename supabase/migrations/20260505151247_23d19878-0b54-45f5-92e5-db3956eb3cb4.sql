-- H2 extension: apply consume_critical_rate_limit to merge_contacts, revoke_backup_signed_url, create_oauth_session

CREATE OR REPLACE FUNCTION public.merge_contacts(p_target_id uuid, p_source_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_brand uuid;
  v_source_brand uuid;
  v_moved jsonb := '{}'::jsonb;
  v_n int;
  v_caller uuid := public.get_user_id(auth.uid());
  v_rl jsonb;
BEGIN
  IF p_target_id = p_source_id THEN
    RAISE EXCEPTION 'target_equals_source' USING ERRCODE = '22023';
  END IF;

  -- H2 rate limit: 30 merges / 15 min / caller
  IF v_caller IS NOT NULL THEN
    v_rl := public.consume_critical_rate_limit(
      encode(digest(v_caller::text, 'sha256'), 'hex'),
      'rpc.merge_contacts', 30, 15, 15
    );
    IF NOT (v_rl->>'allowed')::boolean THEN
      PERFORM public.log_rpc_call('merge_contacts',
        jsonb_build_object('target_id', p_target_id, 'source_id', p_source_id),
        v_rl, 'rate_limited', NULL);
      RAISE EXCEPTION 'rate_limited: retry after % s', (v_rl->>'retry_after_seconds')
        USING ERRCODE = '42P01';
    END IF;
  END IF;

  SELECT brand_id INTO v_target_brand FROM public.contacts WHERE id = p_target_id AND merged_into_contact_id IS NULL;
  SELECT brand_id INTO v_source_brand FROM public.contacts WHERE id = p_source_id AND merged_into_contact_id IS NULL;

  IF v_target_brand IS NULL OR v_source_brand IS NULL THEN
    RAISE EXCEPTION 'contact_not_found_or_already_merged' USING ERRCODE = 'P0002';
  END IF;
  IF v_target_brand <> v_source_brand THEN
    RAISE EXCEPTION 'cross_brand_merge_forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role_for_brand(auth.uid(), v_target_brand, 'admin')
    OR public.has_role_for_brand(auth.uid(), v_target_brand, 'ceo')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.contact_phones SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('contact_phones', v_n);
  UPDATE public.appointments SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('appointments', v_n);
  UPDATE public.deals SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('deals', v_n);
  UPDATE public.tickets SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('tickets', v_n);
  UPDATE public.sales_orders SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('sales_orders', v_n);
  UPDATE public.lead_events SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('lead_events', v_n);
  UPDATE public.call_logs SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('call_logs', v_n);
  UPDATE public.call_transcripts SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('call_transcripts', v_n);
  UPDATE public.incoming_calls SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('incoming_calls', v_n);
  UPDATE public.contact_field_values SET contact_id = p_target_id WHERE contact_id = p_source_id
    AND NOT EXISTS (SELECT 1 FROM public.contact_field_values t WHERE t.contact_id = p_target_id AND t.field_id = contact_field_values.field_id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('contact_field_values', v_n);
  UPDATE public.tag_assignments SET contact_id = p_target_id WHERE contact_id = p_source_id
    AND NOT EXISTS (SELECT 1 FROM public.tag_assignments t WHERE t.contact_id = p_target_id AND t.tag_id = tag_assignments.tag_id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('tag_assignments', v_n);
  UPDATE public.contact_tracking SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('contact_tracking', v_n);
  UPDATE public.lead_score_history SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('lead_score_history', v_n);
  UPDATE public.lead_scores SET contact_id = p_target_id WHERE contact_id = p_source_id
    AND NOT EXISTS (SELECT 1 FROM public.lead_scores WHERE contact_id = p_target_id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('lead_scores', v_n);
  UPDATE public.lead_campaign_attribution SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('lead_campaign_attribution', v_n);
  UPDATE public.ai_call_action_proposals SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('ai_call_action_proposals', v_n);
  UPDATE public.automation_jobs SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('automation_jobs', v_n);
  UPDATE public.keplero_interactions SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('keplero_interactions', v_n);
  UPDATE public.meta_capi_event_queue SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('meta_capi_event_queue', v_n);
  UPDATE public.meta_lead_events SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('meta_lead_events', v_n);
  UPDATE public.household_people SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('household_people', v_n);

  UPDATE public.contacts
     SET merged_into_contact_id = p_target_id, merged_at = now(), updated_at = now()
   WHERE id = p_source_id;

  PERFORM public.log_audit_event(
    'contact', 'merge', v_target_brand, p_target_id,
    jsonb_build_object('source_contact_id', p_source_id),
    jsonb_build_object('target_contact_id', p_target_id, 'moved', v_moved),
    jsonb_build_object('moved', v_moved),
    'app', NULL, NULL
  );

  RETURN jsonb_build_object('ok', true, 'target_id', p_target_id, 'source_id', p_source_id, 'moved', v_moved);
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_backup_signed_url(p_audit_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := public.get_user_id(auth.uid());
  v_rl jsonb;
BEGIN
  IF v_caller IS NULL THEN RETURN false; END IF;

  -- H2 rate limit: 20 revokes / 15 min / caller
  v_rl := public.consume_critical_rate_limit(
    encode(digest(v_caller::text, 'sha256'), 'hex'),
    'rpc.revoke_backup_signed_url', 20, 15, 15
  );
  IF NOT (v_rl->>'allowed')::boolean THEN
    PERFORM public.log_rpc_call('revoke_backup_signed_url',
      jsonb_build_object('audit_id', p_audit_id), v_rl, 'rate_limited', NULL);
    RAISE EXCEPTION 'rate_limited: retry after % s', (v_rl->>'retry_after_seconds')
      USING ERRCODE = '42P01';
  END IF;

  IF NOT (public.has_role(v_caller, 'admin'::app_role) OR public.has_role(v_caller, 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.backup_signed_url_audit
     SET revoked_at = now(), revoked_by = v_caller
   WHERE id = p_audit_id AND revoked_at IS NULL;
  RETURN FOUND;
END$function$;

CREATE OR REPLACE FUNCTION public.create_oauth_session(p_user_id uuid, p_brand_id uuid, p_provider text, p_redirect_uri text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_csrf text;
  v_rl jsonb;
BEGIN
  -- H2 rate limit: 30 sessions / 15 min / (user_id, provider)
  v_rl := public.consume_critical_rate_limit(
    encode(digest(coalesce(p_user_id::text,'anon') || '|' || coalesce(p_provider,''), 'sha256'), 'hex'),
    'rpc.create_oauth_session', 30, 15, 15
  );
  IF NOT (v_rl->>'allowed')::boolean THEN
    PERFORM public.log_rpc_call('create_oauth_session',
      jsonb_build_object('user_id', p_user_id, 'provider', p_provider),
      v_rl, 'rate_limited', p_brand_id);
    RAISE EXCEPTION 'rate_limited: retry after % s', (v_rl->>'retry_after_seconds')
      USING ERRCODE = '42P01';
  END IF;

  IF NOT public.is_oauth_redirect_allowed(p_provider, p_redirect_uri) THEN
    RAISE EXCEPTION 'redirect_uri not in whitelist' USING ERRCODE = '42501';
  END IF;
  v_csrf := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.oauth_sessions (csrf_token, user_id, brand_id, provider, redirect_uri)
    VALUES (v_csrf, p_user_id, p_brand_id, p_provider, p_redirect_uri);
  RETURN v_csrf;
END$function$;