-- C1 E2E: cross-brand IDOR hardening (simplified, no role mutations)
-- Verifica le invariant di assert_brand_access / assert_brand_membership
-- usando 2 brand FRESCHI (gen_random_uuid) e utenti reali NON-admin/ceo,
-- senza alterare i loro ruoli esistenti.
--   1) tabella non whitelisted -> 22023
--   2) utente non membro del brand -> 42501
--   3) entità cross-brand -> 42501
--   4) accesso valido -> true
--   5) admin globale (cerca un user con ruolo admin) bypassa membership
--   6) non-member bloccato da assert_brand_membership

BEGIN;

DO $$
DECLARE
  v_brand_a uuid := gen_random_uuid();
  v_brand_b uuid := gen_random_uuid();
  v_user_a uuid;
  v_user_b uuid;
  v_admin uuid;
  v_contact_a uuid := gen_random_uuid();
  v_contact_b uuid := gen_random_uuid();
BEGIN
  -- 2 utenti che NON sono admin/ceo (quindi servono ruolo nel brand per accesso)
  SELECT u.id INTO v_user_a
  FROM users u
  WHERE NOT has_role(u.id, 'admin'::app_role)
    AND NOT has_role(u.id, 'ceo'::app_role)
  ORDER BY u.id LIMIT 1;

  SELECT u.id INTO v_user_b
  FROM users u
  WHERE NOT has_role(u.id, 'admin'::app_role)
    AND NOT has_role(u.id, 'ceo'::app_role)
    AND u.id <> v_user_a
  ORDER BY u.id LIMIT 1;

  -- Un admin reale (qualsiasi)
  SELECT user_id INTO v_admin FROM user_roles WHERE role='admin' LIMIT 1;

  IF v_user_a IS NULL OR v_user_b IS NULL OR v_admin IS NULL THEN
    RAISE EXCEPTION 'Need 2 non-admin users + 1 admin in DB';
  END IF;

  INSERT INTO brands (id, name, slug) VALUES
    (v_brand_a, 'C1 Test A', 'c1-test-a-' || substr(v_brand_a::text,1,8)),
    (v_brand_b, 'C1 Test B', 'c1-test-b-' || substr(v_brand_b::text,1,8));

  INSERT INTO user_roles (user_id, role, brand_id, is_active) VALUES
    (v_user_a, 'sales', v_brand_a, true),
    (v_user_b, 'sales', v_brand_b, true);

  INSERT INTO contacts (id, brand_id, first_name) VALUES
    (v_contact_a, v_brand_a, 'CA'),
    (v_contact_b, v_brand_b, 'CB');

  -- 1) Tabella non whitelisted
  BEGIN
    PERFORM assert_brand_access(v_user_a, v_brand_a, 'users', v_user_a);
    RAISE EXCEPTION 'TEST 1 FAILED';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'TEST 1 OK: non-whitelisted table rejected';
  END;

  -- 2) Non-member del brand B
  BEGIN
    PERFORM assert_brand_access(v_user_a, v_brand_b, 'contacts', v_contact_b);
    RAISE EXCEPTION 'TEST 2 FAILED';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'TEST 2 OK: non-member rejected';
  END;

  -- 3) Cross-brand entity
  BEGIN
    PERFORM assert_brand_access(v_user_a, v_brand_a, 'contacts', v_contact_b);
    RAISE EXCEPTION 'TEST 3 FAILED';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'TEST 3 OK: cross-brand entity rejected';
  END;

  -- 4) Caso valido
  IF assert_brand_access(v_user_a, v_brand_a, 'contacts', v_contact_a) THEN
    RAISE NOTICE 'TEST 4 OK: valid access allowed';
  ELSE
    RAISE EXCEPTION 'TEST 4 FAILED';
  END IF;

  -- 5) Admin bypassa membership su brand B
  IF assert_brand_membership(v_admin, v_brand_b) THEN
    RAISE NOTICE 'TEST 5 OK: admin bypass works';
  ELSE
    RAISE EXCEPTION 'TEST 5 FAILED';
  END IF;

  -- 6) Non-member bloccato da assert_brand_membership
  BEGIN
    PERFORM assert_brand_membership(v_user_a, v_brand_b);
    RAISE EXCEPTION 'TEST 6 FAILED';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'TEST 6 OK: non-member rejected by membership';
  END;

  RAISE NOTICE '====== C1 E2E: ALL 6 TESTS PASSED ======';
END$$;

ROLLBACK;
