

## SPEC: Invio webhook SiLeads ad ogni cambio fase pipeline

### Situazione attuale

- Esiste gia un trigger SQL (`trg_emit_pipeline_stage_changed`) che, ad ogni INSERT su `deal_stage_history`, accoda un evento `pipeline.stage_changed` nella coda webhook con il payload completo (contact_snapshot + stage_snapshot).
- I webhook SiLeads attualmente sottoscrivono **solo** `lead_event.created` — quindi i cambi di fase vengono ignorati.
- Il dispatcher usa il `payload_mapping` del webhook per estrarre i campi dal payload e inviarli come form_urlencoded a SiLeads.

### Piano di implementazione

#### 1. Aggiungere `pipeline.stage_changed` agli event_types dei webhook SiLeads (migrazione dati)

```sql
UPDATE outbound_webhooks
SET event_types = array_append(event_types, 'pipeline.stage_changed')
WHERE name ILIKE '%sileads%';
```

Questo fa si che il dispatcher invii i dati a SiLeads anche quando un deal cambia fase.

#### 2. Verificare compatibilita del payload

Il payload di `pipeline.stage_changed` include gia `contact_snapshot` (con `pipeline_stage_name`) e `stage_snapshot` (con `to_stage_name`). Il `payload_mapping` attuale dei webhook SiLeads mappa campi da `contact_snapshot.*`, quindi funzionera automaticamente: il campo `extra` mappato su `contact_snapshot.pipeline_stage_name` inviera il nome della nuova fase.

**Nessuna modifica al dispatcher o al mapping necessaria** — il mapping gia configurato (`extra` -> `contact_snapshot.pipeline_stage_name`) funziona per entrambi gli eventi.

#### 3. Nessuna modifica a Google Sheets

Google Sheets usa gia `build_contact_snapshot` che include `pipeline_stage_name`. L'export riflettera sempre la fase corrente al momento dell'export.

### Riepilogo modifiche

| File/Risorsa | Modifica |
|---|---|
| Migrazione dati (SQL) | Aggiungere `pipeline.stage_changed` a `event_types` dei 3 webhook SiLeads |

### Risultato

Ogni volta che un deal cambia fase (tramite UI pipeline, keplero-webhook, o automazioni), SiLeads ricevera automaticamente un webhook con tutti i dati del contatto, inclusa la nuova fase nel campo `extra`.

