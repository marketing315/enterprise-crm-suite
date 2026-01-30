# Troubleshooting Guide

Guida diagnostica per problemi comuni con Inbound Webhooks (M1) e Google Sheets Export (M9).

---

## Inbound Webhooks (M1)

### 400 - Bad Request

**Cause possibili:**
- UUID sorgente non valido nel path
- JSON body malformato
- Campo `phone` mancante nel payload

**Soluzioni:**
1. Verifica che l'URL contenga un UUID valido: `/functions/v1/webhook-ingest/{uuid}`
2. Valida il JSON con un linter prima dell'invio
3. Assicurati che il payload contenga almeno uno tra: `phone`, `telefono`, `mobile`

**Esempio payload minimo:**
```json
{
  "phone": "+39 333 1234567",
  "first_name": "Mario",
  "email": "mario@example.com"
}
```

---

### 401 - Unauthorized

**Cause possibili:**
- Header `X-API-Key` mancante
- API key errata o scaduta

**Soluzioni:**
1. Aggiungi l'header: `X-API-Key: your-api-key`
2. Verifica che la chiave sia quella generata al momento della creazione della sorgente
3. Se la chiave è stata persa, ruota la API key dalla UI e usa la nuova

**Nota:** Le API key sono mostrate **una sola volta** al momento della creazione.

---

### 404 - Not Found

**Cause possibili:**
- Source ID (UUID) non esistente nel database
- Source cancellata

**Soluzioni:**
1. Verifica l'UUID nella lista sorgenti in Settings → Inbound Webhooks
2. Crea una nuova sorgente se necessario

---

### 409 - Conflict (Inactive Source)

**Cause possibili:**
- La sorgente webhook è stata disattivata

**Risposta tipica:**
```json
{
  "error": "inactive_source",
  "message": "Webhook source is not active"
}
```

**Soluzioni:**
1. Vai in Settings → Inbound Webhooks
2. Attiva la sorgente con il toggle
3. Riprova l'invio

---

### 429 - Rate Limit Exceeded

**Cause possibili:**
- Troppi request in un minuto (default: 60/min per source)

**Risposta tipica:**
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 60
}
```

**Soluzioni:**
1. Rispetta l'header `Retry-After` (in secondi)
2. Implementa exponential backoff nel client
3. Aumenta il rate limit della sorgente se necessario (richiede modifica DB)

---

### 500 - Internal Server Error

**Cause possibili:**
- Errore database (RLS, connessione)
- Bug nel codice di processing

**Soluzioni:**
1. Controlla i log edge function nel backend
2. Verifica che le RLS policies siano corrette
3. Controlla la tabella `incoming_requests` per `status = 'failed'`

**Query diagnostica:**
```sql
SELECT id, created_at, error_message 
FROM incoming_requests 
WHERE status = 'failed' 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## Google Sheets Export (M9)

### Permission Denied (403)

**Cause possibili:**
- Service Account non ha accesso allo Sheet
- Sheet ID errato

**Soluzioni:**
1. Condividi lo Sheet con l'email del Service Account (Editor)
2. Verifica `GOOGLE_SHEETS_SPREADSHEET_ID` nei secrets

---

### Missing Data / Export Non Avvenuto

**Cause possibili:**
- Feature flag disabilitato
- Lead event non ha `source_name`
- Errore silenzioso nell'edge function

**Soluzioni:**
1. Verifica che `GOOGLE_SHEETS_ENABLED` = `true`
2. Controlla la tabella `sheets_export_logs`:

```sql
SELECT * FROM sheets_export_logs 
WHERE status = 'failed' 
ORDER BY created_at DESC 
LIMIT 10;
```

---

### Duplicate Skipped

**Comportamento atteso:** Se un `lead_event_id` è già stato esportato, viene skippato (idempotenza).

**Verifica:**
```sql
SELECT * FROM sheets_export_logs 
WHERE lead_event_id = 'your-lead-event-id';
```

Se esiste un record con `status = 'success'`, l'export è già avvenuto.

---

