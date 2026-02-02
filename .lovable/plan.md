

# Piano Corretto: Meta Conversions API (CAPI) - Server-Side Events

## Correzioni Applicate (8/8)

| # | Issue | Correzione |
|---|-------|------------|
| 1 | Token in chiaro in DB | Token in secrets/env, DB salva solo `capi_token_key` (riferimento) |
| 2 | contact_tracking incompleto | Aggiunti `first_touch_source`, `last_touch_at` |
| 3 | GDPR mancante | `contacts.marketing_consent` + `consent_snapshot` in queue |
| 4 | event_id collisioni | UNIQUE (brand_id, event_id) + event da `lead_events` |
| 5 | Race condition | FOR UPDATE SKIP LOCKED + status `processing` |
| 6 | No batching | Raggruppamento per pixel_id, max 50 eventi/batch |
| 7 | test_event_code in prod | Solo se ENV !== 'production' |
| 8 | action_source fisso | Dinamico da `lead_events.source` |

---

## Decisione: Lead Event Trigger

**Scelto: `lead_events`** (come da piano originale)

Motivazione:
- È il point of truth per ogni interazione lead
- Ha già `source` per determinare `action_source`
- Evita falsi positivi (contatti senza lead event reale)
- Supporta future estensioni (eventi multipli per contatto)

---

## Fase 1: Migrazioni Database

### 1.1 Estensione `contacts` - Consenso GDPR

```sql
ALTER TABLE contacts ADD COLUMN marketing_consent BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN marketing_consent_at TIMESTAMPTZ;
```

### 1.2 Tabella `contact_tracking`

```text
┌─────────────────────────────────────────────────────────────┐
│                    contact_tracking                         │
├─────────────────────────────────────────────────────────────┤
│ id                    UUID PK                               │
│ brand_id              UUID FK                               │
│ contact_id            UUID FK UNIQUE (1:1 con contacts)     │
│ fbp                   TEXT                                  │
│ fbc                   TEXT                                  │
│ gclid                 TEXT                                  │
│ wbraid                TEXT                                  │
│ gbraid                TEXT                                  │
│ utm_source            TEXT                                  │
│ utm_medium            TEXT                                  │
│ utm_campaign          TEXT                                  │
│ utm_content           TEXT                                  │
│ utm_term              TEXT                                  │
│ client_ip             TEXT                                  │
│ client_user_agent     TEXT                                  │
│ first_touch_source    TEXT (webhook-ingest|meta-leads|ui)   │  ← NUOVO
│ first_touch_at        TIMESTAMPTZ                           │
│ last_touch_at         TIMESTAMPTZ                           │  ← NUOVO
│ created_at            TIMESTAMPTZ                           │
│ updated_at            TIMESTAMPTZ                           │
└─────────────────────────────────────────────────────────────┘
```

**RLS**: Stesse policy di contacts (`user_belongs_to_brand`)

### 1.3 Estensione `meta_apps` - CAPI Config

```sql
-- NO token in chiaro, solo riferimento a secret
ALTER TABLE meta_apps ADD COLUMN pixel_id TEXT;
ALTER TABLE meta_apps ADD COLUMN capi_token_key TEXT;        -- Nome secret (es. META_CAPI_TOKEN_BRAND1)
ALTER TABLE meta_apps ADD COLUMN capi_enabled BOOLEAN DEFAULT false;
ALTER TABLE meta_apps ADD COLUMN capi_test_event_code TEXT;  -- Solo per test
```

Il token CAPI viene letto da:
- `Deno.env.get(meta_apps.capi_token_key)` nell'edge function

### 1.4 Tabella `meta_capi_event_queue`

```text
┌─────────────────────────────────────────────────────────────┐
│                  meta_capi_event_queue                      │
├─────────────────────────────────────────────────────────────┤
│ id                    UUID PK                               │
│ brand_id              UUID FK                               │
│ meta_app_id           UUID FK                               │
│ event_name            TEXT (Lead, Purchase, etc)            │
│ event_id              TEXT                                  │
│ event_time            TIMESTAMPTZ                           │
│ action_source         TEXT (website|system_generated)       │  ← Dinamico
│ user_data             JSONB                                 │
│ custom_data           JSONB                                 │
│ contact_id            UUID FK                               │
│ deal_id               UUID FK (nullable)                    │
│ lead_event_id         UUID FK (nullable)                    │
│ consent_snapshot      BOOLEAN                               │  ← GDPR audit
│ status                meta_capi_status ENUM                 │
│ processing_at         TIMESTAMPTZ                           │  ← Lock
│ processing_by         TEXT                                  │  ← Request ID
│ attempts              INTEGER DEFAULT 0                     │
│ max_attempts          INTEGER DEFAULT 3                     │
│ last_error            TEXT                                  │
│ sent_at               TIMESTAMPTZ                           │
│ created_at            TIMESTAMPTZ                           │
├─────────────────────────────────────────────────────────────┤
│ UNIQUE (brand_id, event_id)                                 │  ← FIX #4
│ INDEX (status, created_at) WHERE status IN (pending, retry) │
│ INDEX (brand_id, event_name, created_at)                    │
└─────────────────────────────────────────────────────────────┘
```

