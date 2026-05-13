# Meta Lead Ads Integration (M10)

## Overview

Integrazione enterprise per ricevere lead da Facebook e Instagram Lead Ads in tempo reale. Supporta multi-brand, deduplicazione, e validazione HMAC.

---

## Architettura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Meta Platform  │────▶│ meta-leads-     │────▶│  meta_lead_     │
│  (Leadgen Event)│     │ webhook/:slug   │     │  events         │
└─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                 │                       │
                                 ▼                       ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │  Graph API      │     │  contacts       │
                        │  (Fetch Lead)   │     │  deals          │
                        └─────────────────┘     │  lead_events    │
                                                └─────────────────┘
```

---

## Quick Start

### 1. Crea System User in Meta Business Manager

1. Vai su [Meta Business Settings](https://business.facebook.com/settings/system-users)
2. Clicca **"Aggiungi"** → Tipo: **Admin**
3. Assegna la **Pagina Facebook** come asset con "Controllo completo"
4. Assegna la **Meta App** come asset

### 2. Genera Access Token

1. Clicca sul System User
2. **"Genera nuovo token"**
3. Seleziona i permessi richiesti:
   - `pages_manage_ads`
   - `leads_retrieval`
   - `pages_read_engagement`
   - `pages_show_list`
4. **Copia e salva** il token (non scade)

### 3. Configura in CRM

1. **Settings → Meta Lead Ads**
2. Clicca **"Aggiungi Meta App"**
3. Compila:

| Campo | Descrizione | Esempio |
|-------|-------------|---------|
| Brand | Brand associato | Excell |
| Brand Slug | Slug unico per URL | `excell-main` |
| App Secret | Da Meta Developer Console | `abc123...` |
| Page ID | ID numerico pagina | `123456789` |
| Access Token | Token System User | `EAAG...` |

4. Clicca **"Salva"**
5. Clicca **🔗 Sottoscrivi Pagina** per attivare i webhook

### 4. Configura Webhook in Meta

1. Vai su [Meta Developer Console](https://developers.facebook.com/apps)
2. Seleziona la tua App → **Webhooks**
3. Clicca **"Aggiungi sottoscrizione"** → **Page**
4. Campo **leadgen**
5. Inserisci:
   - **Callback URL**: `https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/meta-leads-webhook/{brand-slug}`
   - **Verify Token**: quello generato dalla CRM UI

---

## Endpoint

```
POST /functions/v1/meta-leads-webhook/:brandSlug
GET  /functions/v1/meta-leads-webhook/:brandSlug  (verification)
```

### Verification (GET)

Meta invia una richiesta GET per verificare il webhook:

```
GET /meta-leads-webhook/excell-main?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=123
```

Risposta: il valore di `hub.challenge` se il token è valido.

### Lead Event (POST)

```json
{
  "object": "page",
  "entry": [{
    "id": "123456789",
    "time": 1234567890,
    "changes": [{
      "field": "leadgen",
      "value": {
        "leadgen_id": "9876543210",
        "page_id": "123456789",
        "form_id": "111222333",
        "ad_id": "444555666",
        "created_time": 1234567890
      }
    }]
  }]
}
```

---

## Flusso di Processing

```
1. Webhook ricevuto
   ├── Verifica HMAC signature (X-Hub-Signature-256)
   ├── Lookup brand_slug → meta_app config
   └── Valida page_id match

2. Staging in meta_lead_events
   ├── status: 'received'
   └── Deduplicazione per (brand_id, leadgen_id)

3. Fetch Lead Data via Graph API
   ├── GET /v20.0/{leadgen_id}?access_token=...
   └── Estrai: email, phone, first_name, last_name, etc.

4. Mapping & Creation
   ├── Normalizza telefono
   ├── Crea/aggiorna Contact (dedup per phone)
   ├── Crea Deal in primo stage
   └── Crea lead_event

5. Update status
   └── meta_lead_events.status = 'processed'
