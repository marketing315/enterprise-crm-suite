# Google Forms → CRM Webhook (Guida Utente)

Questa guida spiega come collegare un **Google Form** al CRM per creare automaticamente lead/contatti a ogni nuova risposta.

> ⚙️ Tempo richiesto: ~10 minuti
> 🔐 Permessi necessari: account Google con accesso al Form, ruolo Admin/Brand Admin nel CRM

---

## 1. Crea la sorgente nel CRM

1. Vai su **Impostazioni → Sorgenti Inbound** (`/settings/inbound-sources`).
2. Clicca **+ Nuova sorgente**.
3. Compila:
   - **Nome**: es. `Google Form — Richiesta Consulenza`
   - **Tipo**: `Generic Webhook`
   - **Pipeline di destinazione**: stage iniziale (es. *Nuovo Lead*)
   - **Conta come nuovo lead**: ✅ (tipicamente sì)
4. Salva. Otterrai due valori da copiare:
   - **Source ID** (UUID, es. `aaaa1111-...`)
   - **API Key** (es. `gforms_xxxxx`)

---

## 2. Configura il mapping campi

Il webhook accetta qualunque struttura JSON, ma deve sapere **quali campi del form** corrispondono ai campi standard del CRM.

Esempio: se il tuo form ha le domande `Nome`, `Telefono`, `Email`, configura nel pannello **Mapping**:

```json
{
  "first_name": "Nome",
  "phone": "Telefono",
  "email": "Email",
  "city": "Città"
}
```

> ⚠️ **Telefono obbligatorio**: senza un campo telefono valido la sorgente rifiuterà la richiesta con errore `400 Phone number is required`.

---

## 3. (Opzionale) Schema validation

Per bloccare risposte malformate **prima** che consumino quota, configura uno schema sulla sorgente:

```json
{
  "required": ["phone", "email"],
  "fields": {
    "phone": { "type": "phone" },
    "email": { "type": "email" },
    "first_name": { "type": "string", "max_length": 100 }
  },
  "strict": false
}
```

Le richieste non conformi torneranno **HTTP 422** con dettaglio degli errori.

---

## 4. Collega Google Form via Apps Script

Google Forms non invia webhook nativi: serve un breve script.

1. Apri il tuo Form → ⋮ → **Editor di script** (oppure dal Google Sheet collegato: *Estensioni → Apps Script*).
2. Incolla lo snippet seguente, sostituendo `SOURCE_ID` e `API_KEY`:

```javascript
const WEBHOOK_URL = 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/webhook-ingest/SOURCE_ID';
const API_KEY = 'API_KEY';

function onFormSubmit(e) {
  const responses = e.namedValues;
  // Trasforma { "Nome": ["Mario"], ... } in { "Nome": "Mario", ... }
  const payload = {};
  Object.keys(responses).forEach(k => payload[k] = responses[k][0]);

  // Autenticazione via body field (alternativa all'header X-API-Key)
  payload.google_key = API_KEY;

  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}
```

3. **Trigger**: ⏰ icona orologio → **+ Aggiungi trigger**
   - Funzione: `onFormSubmit`
   - Evento: *Dall'invio del modulo*
4. Autorizza lo script quando richiesto.

> 💡 **Perché `google_key` nel body?** Apps Script non permette di personalizzare facilmente gli header su tutti gli ambienti. Il CRM accetta l'API key in 3 modi: header `X-API-Key`, query `?api_key=`, oppure campo body `google_key`.

### 4.b (Alternativa) — URL "completo con chiave" via query string

Se preferisci evitare di toccare il payload, copia dal drawer della sorgente l'**URL completo con chiave** (sezione mostrata subito dopo la creazione) e usalo così:

```javascript
// L'API key è già nell'URL come ?api_key=...
const WEBHOOK_URL = 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/webhook-ingest/SOURCE_ID?api_key=API_KEY';

function onFormSubmit(e) {
  const payload = {};
  Object.keys(e.namedValues).forEach(k => payload[k] = e.namedValues[k][0]);

  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}
```

Vantaggi: nessun campo `google_key` da iniettare, payload puro. Svantaggio: l'URL contiene la chiave — non condividerlo in log pubblici.

---

## 5. Test end-to-end

1. Compila una risposta di prova nel form.
2. Vai su **Impostazioni → Sorgenti Inbound → [la tua sorgente] → Log**.
3. Verifica:
   - ✅ Status `200` con `contact_id` restituito
   - ❌ Se `401`: API Key errata
   - ❌ Se `400`: telefono mancante o malformato
   - ❌ Se `422`: payload non rispetta lo schema configurato
   - ❌ Se `409`: richiesta duplicata (entro la replay window)

Il contatto creato apparirà in **Contatti** entro pochi secondi (Realtime).

---

## 6. Risoluzione problemi

| Sintomo | Causa probabile | Azione |
|---|---|---|
| Nessun contatto creato | Trigger non attivo | Riapri Apps Script → Trigger |
| Errore 401 ripetuto | API Key non aggiornata | Rigenera dalla sorgente, aggiorna script |
| Telefoni duplicati separati | Formati incoerenti | Verifica normalizzazione (`+39` opzionale) |
| Richieste duplicate (409) | Retry di Apps Script | Comportamento atteso, idempotenza garantita |

---

## 7. Sicurezza

- L'API Key è equivalente a una password: non condividerla.
- Per integrazioni più sensibili, attiva **HMAC SHA-256** sulla sorgente e firma le richieste (vedi `docs/inbound-webhooks.md` §HMAC).
- Tutti gli accessi sono tracciati in `/admin/audit` con IP attribution.

---

📚 **Vedi anche**: [`docs/inbound-webhooks.md`](./inbound-webhooks.md) per la reference tecnica completa, schema validation e HMAC.
