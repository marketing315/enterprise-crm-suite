# Piano esecuzione runbook "Pulizia DB pieno" su ralphloop

Severità P1. Tempo stimato: 30-45 min. Finestra: orario di basso traffico.

## Perimetro (HARD)

Tocco SOLO due tabelle di sistema:
- `cron.job_run_details` (retention 30 giorni)
- `net._http_response` (retention 7 giorni)

NESSUNA tabella business (`public.contacts`, `deals`, `appointments`, `tickets`, `lead_events`, `audit_events`, `ai_*`, `mcp_*`, `notifications`, `ad_*`, `slo_measurements`, `cron_relay_log`, `meta_capi_event_queue`, `idempotency_*`) viene toccata. Nessun `DROP`/`TRUNCATE` ovunque. Conforme a `mem://constraint/appointments-data-safety`.

## Step di esecuzione

### 1. Snapshot pre-intervento (read-only)
Via `supabase--read_query`: `pg_database_size`, count + size di `cron.job_run_details` e `net._http_response`. Allego output.

### 2. DELETE batch retention — via `supabase--migration` (separata, no business data)
Due blocchi `DO $$ ... LOOP ... DELETE ... LIMIT 50000 ... pg_sleep(0.3) $$`:
- `cron.job_run_details WHERE end_time < now() - interval '30 days'`
- `net._http_response WHERE created < now() - interval '7 days'`

### 3. Verifica righe residue (read-only)
Conferma drop significativo. Se invariato → STOP.

### 4. VACUUM FULL + ANALYZE
`VACUUM FULL` non gira in transazione → NON via `supabase--migration` (che usa transaction). Opzioni:
- **Preferita:** chiedo all'utente di eseguirlo manualmente nel SQL Editor con "Wrap in transaction" disattivato (Metodo A del runbook), oppure via `psql` direct connection 5432 (Metodo B). Fornisco gli snippet pronti.
- Motivo: il sandbox `psql` punta al DB Supabase del progetto ma `VACUUM FULL` su `net._http_response` può richiedere lock e va fatto in modo controllato.

### 5. Verifica spazio recuperato (read-only)
Atteso: ~4 GB liberati, le due tabelle < 100 MB.

### 6. Schedule retention permanente — via `supabase--insert` (NON migration)
Tre `cron.schedule()` (idempotenti, con unschedule preventivo):
- `cleanup-cron-job-run-details` — `17 3 * * *`
- `cleanup-pg-net-responses` — `23 3 * * *`
- `track-db-growth` — `0 4 * * *`

Uso `insert` perché `cron.schedule` contiene credenziali/dati specifici dell'istanza (vedi linea guida `schedule-jobs-supabase-edge-functions`).

### 7. Monitor crescita DB — via `supabase--migration`
Crea `public.db_size_history` (id, measured_at, total_bytes, top_tables jsonb) con RLS admin/CEO read-only via `has_role(auth.uid(),'admin'|'ceo')`. Nessun INSERT applicativo: solo il cron dello Step 6 scrive.

### 8. Registrazione cron in `cron_job_registry`
Per conformità `mem://technical/a10-cron-isolation`, registro i 3 nuovi job in `cron_job_registry` con `auto_recreate_sql`.

### 9. Migration file riproducibile
Genero `supabase/migrations/<ts>_db_cleanup_retention.sql` contenente: tabella `db_size_history` + RLS + registry entries. Gli `cron.schedule()` restano in `supabase--insert` (non in migration, come da policy).

## Definition of Done
- [ ] DB size sceso ≥ 3.5 GB
- [ ] `cron.job_run_details` < 100 MB
- [ ] `net._http_response` < 100 MB
- [ ] 3 cron job attivi in `cron.job` e in `cron_job_registry`
- [ ] `db_size_history` creata + RLS admin/CEO
- [ ] Snapshot pre/post in chat
- [ ] Migration committata
- [ ] Memoria aggiornata: `mem://features/db-retention-cleanup`

## Rollback
- Step 2 (DELETE): nessun rollback (dati di sistema scaduti, nessun valore).
- Step 4 (VACUUM): nessun rollback richiesto.
- Step 6 (cron): `SELECT cron.unschedule('<name>')`.
- Step 7 (monitor): `DROP TABLE public.db_size_history`.

## Punti che richiedono input utente
1. **Conferma finestra di esecuzione** (basso traffico): procedo subito o aspetto?
2. **VACUUM FULL Step 4**: confermi che lo esegui manualmente nel SQL Editor, oppure preferisci che provi via `psql` dal sandbox (con rischio lock su edge function attive)?
