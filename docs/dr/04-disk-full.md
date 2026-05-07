# DR drill — Disco DB pieno (5 minuti per agire)

**Scenario**: monitor segnala `v_db_growth_alerts` severity=CRITICAL (DB > 6 GB su 8 GB plan) o utente segnala scritture in errore "no space left on device".

## Step on-call (target < 5 min)

1. **Top tables by size** (SQL Editor):
   ```sql
   SELECT schemaname||'.'||relname AS tbl, pg_size_pretty(pg_total_relation_size(relid)) AS size
   FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;
   ```
2. **Replication slot zombie** (riempiono WAL):
   ```sql
   SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_kept
   FROM pg_replication_slots WHERE active=false;
   ```
   Se trovi slot inattivi > 1 GB: `SELECT pg_drop_replication_slot('<name>');`
3. **Cron retention attivi**:
   ```sql
   SELECT jobname, active FROM cron.job
   WHERE jobname LIKE 'cleanup-%' OR jobname='track-db-growth';
   ```
   Se uno è inattivo → riattivalo da `auto_recreate_sql` in `cron_job_registry`.
4. **Cleanup batch** sulla tabella più grande (se è log-pattern non business):
   ```sql
   DO $$ BEGIN LOOP
     DELETE FROM <schema>.<table> WHERE created_at < now() - interval 'N days' LIMIT 50000;
     EXIT WHEN NOT FOUND; PERFORM pg_sleep(0.3);
   END LOOP; END $$;
   ```
   **Mai** `DELETE FROM` o `TRUNCATE` su tabelle business (`appointments`, `contacts`, `leads`, `deals`, `tickets`, `audit_events`, `lead_events`, `ad_*`).
5. **VACUUM FULL** (richiede SQL Editor con "Wrap in transaction" OFF):
   ```sql
   VACUUM (FULL, ANALYZE) <schema>.<table>;
   ```
6. **Comunica** sul canale incident: "[DB-FULL] cleaned X GB, root cause = ..., monitor: <link db_size_history>".

## Post-incident

- Apri PR retention-review per la tabella incriminata (vedi `docs/db-retention-policy.md`).
- Aggiorna ADR-001 se il pattern non era coperto.
- Verifica che il cron retention della tabella sia stato registrato in `cron_job_registry`.

## Riferimenti

- ADR: `docs/decisions/ADR-001-retention-mandatory.md`
- Runbook completo cleanup: `RUNBOOK-CLEANUP-DB-PIENO.md` (incident 2026-05-07)
- Policy retention: `docs/db-retention-policy.md`
