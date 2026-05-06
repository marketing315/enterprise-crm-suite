-- =====================================================================
-- H4 — Soft-delete RLS regression test (pgTAP-style, plain psql)
--
-- Verifica che un utente NON-admin non veda record con flag soft-delete
-- impostato, anche facendo SELECT diretta via PostgREST.
--
-- Eseguire con: psql -v ON_ERROR_STOP=1 -f scripts/tests/h4-soft-delete-rls-e2e.sql
-- L'utente DB esegue come superuser; settiamo role+JWT claims per simulare authenticated.
-- =====================================================================

\set QUIET on
BEGIN;

-- Pick a real authenticated user that belongs to at least one brand
DO $$
DECLARE
  v_auth_id uuid;
  v_brand_id uuid;
  v_user_id uuid;
  v_contact_id uuid;
  v_lead_event_id uuid;
  v_count int;
BEGIN
  SELECT u.user_id, ub.brand_id, u.id
    INTO v_user_id, v_brand_id, v_auth_id
  FROM public.users u
  JOIN public.user_brands ub ON ub.user_id = u.id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
  )
  LIMIT 1;

  IF v_auth_id IS NULL THEN
    RAISE NOTICE 'H4 e2e: no non-admin user with brand found, skipping';
    RETURN;
  END IF;

  -- Insert a contact and a lead_event with soft-delete flag set
  INSERT INTO public.contacts (brand_id, full_name, merged_into_contact_id)
  VALUES (v_brand_id, 'h4-test-merged', gen_random_uuid())
  RETURNING id INTO v_contact_id;

  INSERT INTO public.lead_events (brand_id, source, payload, archived)
  VALUES (v_brand_id, 'h4-test', '{}'::jsonb, true)
  RETURNING id INTO v_lead_event_id;

  -- Switch role to authenticated with our user's JWT claims
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth_id::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- contacts: merged record must be invisible
  SELECT count(*) INTO v_count FROM public.contacts WHERE id = v_contact_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'H4 FAIL: merged contact visible to non-admin (count=%)', v_count;
  END IF;

  -- lead_events: archived must be invisible
  SELECT count(*) INTO v_count FROM public.lead_events WHERE id = v_lead_event_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'H4 FAIL: archived lead_event visible to non-admin (count=%)', v_count;
  END IF;

  RAISE NOTICE 'H4 OK: soft-deleted contact + lead_event invisible to non-admin user %', v_auth_id;
END $$;

ROLLBACK;
