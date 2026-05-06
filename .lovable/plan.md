## Obiettivo

Garantire che un'interruzione del flusso lead → Google Sheet (come quella dal 17 aprile) venga **rilevata in meno di 1 ora** invece che dopo settimane, e che sia **auto-rimediata** quando possibile.

## Cause del blackout (ricapitolo)

1. Trigger `trg_enqueue_sheets_export_for_lead` mancante → coda vuota silenziosa
2. Nessun alert su "0 export in N ore con lead in arrivo"
3. Limite 1000 record nel re-sync → backfill troncati
4. Nessun confronto periodico DB ↔ Sheet

## Piano in 4 livelli di difesa

### 1. SLO Monitor "Sheet Export Drift" (rilevazione < 1h)

Edge function `sheets-export-slo-check` schedulata ogni 15 min:

- Conta `lead_events` creati nell'ultima ora
- Conta `sheets_export_logs` con `status='success'` nell'ultima ora
- Calcola ratio. Se `lead_events > 5 AND success_ratio < 50%` → incident
- Se `lead_events > 0 AND sheets_export_logs = 0` da > 1h → incident **critical**
- Scrive in `slo_incidents` (già esistente per altri SLO) e notifica admin via web push + email

### 2. Schema Guard "Trigger essenziali" (prevenzione)

Migrazione che crea funzione `verify_critical_triggers()`:

- Lista hardcoded di trigger business-critical (incluso `trg_enqueue_sheets_export_for_lead`, `trg_lead_event_audit`, ecc.)
- Verifica che esistano in `pg_trigger`
- Esposta come RPC + chiamata da cron giornaliero
- Se trigger mancante → incident `critical` + auto-recreate dove sicuro

### 3. Reconciliation giornaliera DB ↔ Sheet

Edge function `sheets-reconciliation` schedulata 1×/giorno (notte):

- Conta righe nel tab `LEADS` del Sheet (via API)
- Conta lead nel DB nello stesso periodo (ultimi 7 giorni)
- Se delta > 2% → genera report + auto-trigger backfill mirato sui mancanti
- Log in `sheets_reconciliation_log` (nuova tabella append-only)

### 4. Dashboard `/admin/sheets-health`

Pagina admin con:

- Stato real-time della coda export (pending/success/failed ultime 24h)
- Grafico drift `lead_events` vs `sheets_export_logs` ultimi 30 giorni (avrebbe mostrato il buco di aprile a colpo d'occhio)
- Lista trigger critici e loro stato (verde/rosso)
- Ultimo reconciliation report con delta DB↔Sheet
- Pulsante manuale "Re-sync ora" e "Verifica trigger"

## Dettagli tecnici

**Nuove tabelle:**

```text
sheets_reconciliation_log
├── id, run_at, period_start, period_end
├── db_count, sheet_count, delta, delta_pct
├── status (ok | drift | critical), incident_id?
└── details jsonb (lead_id mancanti)

critical_triggers_check_log
├── id, checked_at, trigger_name, table_name
├── present (bool), auto_recreated (bool)
└── incident_id?
```

**Nuove edge functions** (tutte con `INTERNAL_SERVICE_TOKEN`, structured logger, safe-error-response):
- `sheets-export-slo-check` (cron 15 min via cron-relay)
- `sheets-reconciliation` (cron 1×/giorno 03:00)
- `verify-critical-triggers` (cron 1×/giorno 02:00)

**Memorie da aggiornare:**
- `mem://features/sheets-export-slo` — pattern monitor + reconciliation
- Aggiornare core con regola: "Ogni pipeline business-critical (lead→Sheet, lead→Meta CAPI, ecc.) DEVE avere SLO monitor < 1h e reconciliation giornaliera"

## Out of scope (per ora)

- Re-architettura del sistema export (resta lead_events → trigger → queue → dispatcher)
- PagerDuty/SMS (usiamo web push + email admin esistenti)
- Reconciliation per altre integrazioni (Meta CAPI, n8n) — pattern riutilizzabile in futuro

## Risultato atteso

Se domani il trigger sparisce di nuovo:
- **t+15min**: SLO monitor rileva 0 export → incident critical
- **t+15min**: admin riceve push notification
- **t+24h**: verify-critical-triggers tenta auto-recreate
- **t+24h**: reconciliation rileva delta e fa backfill
