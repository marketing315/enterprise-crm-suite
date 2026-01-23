

# CRM Enterprise Multi-Brand - Piano di Implementazione v3

## Correzioni Applicate (Feedback v2)

| # | Issue | Correzione |
|---|-------|------------|
| 1 | Token bucket SQL bug | Funzione riscritta con UPSERT + variabili corrette |
| 2 | deal_stage_history mancante | Aggiunta tabella in M2 |
| 3 | Webhook brand_id spoofing | brand_id derivato server-side da webhook_source |
| 4 | Idempotency key semantica | Formula definita con entity_version |
| 5 | assumed_country flag | Aggiunto in NormalizedPhone |
| 6 | Circuit breaker state | Aggiunta tabella endpoint_health |

---

## Stack Tecnologico

| Layer | Tecnologia |
|-------|-----------|
| Frontend | React 18 + TypeScript + Tailwind + shadcn/ui |
| State Management | TanStack Query |
| Backend | Lovable Cloud (Supabase Edge Functions) |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth con RBAC |
| AI | Lovable AI Gateway (gemini-2.0-flash) |
| Charts | Recharts |
| Rate Limiting | DB-based token bucket |

---

## Architettura Database (v3)

```text
+------------------+     +----------------------+     +------------------+
|     brands       |     |       users          |     |   user_roles     |
+------------------+     +----------------------+     +------------------+
| id (PK)          |<-+  | id (PK)              |<--->| user_id (FK)     |
| name             |  |  | supabase_auth_id     |     | role (enum)      |
| slug             |  |  | email, name          |     | brand_id (FK)    |
| created_at       |  |  +----------------------+     +------------------+
+------------------+  |
                      |
      +---------------+----------------------------------+
      |               |                                  |
+-----v--------+ +----v-----------+  +------------------+
|  contacts    | | contact_phones |  |   lead_events    |
+--------------+ +----------------+  +------------------+
| id (PK)      | | id (PK)        |  | id (PK)          |
| brand_id(FK) | | brand_id (FK)  |  | brand_id (FK)    |
| first_name   | | contact_id(FK) |  | contact_id (FK)  |
| last_name    | | phone_raw      |  | deal_id (FK)     |
| email        | | phone_norm     |  | source           |
| city, cap    | | country_code   |  | occurred_at      |
| status       | | assumed_country|  | received_at      |
+--------------+ | is_primary     |  | ai_priority      |
      |          | is_active      |  | ai_model_ver     |
      |          +----------------+  | ai_prompt_ver    |
      |                              | archived         |
      |                              +------------------+
      |                                       |
+-----v--------+                    +---------v--------+
|    deals     |                    | pipeline_stages  |
+--------------+                    +------------------+
| id (PK)      |                    | id (PK)          |
| brand_id(FK) |                    | brand_id (FK)    |
| contact_id   |                    | name             |
| status       |                    | order_index      |
| stage_id(FK) |------------------->| is_active        |
| opened_at    |                    +------------------+
| closed_at    |
+--------------+
      |
      v
+--------------------+   <-- NUOVA TABELLA
| deal_stage_history |
+--------------------+
| id (PK)            |
| deal_id (FK)       |
| stage_id (FK)      |
| entered_at         |
| exited_at          |
| changed_by_user_id |
| change_reason      |
+--------------------+

+------------------+     +------------------+     +------------------+
|     tickets      |     |  appointments    |     |      sales       |
+------------------+     +------------------+     +------------------+
| id (PK)          |     | id (PK)          |     | id (PK)          |
| brand_id (FK)    |     | brand_id (FK)    |     | brand_id (FK)    |
| contact_id (FK)  |     | contact_id (FK)  |     | appointment_id   |
| status (enum)    |     | deal_id (FK)     |     | outcome (enum)   |
| subject          |     | scheduled_at     |     | notes            |
| description      |     | status (enum)    |     | created_by       |
+------------------+     | sales_user_id    |     +------------------+
                         +------------------+

+------------------+     +------------------+     +------------------+
| rate_limit_bucket|     | endpoint_health  |     |   audit_log      |
+------------------+     +------------------+     +------------------+
| id (PK)          |     | id (PK)          |     | id (PK)          |
| source_id (FK)   |     | endpoint_id (FK) |     | brand_id (FK)    |
| tokens INT       |     | state (enum)     |     | actor_user_id    |
| max_tokens       |     | failure_count    |     | action           |
| last_refill_at   |     | last_failure_at  |     | entity_type      |
| refill_rate      |     | open_until       |     | before/after     |
+------------------+     | updated_at       |     +------------------+
                         +------------------+

+------------------+
| outbound_delivery|
+------------------+
| id (PK)          |
| endpoint_id (FK) |
| status (enum)    |
| attempts INT     |
| max_attempts     |
| idempotency_key  | --> hash(endpoint_id + event_type + entity_id + entity_updated_at)
| dead_reason      |
| next_attempt_at  |
| last_error       |
| created_at       |
+------------------+
```

