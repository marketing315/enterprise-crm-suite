-- C1 E2E: cross-brand IDOR hardening
-- Verifica:
--   1) assert_brand_access blocca tabelle non whitelisted
--   2) assert_brand_access blocca utenti non membri del brand
--   3) assert_brand_access blocca entità di un altro brand
--   4) assert_brand_access permette caso valido
--   5) assert_brand_membership rispetta admin/ceo bypass
--   6) assert_brand_membership blocca utenti senza ruolo nel brand
-- Usa utenti EXISTENTI (no INSERT in auth.users perché psql non ha i permessi).
-- Tutto in BEGIN/ROLLBACK: nessuna modifica persistente.

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
  -- Pick 3 utenti reali esistenti (ID stabile a livello di test)
  SELECT id INTO v_user_a FROM users ORDER BY id LIMIT 1;
  SELECT id INTO v_user_b FROM users ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO v_admin  FROM users ORDER BY id OFFSET 2 LIMIT 1;

  IF v_user_a IS NULL OR v_user_b IS NULL OR v_admin IS NULL THEN
    RAISE EXCEPTION 'Need at least 3 users in DB to run this test';
  END IF;

  -- Pulisci roles preesistenti dei 3 utenti dentro la transazione
  -- (rollback ripristinerà tutto)
  DELETE FROM user_roles WHERE user_id IN (v_user_a, v_user_b, v_admin);

  INSERT INTO brands (id, name, slug) VALUES
    (v_brand_a, 'C1 Test A', 'c1-test-a-' || substr(v_brand_a::text,1,8)),
    (v_brand_b, 'C1 Test B', 'c1-test-b-' || substr(v_brand_b::text,1,8));

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

  -- 3) Cross-brand: utente di A passa entità di B con brand=A
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
    RAISE EXCEPTION 'TEST 4 FAILED';
  END IF;

  -- 5) Admin bypass su assert_brand_membership (admin di A accede a B)
  IF assert_brand_membership(v_admin, v_brand_b) THEN
    RAISE NOTICE 'TEST 5 OK: admin bypass works';
  ELSE
    RAISE EXCEPTION 'TEST 5 FAILED: admin should bypass membership';
  END IF;

  -- 6) Non-member blocked da assert_brand_membership
  BEGIN
    PERFORM assert_brand_membership(v_user_a, v_brand_b);
    RAISE EXCEPTION 'TEST 6 FAILED: non-member should be rejected';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'TEST 6 OK: non-member rejected by membership';
  END;

  RAISE NOTICE '====== C1 E2E: ALL 6 TESTS PASSED ======';
END$$;

ROLLBACK;