### Rate Limit Google API

**Cause possibili:**
- Troppi append in poco tempo
- Quota API esaurita

**Soluzioni:**
1. Usa `sheets-batch-export` con `delay_ms` per backfill
2. Monitora la quota nella Google Cloud Console

---

## Database / RLS

### RLS Policy Violation

**Cause possibili:**
- Utente non autenticato tenta operazione
- `brand_id` non corrisponde ai permessi utente

**Soluzioni:**
1. Verifica che l'operazione usi il `service_role` (per edge functions)
2. Controlla le policies con:

```sql
SELECT * FROM pg_policies 
WHERE tablename = 'incoming_requests';
```

---

### Query Lente su incoming_requests

**Soluzioni:**
L'indice `idx_incoming_requests_source_created_desc` ottimizza query per source + data:

```sql
-- Query ottimizzata
SELECT * FROM incoming_requests 
WHERE source_id = 'uuid' 
ORDER BY created_at DESC 
LIMIT 50;
```

---

## Checklist Diagnostica Rapida

| Sintomo | Prima Cosa da Controllare |
|---------|--------------------------|
| 401 su webhook | Header `X-API-Key` presente? |
| 404 su webhook | UUID sorgente esiste? |
| 409 su webhook | Sorgente attiva? |
| Export non funziona | `GOOGLE_SHEETS_ENABLED` = true? |
| Dati mancanti in Sheet | Controlla `sheets_export_logs` |
| Errori 500 | Controlla `incoming_requests.status = 'failed'` |

---

## Outbound Webhooks (M8)

### Delivery Status Lifecycle

```
pending → processing → success
                    ↘ failed → (retry with backoff) → success
                              ↘ dead (after max attempts)
```

**Status definitions:**
- `pending`: Queued, waiting for dispatcher
- `processing`: Claimed by dispatcher, in-flight
- `success`: Delivered (2xx response)
- `failed`: Attempt failed, will retry
- `dead`: All retries exhausted (max_attempts reached)

### Exponential Backoff Schedule

| Attempt | Delay | Cumulative |
|---------|-------|------------|
| 1 | immediate | 0 |
| 2 | 1 min | 1 min |
| 3 | 5 min | 6 min |
| 4 | 15 min | 21 min |
| 5 | 1 hour | 1h 21m |
| 6 | 6 hours | 7h 21m |
| 7+ | 24 hours | varies |

**Note:** Jitter of ±30s added to prevent thundering herd.

### Dead Letter Queue (DLQ)

Dead deliveries can be replayed from Admin → DLQ Dashboard:

```sql
-- Find dead deliveries
SELECT id, webhook_id, event_type, last_error, dead_at
FROM outbound_webhook_deliveries
WHERE status = 'dead'
ORDER BY dead_at DESC;
```

---

## Log Strutturati (Edge Functions)

I log contengono:
- `request_id`: UUID univoco per tracciare la request
- `source_id`: UUID della sorgente
- `outcome`: `success`, `invalid_uuid`, `missing_api_key`, `invalid_api_key`, `source_not_found`, `inactive_source`, `rate_limited`
- `contact_id`, `lead_event_id`: IDs creati (solo su success)

**Esempio log success:**
```json
{
  "request_id": "abc-123",
  "source_id": "def-456", 
  "outcome": "success",
  "status": 200,
  "contact_id": "ghi-789",
  "lead_event_id": "jkl-012"
}
```

---

## Inbound DLQ Reasons

| Reason | Description | Resolution |
|--------|-------------|------------|
| `invalid_json` | Request body not valid JSON | Check sender payload format |
| `signature_failed` | HMAC signature mismatch | Verify shared secret |
| `rate_limited` | Rate limit exceeded | Reduce send frequency |
| `mapping_error` | Field mapping failed | Check source mapping config |
| `ai_extraction_failed` | AI couldn't extract contact data | Add explicit phone field |
| `contact_creation_failed` | DB error creating contact | Check constraints |
| `missing_required` | Phone number not found | Include phone in payload |
```