---

## Correzione 1: Token Bucket SQL (Fixed)

```sql
-- Tabella rate limiting
CREATE TABLE rate_limit_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES webhook_sources(id) ON DELETE CASCADE,
  tokens INT NOT NULL,
  max_tokens INT NOT NULL,
  refill_rate INT NOT NULL, -- tokens per minute
  last_refill_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id)
);

-- Funzione atomica CORRETTA
CREATE OR REPLACE FUNCTION consume_rate_limit_token(p_source_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_bucket RECORD;
  v_elapsed_minutes NUMERIC;
  v_tokens_to_add INT;
  v_new_tokens INT;
BEGIN
  -- 1. Upsert: crea bucket se non esiste (con valori default dalla source)
  INSERT INTO rate_limit_buckets (source_id, tokens, max_tokens, refill_rate)
  SELECT 
    p_source_id,
    ws.rate_limit_per_min,
    ws.rate_limit_per_min,
    ws.rate_limit_per_min
  FROM webhook_sources ws
  WHERE ws.id = p_source_id
  ON CONFLICT (source_id) DO NOTHING;

  -- 2. Lock e fetch del bucket
  SELECT tokens, max_tokens, refill_rate, last_refill_at
  INTO v_bucket
  FROM rate_limit_buckets
  WHERE source_id = p_source_id
  FOR UPDATE;

  -- 3. Se bucket non trovato (source non esiste), rifiuta
  IF v_bucket IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 4. Calcola tokens da aggiungere (refill)
  v_elapsed_minutes := EXTRACT(EPOCH FROM (now() - v_bucket.last_refill_at)) / 60.0;
  v_tokens_to_add := FLOOR(v_elapsed_minutes * v_bucket.refill_rate);
  
  -- 5. Calcola nuovi tokens (capped a max)
  v_new_tokens := LEAST(v_bucket.tokens + v_tokens_to_add, v_bucket.max_tokens);

  -- 6. Se abbiamo tokens, consuma uno
  IF v_new_tokens > 0 THEN
    UPDATE rate_limit_buckets
    SET 
      tokens = v_new_tokens - 1,
      last_refill_at = CASE 
        WHEN v_tokens_to_add > 0 THEN now() 
        ELSE last_refill_at 
      END
    WHERE source_id = p_source_id;
    
    RETURN TRUE;
  END IF;

  -- 7. Nessun token disponibile
  RETURN FALSE;
END;
$$;
```

---

## Correzione 2: deal_stage_history (Aggiunta in M2)

```sql
CREATE TABLE deal_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at TIMESTAMPTZ,
  changed_by_user_id UUID REFERENCES users(id),
  change_reason TEXT, -- 'manual', 'ai_classification', 'rule', etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index per query KPI aging
CREATE INDEX idx_deal_stage_history_entered 
ON deal_stage_history(entered_at DESC);

CREATE INDEX idx_deal_stage_history_deal 
ON deal_stage_history(deal_id);

-- Trigger per popolare automaticamente
CREATE OR REPLACE FUNCTION track_deal_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Chiudi record precedente
  IF OLD.current_stage_id IS NOT NULL AND OLD.current_stage_id != NEW.current_stage_id THEN
    UPDATE deal_stage_history
    SET exited_at = now()
    WHERE deal_id = NEW.id 
      AND stage_id = OLD.current_stage_id 
      AND exited_at IS NULL;
  END IF;
  
  -- Crea nuovo record
  IF NEW.current_stage_id IS NOT NULL AND 
     (OLD.current_stage_id IS NULL OR OLD.current_stage_id != NEW.current_stage_id) THEN
    INSERT INTO deal_stage_history (deal_id, stage_id, entered_at)
    VALUES (NEW.id, NEW.current_stage_id, now());
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_deal_stage_change
AFTER UPDATE OF current_stage_id ON deals
FOR EACH ROW
EXECUTE FUNCTION track_deal_stage_change();

-- Trigger per INSERT (primo stage)
CREATE TRIGGER trigger_deal_stage_insert
AFTER INSERT ON deals
FOR EACH ROW
WHEN (NEW.current_stage_id IS NOT NULL)
EXECUTE FUNCTION track_deal_stage_change();
```

