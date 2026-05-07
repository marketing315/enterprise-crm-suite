
# Performance hardening — IO/CPU al 100% (DB solo 368 MB, NON è disco)

## Diagnosi misurata (pg_stat_statements ultimo periodo)

| # | Hot spot | Costo | Causa |
|---|----------|-------|-------|
| 1 | **Realtime WAL decode** `SELECT wal->>...` | **45.7% CPU totale**, 13.4M call, 32 GB shared hit | 34 tabelle pubblicate su `supabase_realtime` (alcune con scritture massicce: `lead_events`, `deal_stage_history`, `ticket_audit_logs`, `automation_jobs`, `chat_messages`) |
| 2 | DELETE retention `net._http_response` (batch 50k) | **18.7%**, 2.3M call, 4.7 GB hit | il cron `cleanup-pg-net-responses` gira in loop molto stretto |
| 3 | `process-email-queue` cron | **14.170 run/24h** (1 ogni 5s!), 651 KO/giorno | schedule troppo aggressivo, costoso (vault decrypt ad ogni run) |
| 4 | `ad_sync_log` query | 94 ms medi, 16.633 call, **138M tuple seq-scan** | indice mancante su `(provider, account_id, sync_to)` — solo PK presente |
| 5 | 9 dispatcher cron `* * * * *` via `cron-relay` | 9 × 1436 run/giorno = **~13k run/giorno** | tutti partono allo stesso minuto → spike CPU |
| 6 | `record_slo_snapshot()` ogni 5 min | 324 ms medi × 2.501 call = 13 min CPU/giorno | costoso, refresh-rate eccessivo |
| 7 | `admin_purge_cron_job_run_details` | 30 sec medi × 118 run = 38M block read | cleanup non incrementale |

## Piano (4 deliverable, tutti reversibili, zero perdita dati)

### D1 — Sgrassa realtime publication (impatto stimato: -35% CPU)

Tolgo dalla publication `supabase_realtime` le tabelle che non hanno UI live (sono ad alta scrittura ma nessun client le ascolta):

- `lead_events` — append-only, alto volume
- `deal_stage_history`, `deal_stage_transitions` — usate solo in viste audit
- `ticket_audit_logs` — letti via query on-demand, no live
- `ticket_comments` — pollati solo all'apertura ticket
- `automation_jobs`, `sales_order_items` — nessun listener UI
- `chat_message_reads`, `thread_read_state` — già aggregati nel hook
- `system_settings`, `pipeline_stages`, `tags`, `tag_assignments` — quasi mai cambiano
- `marketing_campaigns`, `marketing_costs`, `budgets`, `expenses` — letti via TanStack Query con invalidate
- `incoming_calls`, `call_transcripts` — usano già hook dedicato non-realtime

**Mantengo realtime su**: `appointments`, `contacts`, `deals`, `tickets`, `chat_messages`, `notifications`, `action_suggestions`, `admin_todos`, `payments`, `ai_call_action_proposals`, `webhook_inbound_events`, `contact_phones`, `products`, `sales_orders`, `call_logs`, `automation_jobs` (resta perché dispatch UI lo usa). 

Migration `ALTER PUBLICATION supabase_realtime DROP TABLE ...` (idempotente, reversibile).

### D2 — Throttle cron iperattivi (impatto stimato: -25% CPU)

| Cron | Da | A | Motivo |
|------|----|----|--------|
| `process-email-queue` | 5 secondi | **30 secondi** | KO 4.6%, retry esiste; latenza accettabile per email |
| `cleanup-pg-net-responses` | continuo (2.3M call) | **batch 10k, una volta/15min** | retention basta giornaliera, batch più piccoli |
| `ai-classify-processor` | `* * * * *` | **`*/2 * * * *`** | run vuote nell'80% dei casi |
| `notification-webhook-dispatcher-1min` | `* * * * *` | **`* * * * *`** stagger +30s | Resta minutely ma stagger per evitare spike |
| `slo-snapshot-every-5min` | `*/5` | **`*/15 * * * *`** | snapshot SLO non serve così denso |
| `record_slo_snapshot()` | inline RPC | aggiunto LIMIT + materializzazione |
| `mcp-slo-evaluator` | `*/5` | **`*/10 * * * *`** | |
| `cron-health-monitor-5min` | `*/5` | **`*/10 * * * *`** | |
| `refresh-anomaly-baselines` | daily ok | invariato | |

Stagger gli 8 dispatcher minutely (offset minuti diversi via `* * * * *` → `0,15,30,45 * * * *` per i meno critici).

Tutti applicabili via `supabase--insert` (cron.unschedule + cron.schedule).

### D3 — Indici mancanti (impatto stimato: -10% CPU, query 100x)

Migration:

```sql
-- ad_sync_log: oggi 138M tuple lette in seq-scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_sync_log_provider_account_to
  ON public.ad_sync_log(provider, account_id, sync_to DESC);

-- ai_jobs: 21M tuple lette
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_jobs_status_created
  ON public.ai_jobs(status, created_at) WHERE status IN ('pending','processing');

-- contacts: 1.4M tuple seq-scan (già ha brand_id idx ma manca composito)
-- Verifico prima esistenza indici, aggiungo solo se manca
```

Tutti `CREATE INDEX CONCURRENTLY` → zero downtime, niente lock.

### D4 — VACUUM ANALYZE settimanale (impatto: stabilità planner)

Cron settimanale `vacuum-analyze-hot-tables` (domenica notte):
```sql
VACUUM (ANALYZE) public.contacts, public.deals, public.appointments, 
                 public.tickets, public.lead_events, public.ad_sync_log;
```

Niente FULL → niente lock.

## Cose che NON faccio (vincoli safety)

- **NO DROP table/colonna** business
- **NO** modifiche RLS / policies
- **NO** modifiche schema business — solo indici additivi e publication
- **NO** rimozione cron core (compliance/SLO/backup restano)
- **NO** VACUUM FULL (lock + tu hai detto solo VACUUM)
- Tutte le modifiche reversibili in 1 migration di rollback se necessario

## Definition of Done

- [ ] D1: publication ridotta da 34 → ~16 tabelle, verificato che nessun hook frontend ascolta quelle rimosse (grep `supabase.channel` su src/)
- [ ] D2: 7 cron riconfigurati, registry aggiornato, monitorato 30 min post-change
- [ ] D3: 2-3 indici creati con CONCURRENTLY, verificato `idx_scan` cresce su `ad_sync_log`
- [ ] D4: cron VACUUM settimanale registrato
- [ ] Misurazione: snapshot `pg_stat_statements` prima/dopo (reset + 30 min finestra)
- [ ] Memory `db-retention-cleanup` aggiornata con sezione "Performance tuning maggio 2026"

## Domande per te

1. **Realtime D1**: confermo la lista mantenuta vs rimossa, oppure vuoi che faccia un grep esaustivo su `src/hooks/use*Realtime*` e `useGlobalRealtime` prima per essere sicuri al 100% che nessun hook si rompa? (consigliato — aggiunge 5 min al lavoro)
2. **`process-email-queue` 5s → 30s**: ok o lo vuoi a 15s? (5s è eccessivo per email)
3. **VACUUM settimanale (D4)**: ok la domenica 03:00 UTC, o preferisci un altro orario?

Confermi e procedo.
