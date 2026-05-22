# Integrazione VOIspeed v4

## Panoramica

L'integrazione VOIspeed v4 permette:
- **Click-to-Call reale**: il tasto "Chiama" nel CRM fa squillare l'interno dell'operatore e poi chiama il cliente
- **Log chiamate automatico**: tutte le chiamate (inbound/outbound) sono tracciate in `call_logs`
- **Screen-pop**: quando arriva una chiamata, si apre automaticamente la scheda contatto/deal

## Architettura

```
┌─────────────────┐      ┌──────────────────────┐      ┌─────────────────┐
│   CRM Frontend  │──────│  voispeed-call-req   │──────│   VOIspeed PBX  │
│  ClickToCall    │      │   (Edge Function)    │      │   SERI API      │
└─────────────────┘      └──────────────────────┘      └─────────────────┘
                                                              │
                                                              ▼
┌─────────────────┐      ┌──────────────────────┐      ┌─────────────────┐
│ IncomingCallPop │◀─────│ voispeed-events-wh   │◀─────│ VOIspeed Events │
│   (Realtime)    │      │   (Edge Function)    │      │  (Webhook)      │
└─────────────────┘      └──────────────────────┘      └─────────────────┘
```

## Configurazione

### 1. Configurazione Brand (Admin/CEO)

Vai in **Impostazioni → VoIP → VOIspeed v4** e configura:

| Campo | Descrizione | Esempio |
|-------|-------------|---------|
| URL SERI | Endpoint API VOIspeed | `https://pbx.azienda.it/PBX/seri.php` |
| Token | Token del modulo integrazione | `abc123...` |
| Dominio | (Opzionale) License ID | `azienda.voispeed.it` |

### 2. Configurazione Utenti

Ogni operatore deve avere il proprio **interno VOIspeed** configurato.

Campo: `users.voispeed_ext`

Esempio: Se l'operatore ha interno `201` su VOIspeed, inserire `201` nel campo.

> **Nota**: Gli admin possono modificare questo campo dalla gestione utenti.

### 3. Configurazione Webhook su VOIspeed

Configura VOIspeed per inviare eventi al nostro endpoint:

```
URL: https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/voispeed-events-webhook
Metodo: GET (querystring)
```

Eventi supportati:
- `incoming_call` - Chiamata in arrivo
- `outgoing_call` - Chiamata in uscita
- `call_answered` - Chiamata risposta
- `call_disconnect_in` / `call_disconnect_out` - Fine chiamata
- `lost_call` - Chiamata persa
- `cmd_failed` - Comando fallito

## Tabelle Database

### `voispeed_configs`
Configurazione VOIspeed per brand.

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| brand_id | UUID | FK a brands |
| base_url | TEXT | URL endpoint SERI |
| token | TEXT | Token integrazione |
| domain | TEXT | Dominio/License opzionale |
| enabled | BOOL | Attivo/Disattivo |

### `call_logs` (esteso)
Nuove colonne per VOIspeed:

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| provider | TEXT | `tel` o `voispeed` |
| provider_call_id | TEXT | `usercallid` VOIspeed |
| provider_ext_id | TEXT | `extid` per riconciliazione |
| last_error | TEXT | Errore se fallita |

### `incoming_calls`
Tabella per screen-pop realtime.

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| user_id | UUID | Utente che riceve la chiamata |
| contact_id | UUID | Contatto se trovato |
| deal_id | UUID | Deal aperto se presente |
| phone_number | TEXT | Numero chiamante |
| status | TEXT | ringing/answered/dismissed/missed |

## Flusso Click-to-Call

1. Utente clicca "Chiama" su contatto/deal
2. Frontend chiama `voispeed-call-request` edge function
3. Edge function:
   - Verifica `voispeed_ext` dell'utente
   - Legge config VOIspeed del brand
   - Crea record in `call_logs` con status `initiated`
   - Chiama SERI API: `service=call_request&ext=201&number=+39...&extid=calllog_xxx`
   - Aggiorna status a `ringing`
4. VOIspeed fa squillare l'interno dell'operatore
5. Quando risponde, VOIspeed chiama il numero cliente
6. Eventi VOIspeed aggiornano `call_logs` via webhook

## Flusso Chiamata in Arrivo (Screen-pop)

1. Chiamata arriva al centralino VOIspeed
2. VOIspeed invia evento `incoming_call` al webhook
3. Edge function:
   - Trova utente per `ext`
   - Trova contatto per numero telefono
   - Crea record in `incoming_calls`
   - Crea record in `call_logs`
4. Frontend riceve evento realtime su `incoming_calls`
5. Si apre popup con info contatto e azioni:
   - Apri Contatto
   - Apri Trattativa
   - Crea Ticket
   - Crea Nuovo Contatto (se non in rubrica)

## Fallback

Se VOIspeed non è configurato o l'utente non ha interno:
- Il pulsante "Chiama" usa il protocollo `tel:` standard
- La chiamata viene comunque tracciata in `call_logs`
- L'utente deve manualmente indicare l'esito

## Troubleshooting

### "Interno VOIspeed non configurato"
L'utente non ha `voispeed_ext` impostato. Contattare l'admin.

### "VOIspeed non configurato per questo brand"
Manca la configurazione in Impostazioni → VoIP.

### Chiamata non parte
1. Verificare URL SERI corretto
2. Verificare token valido
3. Controllare logs edge function
4. Verificare che l'interno esista su VOIspeed

### Screen-pop non funziona
1. Verificare configurazione webhook su VOIspeed
2. Controllare che il numero sia normalizzato correttamente
3. Verificare subscription realtime attiva

---

## F2 — Enrichment DID → tracking_number_id

Per i moduli Dashboard Performance (Marketing/Call Center), ogni `incoming_call`
deve essere arricchito col `tracking_number_id` del DID chiamato.

### Pipeline

1. Webhook estrae il DID dal querystring: `called` > `did` > `to` (alias accettati).
2. `toE164IT()` normalizza in `+39…` (passa attraverso anche DID esteri ≥8 cifre).
3. Lookup su `tracking_numbers` con: `(phone_e164.eq.DNIS OR voispeed_did.eq.DNIS) AND is_active = true`.
4. `call_logs` viene inserito con `dnis` (E.164) e `tracking_number_id` (può essere `null` se nessun match attivo).
5. Fallback `brand_id`: `contact_phones.brand_id` → `tracking_number.brand_id` → primo brand dell'utente.

### Test E2E

- **Unit**: `supabase/functions/voispeed-events-webhook/did-enrichment_test.ts`
  (`supabase functions test voispeed-events-webhook`). Copre normalizzazione +
  forma esatta della clausola `.or()` PostgREST.
- **SQL contract**: probe in CTE che simulano il match (vedi runbook §F2 E2E).
  Verificano: match `phone_e164`, match `voispeed_did`, `is_active=false` esclude,
  numero sconosciuto → null.

### Troubleshooting

| Sintomo | Causa probabile | Fix |
|---|---|---|
| `tracking_number_id` sempre `null` su inbound | DID non normalizzato o non presente | Controllare colonna `phone_e164`/`voispeed_did` in `tracking_numbers` |
| KPI canale errati su `/marketing/performance` | DID attivo su più tracking rows | Vincolo `is_active=true` su una sola riga per DID |
| `brand_id` errato sull'inbound | Contact con brand diverso dal tracking | Priorità: contact > tracking > user — review intenzionale |