---

## Correzione 3: Webhook brand_id Server-Side

Nel M1, il flusso webhook diventa:

```text
1. Client chiama POST /webhook-ingest/{sourceName}
   - Header: X-API-Key (obbligatorio)
   - Body: payload lead

2. Edge Function:
   a. Estrae sourceName da URL
   b. Cerca webhook_sources WHERE name = sourceName
   c. Valida X-API-Key contro api_key_hash
   d. DERIVA brand_id dalla webhook_source trovata
   e. Procede con rate limit, normalizzazione, etc.
   
3. brand_id MAI passato dal client, MAI letto dal body
```

```typescript
// Edge Function webhook-ingest/index.ts
async function handleWebhook(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sourceName = url.pathname.split('/').pop();
  const apiKey = req.headers.get('x-api-key');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing API key' }), { 
      status: 401, headers: corsHeaders 
    });
  }

  // Trova source e DERIVA brand_id (server-side only)
  const { data: source, error } = await supabaseAdmin
    .from('webhook_sources')
    .select('id, brand_id, api_key_hash, rate_limit_per_min, mapping, is_active')
    .eq('name', sourceName)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !source) {
    return new Response(JSON.stringify({ error: 'Unknown source' }), { 
      status: 404, headers: corsHeaders 
    });
  }

  // Valida API key
  const isValidKey = await verifyApiKey(apiKey, source.api_key_hash);
  if (!isValidKey) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), { 
      status: 401, headers: corsHeaders 
    });
  }

  // brand_id derivato, non passato dal client
  const brandId = source.brand_id;
  
  // Rate limit check
  const { data: hasToken } = await supabaseAdmin
    .rpc('consume_rate_limit_token', { p_source_id: source.id });
  
  if (!hasToken) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { 
      status: 429, headers: corsHeaders 
    });
  }

  // Procedi con ingest usando brandId derivato
  const body = await req.json();
  // ... rest of processing with brandId
}
```

---

## Correzione 4: Idempotency Key Semantica

```sql
-- Schema outbound_deliveries con idempotency chiarita
CREATE TABLE outbound_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id),
  endpoint_id UUID NOT NULL REFERENCES outbound_webhook_endpoints(id),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,      -- 'lead_event', 'deal', 'appointment', etc.
  entity_id UUID NOT NULL,
  entity_updated_at TIMESTAMPTZ,  -- per versionare
  payload JSONB NOT NULL,
  status delivery_status NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 12,
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  last_status_code INT,
  dead_letter_reason TEXT,
  idempotency_key TEXT NOT NULL,  -- calcolata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique su idempotency_key
  UNIQUE(idempotency_key)
);
```

```typescript
// Generazione idempotency key
function generateIdempotencyKey(
  endpointId: string,
  eventType: string,
  entityId: string,
  entityUpdatedAt: Date | null
): string {
  // Componenti della chiave
  const parts = [
    endpointId,
    eventType,
    entityId,
    entityUpdatedAt?.toISOString() ?? 'initial'
  ];
  
  // Hash SHA256 per compattezza
  const data = parts.join('|');
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
    .then(hash => Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''));
}

// Esempio uso
const idempotencyKey = await generateIdempotencyKey(
  endpoint.id,
  'lead_event_created',
  leadEvent.id,
  leadEvent.updated_at // se updated_at cambia, nuova delivery ok
);

// Insert con ON CONFLICT per idempotency
const { error } = await supabase
  .from('outbound_deliveries')
  .insert({
    endpoint_id: endpoint.id,
    event_type: 'lead_event_created',
    entity_type: 'lead_event',
    entity_id: leadEvent.id,
    entity_updated_at: leadEvent.updated_at,
    payload: buildPayload(leadEvent),
    idempotency_key: idempotencyKey,
    next_attempt_at: new Date()
  })
  .onConflict('idempotency_key')
  .ignore(); // Ignora se già esiste (idempotent)
```

**Semantica**:
- Stesso entity + stesso updated_at + stesso endpoint = stessa key = no duplicati
- Entity aggiornato (updated_at cambia) = nuova key = nuova delivery permessa
- Retry della stessa delivery = stessa key = nessun insert duplicato

---

