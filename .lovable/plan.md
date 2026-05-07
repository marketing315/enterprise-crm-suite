
# Piano — Prevenzione "DB pieno" (5 deliverable)

Obiettivo: rendere strutturalmente impossibile il ripetersi dell'incidente del 7 maggio. Lavoro **infrastrutturale**, zero tocchi a tabelle business (audit_events, lead_events, contacts, deals, appointments, tickets, ad_*, slo_measurements, ai_decision_logs sono governati da compliance/prodotto e restano fuori da questo lavoro).

Stato già esistente: `db_size_history` + 3 cron retention (`cleanup-cron-job-run-details` 30g, `cleanup-pg-net-responses` 7g, `track-db-growth` daily) sono **già attivi** dal cleanup precedente — questo piano li integra con guard rail e alerting.

## Deliverable 1 — Linter CI `check-retention-policy`

- Crea `scripts/ci/check-retention-policy.mjs` come da prompt: scansiona le migration modificate nella PR, blocca CREATE TABLE log-pattern (`_log/_logs/_events/_history/_audit/_runs/_jobs/_requests/_responses/_stats/_metrics/_queue/_dlq/_dispatches/_deliveries/_changes/_relay/_attempts/_executions/_telemetry/_measurements/_traces`) senza retention dichiarata. Pattern accettati: commento `-- retention: N giorni`, `cron.schedule`, `PARTITION BY`, `pg_partman`, oppure escape `-- @no-retention-needed: <motivazione>`. Check secondario: se ha colonna timestamp, deve avere indice su quella colonna.
- Crea test in `scripts/ci/__tests__/check-retention-policy.test.mjs` (3 fixture: log senza retention → fail; log + cron → pass; tabella business → pass; `@no-retention-needed` → pass).
- Aggiunge step in `.github/workflows/code-hygiene.yml` che lancia il linter sui file `supabase/migrations/*.sql` modificati rispetto a origin/main.

## Deliverable 2 — Monitor + alerting

- **`db_size_history` esiste già** (creata in cleanup precedente). Nuova migration aggiunge:
  - colonne `wal_bytes bigint`, `inactive_replication_slots jsonb` (additive, nullable+default).
  - aggiorna il cron `track-db-growth` per popolare anche queste due colonne (via `cron.unschedule` + `cron.schedule` re-issue, idempotente).
  - cron `cleanup-db-size-history` (30 4 * * *, retention 90gg).
  - VIEW `v_db_growth_alerts` con severity CRITICAL >6 GB, WARNING crescita >1 GB/giorno (soglia adatta al piano 8 GB Supabase).
- Edge function `db-growth-alert` (cron orario): legge la view, se ci sono righe CRITICAL/WARNING invia notifica via `notification-webhook-dispatcher` esistente (pattern `slo-breach-checker`). Schedulata via `supabase--insert` cron (NON migration, contiene URL/anon key).

## Deliverable 3 — Audit retroattivo (run-once + tabella ticket)

Audit eseguito ora su ralphloop. Risultato: 5 tabelle critiche da prioritizzare (le rimanenti sono < 200 KB e governate dalla compliance — passa per il policy doc, non per cron).

| Tabella | Size | Decisione proposta |
|---|---|---|
| `mcp_resource_changes` | 8 MB | retention 30g via cron |
| `incoming_requests` | 2.4 MB | retention 14g via cron |
| `slo_measurements` | 2 MB | governance prodotto → esente con motivazione |
| `sheets_export_logs` | 432 KB | retention 30g via cron |
| `cron_run_log` | 104 KB | retention 30g via cron |
| `meta_capi_event_queue` | 520 KB | review separata (queue, non solo append-only) |

Migration nuova `<ts>_retention_phase1.sql`: aggiunge 4 cron (`cleanup-mcp-resource-changes`, `cleanup-incoming-requests`, `cleanup-sheets-export-logs`, `cleanup-cron-run-log`) registrati in `cron_job_registry` con `auto_recreate_sql`.

Le restanti tabelle log-pattern (audit_events, ad_*, ai_decision_logs, lead_events, ticket_audit_logs, ecc.) **NON vengono toccate** — vengono solo dichiarate in `docs/db-retention-policy.md` come "esenti / governate da compliance" con motivazione.

## Deliverable 4 — ADR + policy doc

- `docs/decisions/ADR-001-retention-mandatory.md` — testo del prompt (Status: Accepted 2026-05-07, Trigger: incident 7 maggio).
- `docs/db-retention-policy.md` — tabella retention attive (incluse le 3 + 4 nuove), procedura per nuove tabelle accumulative, esempi di migration corrette, lista esenti con motivazione (audit/compliance/business).
- Link da `docs/decisions.md` (se esiste) o crea index minimale.

## Deliverable 5 — Cadenza operativa

- Aggiungi sezione "Capacity & retention" a `docs/admin-runbook.md`:
  - Mensile: capacity review (15 min) — link `db_size_history`, verifica cron attivi, alert pendenza > 5%/mese.
  - Trimestrale: retention audit (30 min) — query Deliverable 3 + decisione su NO CLEANUP nuovi.
  - Annuale: DR drill "disco pieno 5 minuti" → nuovo file `docs/dr/04-disk-full.md`.

## Cosa NON faccio (vincoli del prompt)

- Nessun DELETE/cleanup retroattivo su tabelle business (audit_events, lead_events, ad_*, slo_measurements, ai_*, mcp_*, ticket_audit_logs).
- Nessuna nuova dipendenza SaaS (no Datadog/PagerDuty): l'allerta passa per dispatcher interno.
- Cron applicativi esistenti invariati.
- Tutte le migration idempotenti (`IF NOT EXISTS`, `cron.unschedule` prima di `cron.schedule`).

## Definition of Done

- [ ] Linter `check-retention-policy.mjs` + test + step in code-hygiene.yml — verifica con migration sbagliata di prova
- [ ] `db_size_history` esteso (wal_bytes, slots) + view `v_db_growth_alerts` + cleanup 90gg
- [ ] Edge function `db-growth-alert` deployata + cron orario + test manuale notifica
- [ ] 4 nuovi cron retention attivi (mcp_resource_changes, incoming_requests, sheets_export_logs, cron_run_log) + registry
- [ ] ADR-001 + `db-retention-policy.md` + sezione runbook + DR drill 04-disk-full
- [ ] Memoria aggiornata (`mem://features/db-retention-cleanup` integrata)

## Domande per te

1. **Soglia CRITICAL**: confermi 6 GB su 8 GB plan (75%), o vuoi più aggressiva 5 GB (62%)?
2. **Edge function notifica**: usa il dispatcher esistente generico, oppure preferisci un canale dedicato (es. nuova entry in `notification_channels` per "infra-alerts")?
3. **Le 4 retention proposte (mcp_resource_changes 30g, incoming_requests 14g, sheets_export_logs 30g, cron_run_log 30g)** ti vanno bene così o vuoi rivedere durate?

Confermi e procedo, oppure aggiusto prima.