**ENUM meta_capi_status:**
```sql
CREATE TYPE meta_capi_status AS ENUM (
  'pending',
  'processing',  -- Lock attivo
  'sent',
  'failed',
  'skipped'      -- No consent o altri skip
);
```

### 1.5 Trigger: Queue Lead Event

```sql
CREATE FUNCTION queue_capi_lead_event() RETURNS TRIGGER AS $$
DECLARE
  v_meta_app RECORD;
  v_consent BOOLEAN;
  v_action_source TEXT;
BEGIN
  -- Solo se contact_id presente
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Trova meta_app con CAPI abilitato per questo brand
  SELECT id, pixel_id INTO v_meta_app
  FROM meta_apps
  WHERE brand_id = NEW.brand_id
    AND capi_enabled = true
    AND pixel_id IS NOT NULL
  LIMIT 1;

  IF v_meta_app.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verifica consenso
  SELECT marketing_consent INTO v_consent
  FROM contacts WHERE id = NEW.contact_id;

  -- Determina action_source da lead_events.source
  v_action_source := CASE
    WHEN NEW.source = 'manual' THEN 'system_generated'
    ELSE 'website'
  END;

  INSERT INTO meta_capi_event_queue (
    brand_id, meta_app_id, event_name, event_id,
    event_time, action_source, contact_id, deal_id, lead_event_id,
    consent_snapshot, status
  ) VALUES (
    NEW.brand_id, v_meta_app.id, 'Lead',
    'lead_' || NEW.id,  -- event_id = lead_{lead_event_id}
    NEW.occurred_at, v_action_source, NEW.contact_id, NEW.deal_id, NEW.id,
    COALESCE(v_consent, false),
    CASE WHEN v_consent = true THEN 'pending' ELSE 'skipped' END
  )
  ON CONFLICT (brand_id, event_id) DO NOTHING;  -- Dedup

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_queue_capi_lead
AFTER INSERT ON lead_events
FOR EACH ROW EXECUTE FUNCTION queue_capi_lead_event();
```

### 1.6 Trigger: Queue Purchase Event (Deal Won)

```sql
CREATE FUNCTION queue_capi_purchase_event() RETURNS TRIGGER AS $$
DECLARE
  v_meta_app RECORD;
  v_consent BOOLEAN;
BEGIN
  -- Solo quando status cambia a 'won'
  IF NEW.status != 'won' OR (OLD.status IS NOT NULL AND OLD.status = 'won') THEN
    RETURN NEW;
  END IF;

  -- Trova meta_app con CAPI abilitato
  SELECT id, pixel_id INTO v_meta_app
  FROM meta_apps
  WHERE brand_id = NEW.brand_id
    AND capi_enabled = true
    AND pixel_id IS NOT NULL
  LIMIT 1;

  IF v_meta_app.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verifica consenso
  SELECT marketing_consent INTO v_consent
  FROM contacts WHERE id = NEW.contact_id;

  INSERT INTO meta_capi_event_queue (
    brand_id, meta_app_id, event_name, event_id,
    event_time, action_source, contact_id, deal_id,
    consent_snapshot, status
  ) VALUES (
    NEW.brand_id, v_meta_app.id, 'Purchase',
    'purchase_' || NEW.id,
    COALESCE(NEW.closed_at, NOW()),
    'system_generated',  -- Deal won = sempre system_generated
    NEW.contact_id, NEW.id,
    COALESCE(v_consent, false),
    CASE WHEN v_consent = true THEN 'pending' ELSE 'skipped' END
  )
  ON CONFLICT (brand_id, event_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_queue_capi_purchase
AFTER UPDATE ON deals
FOR EACH ROW EXECUTE FUNCTION queue_capi_purchase_event();
```

---

## Fase 2: Edge Function `capi-event-sender`

### Architettura

