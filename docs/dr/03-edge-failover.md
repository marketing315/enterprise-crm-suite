# DR Runbook 03 — Edge Functions Failover

**Scenario**: le edge functions di Lovable Cloud sono down, lente o restituiscono massivamente 5xx. La piattaforma deve continuare ad accettare webhook in ingresso e gestire le richieste utente in **degraded mode**, accodando i side effects da processare quando il servizio torna sano.

- **RPO**: 0 (gli eventi vengono accodati persistentemente)
- **RTO target**: < 30 min per attivare il degraded mode
- **Severità tipica**: SEV-1

---

## 1. Detection

Sintomi:
- Tasso di errore edge functions > 25% per > 5 min (alert SLO)
- Healthcheck `/admin/slo-board` lampeggia rosso su `webhook-ingest`, `automation-runner`, etc.
- Aumento improvviso di righe `incoming_requests` con status `failed` ed `dlq_reason = 'edge_unavailable'`
- Utenti segnalano "salvataggio non riuscito" massivamente

Verifica rapida:
```bash
# Health check edge
curl -o /dev/null -s -w "%{http_code} %{time_total}s\n" \
  https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/health-check

# Status Lovable Cloud
curl -s https://status.lovable.dev | grep -i "edge"
```

## 2. Attivazione degraded mode

### 2.1 Frontend banner

Eseguire in DB:
```sql
UPDATE public.system_settings
SET value = jsonb_build_object(
  'enabled', true,
  'message', 'Servizio in modalità degradata. Le tue azioni sono salvate ma alcuni effetti (notifiche, integrazioni esterne) potrebbero essere ritardati.',
  'level', 'warning'
)
WHERE key = 'system_banner';
```

Tutti i client mostreranno il banner entro 60s grazie a Realtime.

### 2.2 Disabilita le sync schedulate non-critiche

Per ridurre carico sulle edge mentre cercano di riprendersi:

```sql
-- Sospendi sync ads / marketing reports / digest
SELECT cron.unschedule('ads-stats-meta-hourly');
SELECT cron.unschedule('automated-marketing-reports-daily');
SELECT cron.unschedule('siem-exporter-every-5-min');
SELECT cron.unschedule('lead-digest-dispatch-every-min');
```

**MANTENERE attivi**:
- `webhook-dispatcher` (delivery DLQ-safe)
- `automation-jobs-dispatcher` (queue persistente)
- `process-email-queue` (queue persistente)

### 2.3 Switch webhook ingestion in queue-only mode

Il webhook ingest deve **accettare** payload (HTTP 202) ma **non** invocare downstream:

```sql
UPDATE public.system_settings
SET value = jsonb_build_object('enabled', true, 'reason', 'edge_failover')
WHERE key = 'webhook_queue_only_mode';
```

L'edge `webhook-ingest` legge questa flag a ogni richiesta: se attiva, salva `incoming_requests` con `status='pending'` e ritorna 202 senza dispatchare.

## 3. Monitoring durante l'incidente

```sql
-- Pending queue size
SELECT count(*) FROM public.incoming_requests WHERE status = 'pending';

-- Tasso ingresso
SELECT date_trunc('minute', received_at) AS minute, count(*)
FROM public.incoming_requests
WHERE received_at > now() - interval '15 minutes'
GROUP BY 1 ORDER BY 1 DESC;

-- Edge errors trend
SELECT date_trunc('minute', created_at), count(*)
FROM public.audit_events
WHERE entity_type = 'edge_function' AND action = 'error'
  AND created_at > now() - interval '15 minutes'
GROUP BY 1 ORDER BY 1 DESC;
```

## 4. Recovery

Quando le edge functions tornano sane (success rate > 95% per 5 min consecutivi):

### 4.1 Riattiva sync schedulate

```sql
SELECT cron.schedule('siem-exporter-every-5-min', '*/5 * * * *',
  $$SELECT net.http_post(url:='...', headers:='...', body:='...');$$);
-- ... ripetere per ciascuna sync sospesa (vedi backup snapshot dei job in §5)
```

### 4.2 Disattiva queue-only mode

```sql
UPDATE public.system_settings
SET value = jsonb_build_object('enabled', false)
WHERE key = 'webhook_queue_only_mode';
```

### 4.3 Drain della queue

Avviare il replay controllato dei `pending` accumulati:

```bash
deno run --allow-net --allow-env scripts/dr/drain-pending-queue.ts \
  --rate=20 --batch=100
```

Lo script:
1. Estrae batch di `incoming_requests` con `status='pending'`
2. Li rispedisce alla webhook ingestion in modalità normale
3. Rispetta rate limit per evitare di ri-saturare le edge appena riprese
4. Logga su `audit_events` con `action='drained'`

### 4.4 Rimuovi banner

```sql
UPDATE public.system_settings
SET value = jsonb_build_object('enabled', false)
WHERE key = 'system_banner';
```

## 5. Backup dei cron job (one-time setup)

Per facilitare la ricostituzione, mantenere uno snapshot YAML dei cron job in `scripts/dr/cron-jobs-snapshot.yml`. Aggiornare ogni volta che si aggiunge/modifica un job.

```bash
# Aggiorna snapshot
psql "$DATABASE_URL" -At -c "SELECT jobname, schedule, command FROM cron.job;" \
  > scripts/dr/cron-jobs-snapshot.txt
```

## 6. Comunicazione

| Fase | Audience | Canale | Messaggio |
|------|----------|--------|-----------|
| Detection | Team interno | Slack `#incidents` | "SEV-1: edge functions degraded, attivo failover" |
| Degraded mode attivato | Utenti | In-app banner | "Servizio in modalità degradata, dati salvati" |
| Update | Stakeholder | Email | Update ogni 30 min con ETA |
| Recovery in corso | Utenti | In-app banner | "Servizio in ripristino, drain queue in corso" |
| Risolto | Tutti | Email + status page | Riassunto incident |

## 7. Post-mortem

Obbligatorio. Focalizzato su:
- **Capacity planning**: l'edge ha retto la queue al recovery? Serve scaling?
- **Detection time**: quanto tempo è passato tra il primo errore e l'attivazione degraded mode?
- **User impact**: quanti utenti hanno visto errori prima dell'attivazione?
- **Action items**: alert thresholds, automation del failover (oggi è manuale)

---

**Test drill trimestrale**: `scripts/dr/drill-edge-failover.sh` simula edge down (mock 503) e verifica che il banner si attivi correttamente.
