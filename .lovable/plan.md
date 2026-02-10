

# Fix: Creazione lead_event mancanti e invio a SiLeads

## Problema identificato

Il webhook Meta ha ricevuto il lead di Lyudmyla Babenko e ha creato il contatto, ma l'inserimento del `lead_event` e' fallito (errore: `lead_event_insert_failed_recovered`). Poiche' l'outbound webhook SiLeads e' agganciato all'evento `lead_event.created`, senza il lead_event non parte nessun invio.

## Causa radice

Il bug nel codice del webhook (gia' corretto nel messaggio precedente) causava il fallimento dell'inserimento del `lead_event`, interrompendo la catena di automazione.

## Piano di intervento

### Passo 1 — Identificare tutti i lead Meta non processati

Query per trovare tutti i record in `meta_lead_events` con status `error` o senza `lead_event_id`, per capire la portata del problema (non solo Lyudmyla).

### Passo 2 — Creare i lead_event mancanti via SQL

Per ogni record `meta_lead_events` con `contact_id` presente ma `lead_event_id` NULL:
- Inserire un `lead_event` con i dati dal `fetched_payload` (source, campaign, campo dati, ecc.)
- Aggiornare il record `meta_lead_events` con il nuovo `lead_event_id` e status `ingested`

### Passo 3 — Verificare il trigger outbound

Controllare come vengono create le `outbound_webhook_deliveries`:
- Se c'e' un trigger DB su `lead_events` INSERT, l'inserimento al passo 2 fara' scattare automaticamente l'invio a SiLeads
- Se invece il dispatch e' gestito dall'automation engine, potrebbe servire un passaggio aggiuntivo per accodare manualmente le delivery

### Passo 4 — Validazione

- Verificare che i nuovi `lead_event` siano stati creati
- Verificare che le `outbound_webhook_deliveries` siano state accodate per SiLeads
- Monitorare i log del `webhook-dispatcher` per confermare l'invio

## Dettagli tecnici

Il lead di Lyudmyla ha questi dati:
- **Contact ID**: `69704057-e0d9-437c-ab80-3894917dd931`
- **Meta Event ID**: `7dc57b07-902c-4a2d-ba3c-576f7cfe9a43`
- **Leadgen ID**: `1371119191436102`
- **Brand**: Excell (`2dc052de-26b5-48ef-8dee-917ea591a681`)
- **SiLeads Webhook**: `3d1ba821-cdaf-424c-bcbf-514c8770a8fa`
- **Campagna**: Excell Plus - Modulo Conttatti - new 10/02/26

La migrazione SQL creera' i `lead_event` mancanti e, se il trigger esiste, accoda automaticamente l'invio a SiLeads. Se il trigger non esiste (l'invio e' gestito via automation engine), verra' creata anche la delivery manualmente.

