# ADR-001 — Retention obbligatoria per tabelle accumulative

**Status:** Accepted — 2026-05-07
**Trigger:** incident P1 disco Supabase pieno (vedi `RUNBOOK-CLEANUP-DB-PIENO.md`)

## Context
Il database ha esaurito spazio (4.95 GB su 8 GB) per accumulo non controllato di
`cron.job_run_details` e `net._http_response`. Cause: assenza di policy retention e
di guard rail in CI sulle nuove migration.

## Decision
Tutte le tabelle che accumulano righe nel tempo devono dichiarare retention nella
**stessa migration** che le introduce. CI blocca migration che non lo fanno
(`scripts/ci/check-retention-policy.mjs`, eseguito in `code-hygiene.yml`).

Pattern accettati:
- commento `-- retention: N giorni` + `cron.schedule(...)` di cleanup
- `PARTITION BY RANGE (...)` con drop di partizioni vecchie
- `pg_partman`
- escape esplicito `-- @no-retention-needed: <motivazione>` (richiede motivazione)

## Consequences
- Onboarding più lento di ~30 min (lettura `docs/db-retention-policy.md`)
- CI blocca PR senza retention dichiarata (intenzionale)
- Capacity planning DB diventa prevedibile
- Riduce drasticamente la probabilità di P1 da disco pieno

## Validation
- 7 unit test in `scripts/ci/__tests__/check-retention-policy.test.mjs`
- Step #11 in `.github/workflows/code-hygiene.yml`
- Monitor giornaliero in `public.db_size_history` + view `v_db_growth_alerts`
