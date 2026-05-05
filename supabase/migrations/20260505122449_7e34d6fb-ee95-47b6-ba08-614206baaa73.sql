
-- C11: Cron / net schema isolation.
-- Goal: prevent any authenticated, anon, authenticator or PUBLIC role from
--   (a) reading scheduled commands (they embed bearer tokens), or
--   (b) issuing arbitrary outbound HTTP via net.http_post / net.http_get.

-- ============================================================
-- 1) net schema — outbound HTTP (SSRF risk)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
    REVOKE ALL ON SCHEMA net FROM PUBLIC, anon, authenticated, authenticator;
    -- Reset: grant USAGE only to postgres + service_role (cron jobs run as
    -- supabase admin; net.http_* is invoked from migrations and from
    -- service-role-authenticated SECURITY DEFINER functions).
    GRANT USAGE ON SCHEMA net TO postgres, service_role;

    -- Functions: revoke EXECUTE from public surfaces.
    EXECUTE (
      SELECT string_agg(
        format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated, authenticator;',
               n.nspname, p.proname,
               pg_get_function_identity_arguments(p.oid)),
        E'\n'
      )
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'net'
    );
    EXECUTE (
      SELECT string_agg(
        format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO postgres, service_role;',
               n.nspname, p.proname,
               pg_get_function_identity_arguments(p.oid)),
        E'\n'
      )
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'net'
    );

    -- Tables (e.g. net._http_response): revoke read access from PUBLIC.
    EXECUTE (
      SELECT COALESCE(string_agg(
        format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated, authenticator;',
               n.nspname, c.relname),
        E'\n'
      ), '')
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'net' AND c.relkind IN ('r','v','m')
    );
  END IF;
END $$;

-- ============================================================
-- 2) cron schema — scheduled commands embed bearer tokens
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    REVOKE ALL ON SCHEMA cron FROM PUBLIC, anon, authenticated, authenticator;
    GRANT USAGE ON SCHEMA cron TO postgres;
    -- supabase_admin role exists in managed Supabase; gracefully skip if absent.
    BEGIN
      EXECUTE 'GRANT USAGE ON SCHEMA cron TO supabase_admin';
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;

    -- Tables job / job_run_details: lock down (they contain the cron command
    -- string with embedded service tokens).
    EXECUTE (
      SELECT COALESCE(string_agg(
        format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated, authenticator;',
               n.nspname, c.relname),
        E'\n'
      ), '')
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'cron' AND c.relkind IN ('r','v','m')
    );

    -- cron.* functions (schedule/unschedule): only postgres / supabase_admin.
    EXECUTE (
      SELECT COALESCE(string_agg(
        format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated, authenticator;',
               n.nspname, p.proname,
               pg_get_function_identity_arguments(p.oid)),
        E'\n'
      ), '')
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'cron'
    );
  END IF;
END $$;

-- ============================================================
-- 3) pgmq — defensive: queue payloads may contain PII
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pgmq') THEN
    REVOKE ALL ON SCHEMA pgmq FROM PUBLIC, anon, authenticated, authenticator;
    GRANT USAGE ON SCHEMA pgmq TO postgres, service_role;
    EXECUTE (
      SELECT COALESCE(string_agg(
        format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated, authenticator;',
               n.nspname, c.relname),
        E'\n'
      ), '')
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'pgmq' AND c.relkind IN ('r','v','m')
    );
  END IF;
END $$;

-- ============================================================
-- 4) Default privileges going forward (so future objects in cron/net/pgmq
-- don't accidentally inherit PUBLIC grants).
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA cron REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, authenticator';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA cron REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, authenticator';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA net REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, authenticator';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA net REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, authenticator';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pgmq') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA pgmq REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, authenticator';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA pgmq REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, authenticator';
  END IF;
END $$;