## Correzione 5: assumed_country Flag

```typescript
interface NormalizedPhone {
  normalized: string;
  countryCode: string;
  assumedCountry: boolean;  // NUOVO
  raw: string;
}

function normalizePhone(phone: string, defaultCountry = 'IT'): NormalizedPhone {
  const raw = phone;
  let normalized = phone.replace(/\D/g, '');
  let countryCode = defaultCountry;
  let assumedCountry = true; // default: assumiamo il paese
  
  // Prefissi internazionali noti
  const prefixes: Record<string, string> = {
    '39': 'IT', '44': 'GB', '49': 'DE', '33': 'FR', 
    '34': 'ES', '41': 'CH', '43': 'AT', '1': 'US'
  };
  
  // Controlla prefissi (dal più lungo al più corto)
  const sortedPrefixes = Object.entries(prefixes)
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [prefix, country] of sortedPrefixes) {
    if (normalized.startsWith(prefix) && normalized.length > 10) {
      normalized = normalized.slice(prefix.length);
      countryCode = country;
      assumedCountry = false; // prefisso trovato, non assumiamo
      break;
    }
  }
  
  return { normalized, countryCode, assumedCountry, raw };
}

// Test cases
normalizePhone('+39 333 123 4567')  
// -> { normalized: '3331234567', countryCode: 'IT', assumedCountry: false }

normalizePhone('333 123 4567')      
// -> { normalized: '3331234567', countryCode: 'IT', assumedCountry: true }

normalizePhone('+44 7911 123456')   
// -> { normalized: '7911123456', countryCode: 'GB', assumedCountry: false }
```

```sql
-- Aggiorna contact_phones
ALTER TABLE contact_phones ADD COLUMN assumed_country BOOLEAN DEFAULT false;
```

---

## Correzione 6: Circuit Breaker State Persistente

```sql
-- Enum per circuit breaker states
CREATE TYPE circuit_breaker_state AS ENUM ('closed', 'open', 'half_open');

-- Tabella per tracciare health degli endpoint
CREATE TABLE endpoint_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES outbound_webhook_endpoints(id) ON DELETE CASCADE,
  state circuit_breaker_state NOT NULL DEFAULT 'closed',
  failure_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,  -- per half_open
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  open_until TIMESTAMPTZ,  -- quando riaprire (passare a half_open)
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(endpoint_id)
);

-- Funzione per verificare se endpoint è disponibile
CREATE OR REPLACE FUNCTION check_endpoint_available(p_endpoint_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_health RECORD;
BEGIN
  -- Upsert health record
  INSERT INTO endpoint_health (endpoint_id)
  VALUES (p_endpoint_id)
  ON CONFLICT (endpoint_id) DO NOTHING;
  
  SELECT state, open_until INTO v_health
  FROM endpoint_health
  WHERE endpoint_id = p_endpoint_id;
  
  -- Closed: sempre disponibile
  IF v_health.state = 'closed' THEN
    RETURN TRUE;
  END IF;
  
  -- Open: non disponibile, ma controlla se è ora di half_open
  IF v_health.state = 'open' THEN
    IF v_health.open_until IS NOT NULL AND now() >= v_health.open_until THEN
      -- Transizione a half_open
      UPDATE endpoint_health
      SET state = 'half_open', success_count = 0, updated_at = now()
      WHERE endpoint_id = p_endpoint_id;
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;
  
  -- Half_open: disponibile (per test)
  RETURN TRUE;
END;
$$;

-- Funzione per registrare risultato delivery
CREATE OR REPLACE FUNCTION record_delivery_result(
  p_endpoint_id UUID,
  p_success BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_health RECORD;
  v_failure_threshold INT := 5;
  v_success_threshold INT := 3;
  v_open_duration INTERVAL := '5 minutes';
BEGIN
  SELECT * INTO v_health
  FROM endpoint_health
  WHERE endpoint_id = p_endpoint_id
  FOR UPDATE;
  
  IF p_success THEN
    -- Successo
    IF v_health.state = 'half_open' THEN
      -- In half_open, conta successi
      UPDATE endpoint_health
      SET 
        success_count = success_count + 1,
        last_success_at = now(),
        updated_at = now(),
        -- Se raggiungiamo threshold, torna a closed
        state = CASE 
          WHEN success_count + 1 >= v_success_threshold THEN 'closed'::circuit_breaker_state
          ELSE state
        END,
        failure_count = CASE 
          WHEN success_count + 1 >= v_success_threshold THEN 0
          ELSE failure_count
        END
      WHERE endpoint_id = p_endpoint_id;
    ELSE
      -- In closed, resetta failure count
      UPDATE endpoint_health
      SET 
        failure_count = 0,
        last_success_at = now(),
        updated_at = now()
      WHERE endpoint_id = p_endpoint_id;
    END IF;
  ELSE
    -- Fallimento
    UPDATE endpoint_health
    SET 
      failure_count = failure_count + 1,
      last_failure_at = now(),
      updated_at = now(),
      -- Se raggiungiamo threshold, apri circuito
      state = CASE 
        WHEN failure_count + 1 >= v_failure_threshold THEN 'open'::circuit_breaker_state
        ELSE state
      END,
      open_until = CASE 
        WHEN failure_count + 1 >= v_failure_threshold THEN now() + v_open_duration
        ELSE open_until
      END
    WHERE endpoint_id = p_endpoint_id;
  END IF;
END;
$$;
```