```

---

## Tabella: meta_apps

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `brand_id` | UUID | FK a brands |
| `brand_slug` | text | Slug unico per URL webhook |
| `verify_token` | text | Token per verification Meta |
| `app_secret` | text | Secret per HMAC |
| `page_id` | text | ID pagina Facebook |
| `access_token` | text | System User Token |
| `is_active` | boolean | Abilita/disabilita |

---

## Tabella: meta_lead_events

Staging table per audit e retry:

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `brand_id` | UUID | FK a brands |
| `source_id` | UUID | FK a meta_apps |
| `leadgen_id` | text | ID lead Meta (unique per brand) |
| `page_id` | text | ID pagina |
| `form_id` | text | ID form (opzionale) |
| `campaign_id` | text | ID campagna |
| `ad_id` | text | ID ad |
| `raw_event` | jsonb | Payload originale |
| `fetched_payload` | jsonb | Dati fetchati da Graph API |
| `status` | enum | `received`, `fetched`, `processed`, `failed` |
| `error` | text | Messaggio errore (se failed) |
| `contact_id` | UUID | FK a contacts (dopo processing) |
| `lead_event_id` | UUID | FK a lead_events (dopo processing) |

---

## HMAC Signature Verification

Meta firma ogni richiesta con `X-Hub-Signature-256`:

```
X-Hub-Signature-256: sha256=<hex>
```

Calcolo:
```javascript
const expectedSignature = crypto
  .createHmac('sha256', appSecret)
  .update(rawBody)
  .digest('hex');
```

---

## Test Lead

### Creare un Lead di Test

1. Vai su **Settings → Meta Lead Ads**
2. Trova la Meta App
3. Clicca **⚡ Test Lead**

La funzione:
1. Elimina automaticamente lead di test esistenti (API Graph)
2. Crea un nuovo lead di test
3. Il webhook viene triggerato normalmente

### Gestione Phone Dummy

Meta usa placeholder per telefoni test: `<test lead: phone_number>`

Il sistema genera automaticamente numeri validi:
- Prefisso: `3331234`
- Suffisso: ultimi 3 cifre del leadgen_id

---

## Permessi Token Richiesti

| Permesso | Scopo |
|----------|-------|
| `pages_manage_ads` | Gestire sottoscrizioni webhook |
| `leads_retrieval` | Fetch dati lead da Graph API |
| `pages_read_engagement` | Leggere info pagina |
| `pages_show_list` | Listare pagine accessibili |

### Verificare Permessi

```bash
curl "https://graph.facebook.com/me/permissions?access_token=YOUR_TOKEN"
```

---

## Troubleshooting

### "Invalid token" o "Missing permissions"

**Causa**: Token non è un Page Access Token o manca `pages_manage_ads`.

**Soluzione**:
1. Usa un **System User Access Token**
2. Assegna la Pagina al System User con "Controllo completo"
3. Genera token con tutti i permessi richiesti

### Lead non arrivano

**Cause possibili**:
1. Webhook non verificato
2. Page non sottoscritta
3. Meta App inattiva

**Soluzione**:
1. Controlla la configurazione webhook in Meta Developer
2. Clicca "🔗 Sottoscrivi Pagina" nella UI
3. Verifica `is_active = true`

### "Signature mismatch"

**Causa**: App Secret errato.

**Soluzione**:
1. Verifica l'App Secret nella console Meta Developer
2. Aggiorna nella CRM

### Lead duplicati

**Non dovrebbe succedere**: Il sistema deduplicata per `(brand_id, leadgen_id)`.

Se succede, verifica:
```sql
SELECT leadgen_id, COUNT(*) 
FROM meta_lead_events 
WHERE brand_id = 'xxx' 
GROUP BY leadgen_id 
HAVING COUNT(*) > 1;
```

---

## Security Best Practices

1. **System User Token**: Non scade mai (vs 60 giorni user token)
2. **Minimo privilegio**: Assegna solo asset necessari al System User
3. **HMAC always on**: Mai disabilitare signature verification
4. **Log audit**: Tutti gli eventi in `meta_lead_events` per forensics
5. **Rotate secrets**: Se compromesso, rigenera App Secret

---

## Rate Limits

Meta Graph API:
- 200 chiamate / ora / utente
- 4800 chiamate / 24h / app

Il sistema gestisce automaticamente:
- Retry su rate limit
- Logging errori in `meta_lead_events.error`

---

## Backfill storico (Stream 4)

Per recuperare lead già esistenti su Meta non ricevuti via webhook in tempo reale,
vedi il runbook dedicato: [`docs/meta-leads-backfill-runbook.md`](./meta-leads-backfill-runbook.md)
o consulta il tab **Meta Backfill** in `/admin/changelog`.

UI: `Settings → Meta Lead Ads → icona 🕘 sulla riga della Meta App`.
Edge function: `meta-leads-backfill` (chained con `meta-leads-recover`).
Audit table: `meta_leads_backfill_runs`.
