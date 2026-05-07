# DB Retention Policy

Vincolante. Vedi [ADR-001](decisions/ADR-001-retention-mandatory.md).

## Regola

> Ogni tabella che accumula righe nel tempo deve dichiarare retention nella stessa
> migration che la introduce. CI blocca migration non conformi.

## Retention attive

| Tabella | Retention | Cron job | Note |
|---|---|---|---|
| `cron.job_run_details` | 30g | `cleanup-cron-job-run-details` | Sistema pg_cron |
| `net._http_response` | 7g | `cleanup-pg-net-responses` | Sistema pg_net |
| `public.db_size_history` | 90g | `cleanup-db-size-history` | Monitor DB |
| `public.mcp_resource_changes` | 30g | `cleanup-mcp-resource-changes` | ADR-001 |
| `public.incoming_requests` | 14g | `cleanup-incoming-requests` | ADR-001 |
| `public.sheets_export_logs` | 30g | `cleanup-sheets-export-logs` | ADR-001 |
| `public.cron_run_log` | 30g | `cleanup-cron-run-log` | ADR-001 |

Cron `track-db-growth` (`0 4 * * *`) popola `db_size_history` con dimensione DB,
WAL, top 15 tabelle, replication slot inattivi.

## Tabelle esenti (governate da compliance / prodotto)

| Tabella | Motivazione |
|---|---|
| `audit_events` | Hash chain compliance (A3); retention regolata da policy legale |
| `lead_events`, `meta_lead_events` | Business — retention via prodotto/marketing |
| `ad_platform_stats`, `ad_creative_stats`, `ad_demographic_stats`, `ad_sync_log` | Marketing storico (multi-anno) |
| `ai_decision_logs` | Audit AI — retention via Compliance Capacity policy |
| `slo_measurements` | Observability — burn-rate richiede 90g+ |
| `ticket_audit_logs`, `deal_stage_history` | Audit business |
| `backup_runs`, `backup_signed_url_audit` | Audit backup |
| `compliance_change_log` | Compliance regolatoria |

Le tabelle esenti devono comunque dichiarare `-- @no-retention-needed: <motivazione>`
nella migration di creazione (verificato dal linter).

## Come aggiungere una nuova tabella accumulativa

```sql
-- retention: 30 giorni
CREATE TABLE IF NOT EXISTS public.foo_log (
  id bigserial PRIMARY KEY,
  brand_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);
CREATE INDEX idx_foo_log_created_at ON public.foo_log(created_at);
```

E poi via `supabase--insert` (NON migration, contiene env-specific):
```sql
SELECT cron.schedule('cleanup-foo-log','11 3 * * *',
  $$ DELETE FROM public.foo_log WHERE created_at < now() - interval '30 days'; $$);
```

Registra il job in `public.cron_job_registry`.

## Cadenza operativa

- **Mensile** (Engineering Lead, 15 min): trend `db_size_history`, verifica cron `active=true`.
- **Trimestrale** (Senior Backend, 30 min): re-run audit retroattivo. Per tabelle > 5 GB valuta partizionamento `pg_partman`.
- **Annuale** (all team, 30 min): DR drill "disco pieno 5 minuti".

## Audit retroattivo (query di check)

```sql
WITH log_pattern AS (
  SELECT n.nspname AS schema_name, c.relname AS table_name,
         pg_total_relation_size(c.oid) AS size_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind='r'
    AND n.nspname NOT IN ('pg_catalog','information_schema','pgsodium','vault','extensions')
    AND c.relname ~ '_(log|logs|events|history|audit|trace|attempts|runs|executions|queue|dlq|jobs|requests|responses|stats|metrics|telemetry|measurements|dispatches|deliveries|changes|relay)$'
),
crons AS (SELECT command FROM cron.job WHERE active=true)
SELECT l.schema_name||'.'||l.table_name AS tbl, pg_size_pretty(l.size_bytes) AS size,
  CASE WHEN EXISTS (SELECT 1 FROM crons WHERE command ILIKE '%'||l.table_name||'%')
       THEN 'has cron' ELSE 'NO CLEANUP' END AS retention_status
FROM log_pattern l ORDER BY l.size_bytes DESC;
```