```text
┌─────────────────────────────────────────────────────────────┐
│                   capi-event-sender                         │
├─────────────────────────────────────────────────────────────┤
│ 1. Verifica CRON_SECRET                                     │
│ 2. Claim atomico con FOR UPDATE SKIP LOCKED                 │
│ 3. Raggruppa eventi per pixel_id                            │
│ 4. Per ogni pixel:                                          │
│    a. Leggi token da env (capi_token_key)                   │
│    b. Arricchisci user_data da contacts + tracking          │
│    c. Hash SHA-256 (em, ph, fn, ln, ct, zp)                 │
│    d. POST batch a Meta CAPI                                │
│    e. Update status bulk                                    │
│ 5. Gestione retry con backoff                               │
└─────────────────────────────────────────────────────────────┘
```

### Claim Atomico (Fix #5)

```sql
-- RPC: claim_capi_events
CREATE FUNCTION claim_capi_events(
  p_limit INTEGER DEFAULT 50,
  p_processing_by TEXT DEFAULT NULL
) RETURNS SETOF meta_capi_event_queue AS $$
BEGIN
  RETURN QUERY
  UPDATE meta_capi_event_queue
  SET 
    status = 'processing',
    processing_at = NOW(),
    processing_by = COALESCE(p_processing_by, gen_random_uuid()::text)
  WHERE id IN (
    SELECT id FROM meta_capi_event_queue
    WHERE status = 'pending'
      AND attempts < max_attempts
      AND consent_snapshot = true  -- Solo con consenso
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;
```

### Batching per Pixel (Fix #6)