```typescript
// Uso nel delivery worker
async function attemptDelivery(delivery: OutboundDelivery): Promise<void> {
  // 1. Controlla circuit breaker
  const { data: isAvailable } = await supabase
    .rpc('check_endpoint_available', { p_endpoint_id: delivery.endpoint_id });
  
  if (!isAvailable) {
    // Endpoint in stato "open", skippa e schedula retry
    await rescheduleDelivery(delivery, 'circuit_breaker_open');
    return;
  }
  
  try {
    // 2. Tenta delivery
    const response = await fetch(delivery.endpoint_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(delivery.payload),
      signal: AbortSignal.timeout(10000)
    });
    
    if (response.ok) {
      // 3a. Successo
      await supabase.rpc('record_delivery_result', { 
        p_endpoint_id: delivery.endpoint_id, 
        p_success: true 
      });
      await markDeliverySuccess(delivery);
    } else {
      // 3b. Errore HTTP
      await supabase.rpc('record_delivery_result', { 
        p_endpoint_id: delivery.endpoint_id, 
        p_success: false 
      });
      await handleDeliveryFailure(delivery, response.status, await response.text());
    }
  } catch (error) {
    // 3c. Network error / timeout
    await supabase.rpc('record_delivery_result', { 
      p_endpoint_id: delivery.endpoint_id, 
      p_success: false 
    });
    await handleDeliveryFailure(delivery, null, error.message);
  }
}
```

---

## Piano Milestone Aggiornato

### M0: Setup Fondamentale
- Attivazione Lovable Cloud
- Migrazioni: brands, users, user_roles
- RLS policies strict con brand isolation
- Layout base con BrandSelector obbligatorio
- Auth flow completo

### M1: Webhook Ingestion e Contatti
- Tabelle: contacts, contact_phones (con assumed_country), lead_events, incoming_requests, webhook_sources, rate_limit_buckets
- Edge Function webhook-ingest con:
  - brand_id derivato server-side
  - Rate limiting DB-based (token bucket corretto)
  - Normalizzazione telefono con assumed_country
- UI lista contatti

### M2: Deal e Pipeline
- Tabelle: deals, pipeline_stages, deal_stage_history (NUOVA)
- Trigger per tracking automatico stage changes
- Partial unique index per 1 deal open per contact
- Kanban board
- lead_events.deal_id collegamento esplicito

### M3: Tag Gerarchici
- Tabelle: tags, tag_assignments
- UI gestione e applicazione tag

### M4: AI Decision Service
- Edge Function con Lovable AI
- Fallback deterministico
- Versioning (ai_model_version, ai_prompt_version)

### M5: Ticketing Assistenza
- Tabella tickets con stati
- UI completa

### M6: Appuntamenti
- Tabella appointments
- Calendario e gestione slot

### M7: Vendite e KPI
- Tabella sales
- Dashboard con 14 KPI incluso deal aging (usando deal_stage_history)

### M8: Webhook Outbound
- Tabelle: outbound_webhook_endpoints, outbound_deliveries, endpoint_health
- Idempotency key con semantica chiara
- Circuit breaker persistente
- Retry con exponential backoff

### M9: Admin Dashboard
- Gestione completa configurazioni
- Logs e replay

### M10: Hardening
- GDPR, polish UI, test suite, docs

---

## Prossimi Passi

Pronto per iniziare M0:
1. Attivare Lovable Cloud
2. Creare migrazioni con schema corretto
3. Implementare auth + brand selection
4. RLS strict

