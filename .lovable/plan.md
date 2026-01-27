

# Piano M1/M9 Enterprise Hardening — Versione Finale

## Modifiche Incorporate dal Feedback

| # | Feedback Utente | Azione |
|---|-----------------|--------|
| 1 | Enum `ingest_status` con 4 valori | Uso `pending`, `success`, `rejected`, `failed` |
| 2 | Migrazione dati: distinguere 4xx da 5xx | Backfill conservativo, riallineamento post-deploy |
| 3 | Nome indice coerente con `created_at` | `idx_incoming_requests_source_created_desc` |
| 4 | Header whitelist estesa | Aggiungo `accept`, `accept-language`; rimuovo `referer` (GDPR) |
| 5 | Email normalization nella dedup | Passo email normalizzata a `find_or_create_contact` |
| 6 | Test invalid JSON | Rimandato (Nice-to-have) |

---

## Fase 1: Migrazione Database

### 1.1 Schema Changes

```sql
-- Enum con 4 stati semanticamente corretti
CREATE TYPE ingest_status AS ENUM ('pending', 'success', 'rejected', 'failed');

-- Nuove colonne
ALTER TABLE incoming_requests 
ADD COLUMN user_agent text,
ADD COLUMN status ingest_status DEFAULT 'pending';

-- Backfill conservativo (riallineamento post-deploy per rejected)
UPDATE incoming_requests 
SET status = CASE 
  WHEN processed AND error_message IS NULL THEN 'success'
  WHEN processed AND error_message IS NOT NULL THEN 'failed'
  ELSE 'pending'
END;

-- Indice per query audit (source + data descending)
CREATE INDEX idx_incoming_requests_source_created_desc
ON incoming_requests (source_id, created_at DESC);
```

### 1.2 Files Impattati
- Nuova migrazione SQL in `supabase/migrations/`
- `src/integrations/supabase/types.ts` si aggiornerà automaticamente

---

## Fase 2: Edge Function Hardening

### 2.1 Header Whitelist (GDPR-Safe)

**File**: `supabase/functions/webhook-ingest/index.ts`

```typescript
const HEADER_WHITELIST = [
  "content-type",
  "user-agent", 
  "x-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
  "origin",
  "accept",
  "accept-language"
  // Escluso: referer (può contenere query string con PII)
  // Escluso: authorization, cookie, x-api-key (credenziali)
];

function filterHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const key of HEADER_WHITELIST) {
    const value = headers.get(key);
    if (value) filtered[key] = value;
  }
  return filtered;
}
```

### 2.2 Email Normalization

```typescript
// Prima (attuale)
const email = String(mappedPayload.email || "").trim() || null;

// Dopo (normalizzato)
const email = String(mappedPayload.email || "")
  .trim()
  .toLowerCase() || null;
```

### 2.3 Salvataggio user_agent

```typescript
const userAgent = req.headers.get("user-agent") || null;

const { data: incomingRequest } = await supabaseAdmin
  .from("incoming_requests")
  .insert({
    source_id: source.id,
    brand_id: brandId,
    raw_body: rawBody,
    headers: filterHeaders(req.headers), // Whitelist applicata
    ip_address: ipAddress,
    user_agent: userAgent,              // NUOVO
    status: 'pending',                   // NUOVO
    processed: false,
  })
  .select("id")
  .single();
```

### 2.4 Status Semantico per Outcome

```typescript
// Errori 4xx previsti → rejected
// 400 Bad Request (UUID invalido, payload invalido)
await supabaseAdmin
  .from("incoming_requests")
  .update({ processed: true, status: 'rejected', error_message: "..." })
  .eq("id", incomingRequest.id);

// 401/404/409/429 → rejected (errori "normali")
// 5xx / errori interni → failed

// Successo → success
await supabaseAdmin
  .from("incoming_requests")
  .update({ 
    processed: true, 
    status: 'success',
    lead_event_id: leadEvent?.id 
  })
  .eq("id", incomingRequest.id);
```

### 2.5 Mappa Completa Status

| Scenario | HTTP | status |
|----------|------|--------|
| UUID invalido | 400 | rejected |
| JSON invalido | 400 | rejected |
| Phone mancante | 400 | rejected |
| API key mancante | 401 | rejected |
| API key errata | 401 | rejected |
| Source non trovata | 404 | rejected |
| Source inattiva | 409 | rejected |
| Rate limit | 429 | rejected |
| Errore DB/interno | 500 | failed |
| Successo | 200 | success |

---

## Fase 3: Documentazione

### 3.1 Nuovo File: `docs/troubleshooting.md`

Contenuto strutturato per:
- Errori Inbound Webhooks (400/401/404/409/429/500)
- Errori Google Sheets Export
- Errori RLS/Database
- Checklist diagnostica

---

## Ordine di Esecuzione (Zero Downtime)

| Step | Azione | Rischio |
|------|--------|---------|
| 1 | DB Migration (colonne + enum + indice) | Basso (additive) |
| 2 | Deploy webhook-ingest con hardening | Basso (retrocompatibile) |
| 3 | Creare docs/troubleshooting.md | Zero |
| 4 | (Opzionale) Riallineamento storico rejected | Zero |

---

## Schema Finale incoming_requests

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| source_id | uuid | FK |
| brand_id | uuid | FK |
| raw_body | jsonb | Payload originale |
| headers | jsonb | **Whitelist GDPR-safe** |
| ip_address | text | Client IP |
| **user_agent** | text | **NUOVO** |
| **status** | ingest_status | **NUOVO** (pending/success/rejected/failed) |
| processed | boolean | Legacy |
| error_message | text | Dettaglio |
| lead_event_id | uuid | FK |
| created_at | timestamptz | Timestamp ricezione |

---

## Checklist Deliverables

- [ ] Migrazione DB: `user_agent`, `status` enum, indice composito
- [ ] webhook-ingest: whitelist headers GDPR
- [ ] webhook-ingest: email normalization (trim/lowercase)
- [ ] webhook-ingest: salvare user_agent
- [ ] webhook-ingest: status semantico (rejected vs failed)
- [ ] docs/troubleshooting.md standalone

