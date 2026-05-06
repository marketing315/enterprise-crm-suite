-- C1 E2E: cross-brand IDOR hardening
-- Verifica:
--   1) assert_brand_access blocca tabelle non whitelisted
--   2) assert_brand_access blocca utenti non membri del brand
--   3) assert_brand_access blocca entità di un altro brand
--   4) assert_brand_access permette caso valido
--   5) assert_brand_membership rispetta admin/ceo bypass
--   6) assert_brand_membership blocca utenti senza ruolo nel brand
-- Idempotente: tutto in BEGIN/ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_brand_a uuid := gen_random_uuid();
  v_brand_b uuid := gen_random_uuid();
  v_auth_a uuid := gen_random_uuid();
  v_auth_b uuid := gen_random_uuid();
  v_auth_adm uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_contact_a uuid := gen_random_uuid();
  v_contact_b uuid := gen_random_uuid();
BEGIN
  -- Seed minimo: auth.users + brands + users + roles + contacts
  INSERT INTO auth.users (id, instance_id, aud, role, email)
  VALUES
    (v_auth_a,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a-'   || v_auth_a   || '@test.local'),
    (v_auth_b,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-'   || v_auth_b   || '@test.local'),
    (v_auth_adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-' || v_auth_adm || '@test.local');

  INSERT INTO brands (id, name, slug) VALUES
    (v_brand_a, 'Test Brand A', 'test-brand-a-' || substr(v_brand_a::text,1,8)),
    (v_brand_b, 'Test Brand B', 'test-brand-b-' || substr(v_brand_b::text,1,8));

  INSERT INTO users (id, supabase_auth_id, email, full_name) VALUES
    (v_user_a, v_auth_a,   'a-'   || v_user_a || '@test.local', 'User A'),
    (v_user_b, v_auth_b,   'b-'   || v_user_b || '@test.local', 'User B'),
    (v_admin,  v_auth_adm, 'adm-' || v_admin  || '@test.local', 'Admin');

  INSERT INTO user_roles (user_id, role, brand_id, is_active) VALUES
    (v_user_a, 'sales', v_brand_a, true),
    (v_user_b, 'sales', v_brand_b, true),
    (v_admin,  'admin', v_brand_a, true);

  INSERT INTO contacts (id, brand_id, first_name) VALUES
    (v_contact_a, v_brand_a, 'CA'),
    (v_contact_b, v_brand_b, 'CB');

  -- 1) Tabella non whitelisted
  BEGIN
    PERFORM assert_brand_access(v_user_a, v_brand_a, 'users', v_user_a);
    RAISE EXCEPTION 'TEST 1 FAILED: should reject non-whitelisted table';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'TEST 1 OK: non-whitelisted table rejected';
  END;

  -- 2) Utente non membro del brand
  BEGIN
    PERFORM assert_brand_access(v_user_a, v_brand_b, 'contacts', v_contact_b);
    RAISE EXCEPTION 'TEST 2 FAILED: user A should NOT access brand B';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'TEST 2 OK: non-member rejected';
  END;

  -- 3) Entità di un altro brand (utente membro di A passa entità di B con brand=A)
  BEGIN
    PERFORM assert_brand_access(v_user_a, v_brand_a, 'contacts', v_contact_b);
    RAISE EXCEPTION 'TEST 3 FAILED: cross-brand entity should be rejected';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'TEST 3 OK: cross-brand entity rejected';
  END;

  -- 4) Caso valido
  IF assert_brand_access(v_user_a, v_brand_a, 'contacts', v_contact_a) THEN
    RAISE NOTICE 'TEST 4 OK: valid access allowed';
  ELSE
    RAISE EXCEPTION 'TEST 4 FAILED: valid access should pass';
  END IF;

  -- 5) Admin bypass su assert_brand_membership
  IF assert_brand_membership(v_admin, v_brand_b) THEN
    RAISE NOTICE 'TEST 5 OK: admin bypass works';
  ELSE
    RAISE EXCEPTION 'TEST 5 FAILED: admin should bypass membership';
  END IF;

  -- 6) Non-member rejected da assert_brand_membership
  BEGIN
    PERFORM assert_brand_membership(v_user_a, v_brand_b);
    RAISE EXCEPTION 'TEST 6 FAILED: non-member should be rejected';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'TEST 6 OK: non-member rejected by membership';
  END;

  RAISE NOTICE '====== C1 E2E: ALL 6 TESTS PASSED ======';
END$$;

ROLLBACK;
