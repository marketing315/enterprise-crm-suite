-- F3 — post-logout session data purge (tenant/brand scoped)

CREATE OR REPLACE FUNCTION public.purge_user_session_data(
  p_auth_user_id uuid,
  p_brand_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_auth uuid := auth.uid();
  v_user_id uuid;
  v_oauth integer := 0;
  v_idem integer := 0;
  v_audit integer := 0;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'p_auth_user_id required' USING ERRCODE = '22023';
  END IF;

  -- AuthZ: l'utente può purgare SOLO i propri dati. Service role / admin bypass.
  IF v_caller_auth IS NOT NULL
     AND v_caller_auth <> p_auth_user_id
     AND NOT public.has_role(v_caller_auth, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_user_id := public.get_user_id(p_auth_user_id);

  -- 1) OAuth sessions: cancella consumate o scadute dell'utente
  --    (filtro opzionale per brand; le righe senza brand_id vengono purgate solo
  --    quando non si specifica un brand, evitando di toccare altri tenant).
  DELETE FROM public.oauth_sessions
   WHERE user_id = v_user_id
     AND (consumed_at IS NOT NULL OR expires_at < now())
     AND (p_brand_id IS NULL OR brand_id = p_brand_id);
  GET DIAGNOSTICS v_oauth = ROW_COUNT;

  -- 2) Idempotency keys: rimuovi le chiavi del caller scadute o completate.
  --    Non tocchiamo chiavi 'in_progress' per evitare race su retry concorrenti.
  DELETE FROM public.idempotency_keys
   WHERE caller_id = v_user_id
     AND (expires_at < now() OR status IN ('completed','failed'));
  GET DIAGNOSTICS v_idem = ROW_COUNT;

  -- 3) Session audit: marca come revocate tutte le sessioni attive dell'utente.
  --    Manteniamo la storia (append-only) ma invalidiamo riferimenti a sessione.
  UPDATE public.session_audit
     SET revoked_at = now(),
         revoked_by = v_user_id
   WHERE auth_user_id = p_auth_user_id
     AND revoked_at IS NULL
     AND event_type IN ('signin','token_refreshed');
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  RETURN jsonb_build_object(
    'oauth_purged', v_oauth,
    'idempotency_purged', v_idem,
    'sessions_revoked', v_audit,
    'brand_scope', p_brand_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_session_data(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_user_session_data(uuid, uuid) TO authenticated;

-- Aggregatore per il job pianificato: chiama tutte le cleanup orfane
-- e logga su cron_run_log via cron_log_start/finish.
CREATE OR REPLACE FUNCTION public.cleanup_session_data_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id bigint;
  v_oauth integer := 0;
  v_idem integer := 0;
  v_nonces integer := 0;
  v_dedup integer := 0;
  v_summary jsonb;
BEGIN
  v_run_id := public.cron_log_start('cleanup_session_data_all', NULL, '{}'::jsonb);

  BEGIN
    v_oauth := public.cleanup_oauth_sessions();
    v_idem := public.cleanup_idempotency_keys();
    v_nonces := public.cleanup_internal_auth_nonces();
    v_dedup := public.cleanup_webhook_dedup();

    v_summary := jsonb_build_object(
      'oauth_sessions', v_oauth,
      'idempotency_keys', v_idem,
      'internal_auth_nonces', v_nonces,
      'webhook_dedup', v_dedup
    );

    PERFORM public.cron_log_finish(v_run_id, 'success', NULL);
    RETURN v_summary;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.cron_log_finish(v_run_id, 'error', substring(SQLERRM from 1 for 500));
    RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_session_data_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_session_data_all() TO postgres, service_role;

-- Registra il job nel registry A10 (idempotente)
INSERT INTO public.cron_job_registry(
  job_name, tenant_scope, description, owner_role, schedule_doc,
  expected_runtime_seconds, is_critical, invokes_security_definer, notes
) VALUES (
  'cleanup_session_data_all',
  'system',
  'F3: aggrega cleanup orfani di oauth_sessions, idempotency_keys, internal_auth_nonces, webhook_request_dedup',
  'platform',
  'every 15 minutes',
  30,
  true,
  true,
  'Invocato da cron via SELECT public.cleanup_session_data_all(); nessun parametro tenant.'
)
ON CONFLICT (job_name) DO UPDATE SET
  description = EXCLUDED.description,
  schedule_doc = EXCLUDED.schedule_doc,
  expected_runtime_seconds = EXCLUDED.expected_runtime_seconds,
  is_critical = EXCLUDED.is_critical,
  invokes_security_definer = EXCLUDED.invokes_security_definer,
  notes = EXCLUDED.notes,
  updated_at = now();