/**
 * Test del linter retention policy.
 * Eseguibile con: node --test scripts/ci/__tests__/check-retention-policy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSql } from "../check-retention-policy.mjs";

test("log-pattern table senza retention -> fail", () => {
  const sql = `
    CREATE TABLE public.foo_events (
      id bigserial PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      payload jsonb
    );
    CREATE INDEX idx_foo_events_created ON public.foo_events(created_at);
  `;
  const errs = checkSql("supabase/migrations/x.sql", sql);
  assert.ok(errs.length >= 1, "deve produrre almeno 1 errore");
  assert.match(errs[0], /retention/i);
});

test("log-pattern table con cron.schedule -> pass", () => {
  const sql = `
    -- retention: 30 giorni
    CREATE TABLE public.bar_log (
      id bigserial PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_bar_log_created ON public.bar_log(created_at);
    SELECT cron.schedule('cleanup-bar-log','0 4 * * *', $$ DELETE FROM public.bar_log WHERE created_at < now() - interval '30 days'; $$);
  `;
  const errs = checkSql("supabase/migrations/x.sql", sql);
  assert.equal(errs.length, 0);
});

test("tabella business (no log-pattern) -> pass", () => {
  const sql = `
    CREATE TABLE public.users (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  const errs = checkSql("supabase/migrations/x.sql", sql);
  assert.equal(errs.length, 0);
});

test("escape @no-retention-needed con motivazione -> pass", () => {
  const sql = `
    -- @no-retention-needed: tabella append-only di compliance, retention regolata da legge (10 anni) e archiviata su Storage
    CREATE TABLE public.compliance_change_log (
      id bigserial PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_compliance_log_created ON public.compliance_change_log(created_at);
  `;
  const errs = checkSql("supabase/migrations/x.sql", sql);
  assert.equal(errs.length, 0);
});

test("escape @no-retention-needed senza motivazione -> fail", () => {
  const sql = `
    -- @no-retention-needed:
    CREATE TABLE public.foo_log (
      id bigserial PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_foo_log_created ON public.foo_log(created_at);
  `;
  const errs = checkSql("supabase/migrations/x.sql", sql);
  assert.ok(errs.length >= 1);
});

test("log-pattern con timestamp ma senza indice -> warning", () => {
  const sql = `
    -- retention: 30 giorni
    CREATE TABLE public.baz_log (
      id bigserial PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    SELECT cron.schedule('cleanup-baz','0 4 * * *', $$ DELETE FROM public.baz_log WHERE created_at < now() - interval '30 days'; $$);
  `;
  const errs = checkSql("supabase/migrations/x.sql", sql);
  // Solo warning su indice mancante (no error retention)
  assert.ok(errs.some((e) => /indice/.test(e)));
});

test("PARTITION BY count come retention -> pass", () => {
  const sql = `
    CREATE TABLE public.qux_events (
      id bigserial,
      created_at timestamptz NOT NULL DEFAULT now()
    ) PARTITION BY RANGE (created_at);
    CREATE INDEX idx_qux_events_created ON public.qux_events(created_at);
  `;
  const errs = checkSql("supabase/migrations/x.sql", sql);
  assert.equal(errs.length, 0);
});
