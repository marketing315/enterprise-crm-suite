# DR Runbook 01 — Replay massivo DLQ

**Scenario**: dopo un outage di un sistema downstream (n8n, Voispeed, Meta CAPI, partner webhook) si sono accumulati centinaia/migliaia di payload in `incoming_requests` con `status = 'failed'`. È necessario rielaborarli in modo controllato senza saturare i sistemi appena tornati online.

- **RPO**: 0 (i payload originali sono conservati integralmente in `incoming_requests.payload`)
- **RTO target**: < 4 ore per 10.000 record
- **Severità tipica**: SEV-2

---

## 1. Pre-flight checklist (5 min)

- [ ] Confermato che il sistema downstream è realmente online (curl di health check)
- [ ] Verificato che il rate limit del downstream supporta il throughput pianificato
- [ ] Status page aggiornato con ETA
- [ ] Backup snapshot del DB pre-replay (point-in-time già attivo, ma annotare timestamp)
- [ ] Notifica `#incidents`: "Avvio replay DLQ, batch size X, ETA Y"

## 2. Diagnosi

```sql
-- Quanti payload sono in DLQ e di che tipo?
SELECT
  source,
  count(*) AS total,
  min(received_at) AS oldest,
  max(received_at) AS newest
FROM public.incoming_requests
WHERE status = 'failed'
GROUP BY source
ORDER BY total DESC;
```

Confermare con il team che la causa root del fallimento è risolta. **Non procedere** se la causa non è chiara: rischio di amplificare il problema.

## 3. Esecuzione (UI)

L'interfaccia `/admin/dlq` espone:

1. **Filtri**: source, finestra temporale, correlation_id, error_class
2. **Batch replay**: selezionare fino a 200 record per volta
3. **Telemetria live**: progress bar, success/fail count, ETA stimata
4. **Auto-stop**: il replay si interrompe se il tasso di errore supera il 25% (circuit breaker)

### Procedura standard

1. Aprire `/admin/dlq`
2. Filtrare per `source = 'X'` e periodo
3. Cliccare **"Anteprima batch"** → conferma payload sample
4. Selezionare batch size: **partire piccoli** (50) e aumentare se OK
5. Cliccare **"Replay batch"** e monitorare la progress bar
6. Verificare che gli eventi appaiano in `audit_events` con `action = 'replayed'`

## 4. Esecuzione (CLI per replay massivo > 1000)

Per replay massivi, usare lo script CLI con rate limiting esplicito:

```bash
# Stima durata
deno run --allow-net --allow-env scripts/dr/replay-dlq.ts \
  --source=keplero \
  --since="2026-04-28T08:00:00Z" \
  --rate=10 \
  --dry-run

# Esecuzione reale
deno run --allow-net --allow-env scripts/dr/replay-dlq.ts \
  --source=keplero \
  --since="2026-04-28T08:00:00Z" \
  --rate=10 \
  --batch=50
```

Parametri:
- `--rate=N`: max N richieste/secondo (default 5)
- `--batch=N`: dimensione batch per claim (default 50)
- `--source=X`: filtra per source
- `--since=ISO`: replay solo eventi dopo questo timestamp
- `--dry-run`: mostra cosa farebbe senza inviare

## 5. Validazione post-replay

```sql
-- 5.1 Verifica che i count tornino
SELECT status, count(*)
FROM public.incoming_requests
WHERE source = 'X'
  AND received_at > '2026-04-28T08:00:00Z'
GROUP BY status;

-- 5.2 Errori residui
SELECT id, error_class, error_message, attempt_count
FROM public.incoming_requests
WHERE status = 'failed'
  AND source = 'X'
  AND attempt_count >= 5
LIMIT 100;

-- 5.3 Audit trail
SELECT count(*) FROM public.audit_events
WHERE action = 'replayed' AND occurred_at > now() - interval '1 hour';
```

## 6. Rollback

I replay sono idempotenti per design (idempotency key su `correlation_id` o hash payload). Se un replay è andato male:

1. Identificare gli `audit_events` creati dal replay (`action='replayed'`, `occurred_at` nella finestra)
2. Per ciascuno, decidere se la nuova entità creata va rollback-ata manualmente
3. Annotare nel post-mortem

**Non** esiste un comando "undo replay automatico": ogni rollback è caso-per-caso.

## 7. Comunicazione

- **Inizio**: Slack `#incidents` con timestamp + batch totale
- **Ogni 500 record**: update progress
- **Fine**: timestamp, success/fail count, link a dashboard
- **Status page**: rimuovere il banner di degraded mode

## 8. Post-mortem (entro 5 gg)

Compilare `docs/dr/post-mortem-template.md` con:
- Causa root
- Numero record processati e tasso di successo
- Tempo totale RTO vs target
- Action items (preferibilmente tecnici, non procedurali)

---

**Test drill**: vedi `scripts/dr/drill-dlq-replay.sh` (esegue il flusso end-to-end in sandbox con 100 fixture).