```typescript
// Raggruppa eventi per pixel_id
const eventsByPixel = new Map<string, CapiEvent[]>();
for (const event of claimedEvents) {
  const key = event.meta_app_id;
  if (!eventsByPixel.has(key)) {
    eventsByPixel.set(key, []);
  }
  eventsByPixel.get(key)!.push(event);
}

// Invia batch per ogni pixel
for (const [metaAppId, events] of eventsByPixel) {
  const metaApp = metaApps.find(a => a.id === metaAppId);
  const token = Deno.env.get(metaApp.capi_token_key);
  
  if (!token) {
    console.error(`Missing token for ${metaApp.capi_token_key}`);
    // Mark as failed
    continue;
  }
  
  const payload = {
    data: events.map(e => buildCapiPayload(e, contacts, tracking)),
    // Solo in non-production
    ...(Deno.env.get("ENVIRONMENT") !== "production" && metaApp.capi_test_event_code 
        ? { test_event_code: metaApp.capi_test_event_code } 
        : {})
  };
  
  await fetch(`https://graph.facebook.com/v20.0/${metaApp.pixel_id}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, access_token: token })
  });
}
```

### Hashing SHA-256

```typescript
async function sha256(value: string): Promise<string> {
  const normalized = value.toLowerCase().trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildUserData(contact, tracking) {
  return {
    em: contact.email ? [await sha256(contact.email)] : undefined,
    ph: contact.phone ? [await sha256(contact.phone)] : undefined,
    fn: contact.first_name ? [await sha256(contact.first_name)] : undefined,
    ln: contact.last_name ? [await sha256(contact.last_name)] : undefined,
    ct: contact.city ? [await sha256(contact.city)] : undefined,
    zp: contact.cap ? [await sha256(contact.cap)] : undefined,
    country: ["it"],
    // Non hashati
    fbp: tracking?.fbp,
    fbc: tracking?.fbc,
    client_ip_address: tracking?.client_ip,
    client_user_agent: tracking?.client_user_agent,
  };
}
```

---

## Fase 3: Modifiche Ingest

### 3.1 webhook-ingest

Estrarre e salvare tracking params nel payload:

```typescript
// Estrai tracking params
const trackingParams = {
  fbp: rawBody._fbp || rawBody.fbp,
  fbc: rawBody._fbc || rawBody.fbc,
  gclid: rawBody.gclid,
  wbraid: rawBody.wbraid,
  gbraid: rawBody.gbraid,
  utm_source: rawBody.utm_source,
  utm_medium: rawBody.utm_medium,
  utm_campaign: rawBody.utm_campaign,
  utm_content: rawBody.utm_content,
  utm_term: rawBody.utm_term,
};

// Dopo contact creation, upsert tracking
if (contactId && hasAnyTracking(trackingParams)) {
  await supabase.from("contact_tracking").upsert({
    brand_id: brandId,
    contact_id: contactId,
    ...trackingParams,
    client_ip: ipAddress,
    client_user_agent: userAgent,
    first_touch_source: "webhook-ingest",
    first_touch_at: new Date().toISOString(),
  }, { onConflict: "contact_id" });
}
```

### 3.2 meta-leads-webhook

```typescript
// Meta non passa direttamente fbp/fbc, ma salviamo campaign_id per attribution
const trackingParams = {
  utm_source: "meta",
  utm_medium: "paid",
  utm_campaign: leadData?.campaign_name,
};

// Upsert tracking
await supabase.from("contact_tracking").upsert({
  brand_id: metaApp.brand_id,
  contact_id: contactId,
  ...trackingParams,
  first_touch_source: "meta-leads-webhook",
  first_touch_at: new Date().toISOString(),
}, { onConflict: "contact_id" });
```

---

## Fase 4: UI Settings

### 4.1 Estensione MetaAppFormDrawer

Nuova sezione "Conversions API":

```text
┌─────────────────────────────────────────────────────────────┐
│  🔄 Conversions API (CAPI)                                  │
├─────────────────────────────────────────────────────────────┤
│  Pixel ID            [_________________]                    │
│  Token Secret Key    [_________________] (nome variabile)   │
│                      ⓘ Es: META_CAPI_TOKEN_BRAND1           │
│  ☑ Abilita invio eventi CAPI                                │
│                                                             │
│  Test Event Code     [_________________] (solo sviluppo)    │
│                                                             │
│  ⓘ Gli eventi vengono inviati solo per contatti con        │
│    consenso marketing attivo.                               │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Consenso Marketing in ContactDetailSheet

Aggiungere toggle "Consenso Marketing" nella scheda contatto.

---

## Fase 5: Secrets da Configurare

Per ogni brand che usa CAPI:

```
META_CAPI_TOKEN_<BRAND_SLUG> = "EAA..."
```

Esempio:
- Brand "clinica-milano" → `META_CAPI_TOKEN_CLINICA_MILANO`
- In `meta_apps.capi_token_key` = `"META_CAPI_TOKEN_CLINICA_MILANO"`

---

## File da Creare

| File | Descrizione |
|------|-------------|
| `supabase/functions/capi-event-sender/index.ts` | Edge function dispatcher |
| `src/hooks/useCapiEvents.ts` | Hook analytics CAPI |
| `src/types/capi.ts` | Tipi TypeScript |

## File da Modificare

| File | Modifica |
|------|----------|
| `supabase/functions/webhook-ingest/index.ts` | Estrarre tracking params |
| `supabase/functions/meta-leads-webhook/index.ts` | Salvare UTM/campaign_id |
| `src/components/settings/meta/MetaAppFormDrawer.tsx` | Campi CAPI |
| `src/components/contacts/ContactDetailSheet.tsx` | Toggle consenso |
| `src/hooks/useMetaApps.ts` | Tipi CAPI |
| `supabase/config.toml` | Function capi-event-sender |

---

## Ordine di Implementazione

1. **Migrazione DB**
   - `contacts.marketing_consent` + `marketing_consent_at`
   - `contact_tracking` con tutti i campi
   - `meta_apps` campi CAPI (pixel_id, capi_token_key, capi_enabled)
   - `meta_capi_event_queue` con UNIQUE (brand_id, event_id)
   - RPC `claim_capi_events` con FOR UPDATE SKIP LOCKED
   - Trigger su `lead_events` e `deals`

2. **Edge Function `capi-event-sender`**
   - Claim atomico
   - Batch per pixel
   - Hash SHA-256
   - Retry con backoff
   - Protezione CRON_SECRET

3. **Modifiche ingest**
   - webhook-ingest: estrazione tracking
   - meta-leads-webhook: UTM/campaign

4. **UI Settings**
   - Form CAPI in MetaAppFormDrawer
   - Toggle consenso in ContactDetailSheet

5. **Test QA**
   - 3 eventi Lead + 1 Purchase
   - Dedup stesso event_id
   - Skip senza consenso
   - Batch multi-pixel

---

## Note Tecniche Finali

- **Token sicuri**: Mai in DB, sempre in env/secrets
- **Claim atomico**: FOR UPDATE SKIP LOCKED previene doppi invii
- **Batch**: Max 50 eventi per run, raggruppati per pixel
- **GDPR**: consent_snapshot per audit, skip se false
- **test_event_code**: Solo in ENV !== 'production'
- **action_source**: Dinamico da source (website vs system_generated)
- **Retry**: Max 3 tentativi con backoff esponenziale

