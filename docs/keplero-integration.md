# Integrazione Keplero Webhook

Questa integrazione riceve appuntamenti fissati dall'AI di Keplero (WhatsApp) e li importa nel CRM.

## Endpoint

```
POST https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/keplero-webhook
```

## Autenticazione (opzionale)

Per aggiungere sicurezza, configurare il secret `KEPLERO_WEBHOOK_SECRET` e inviare l'header:

```
X-Keplero-Secret: <your-secret>
```

## Payload Keplero

Il webhook accetta il formato standard di Keplero:

```json
{
  "args": {
    "Nome": "Vincenzo",
    "Cognome": "Pace",
    "telefono_principale": "3662560267",
    "telefono_secondario": "",
    "citta": "San Donato Milanese",
    "cap": 20097,
    "indirizzo_completo": "Via Unica 55, Poasco",
    "zona": "Poasco",
    "data_appuntamento": "30-01-2026",
    "ora_appuntamento": "17:30",
    "pacemaker": "no",
    "ha_gia_dispositivo": "no",
    "motivo_contatto": "info prova gratuita",
    "esito_chiamata": "appuntamento_fissato",
    "motivo_rifiuto": "",
    "note": "Appuntamento fissato per prova gratuita...",
    "disponibilita_orarie": "pomeriggio dopo le 17"
  },
  "config": {
    "subject": "Nuovo appuntamento fissato EXCELL",
    "body": "BRAND: Excell\n\nDATI CLIENTE..."
  }
}
```

## Mapping Campi

| Campo Keplero | Destinazione CRM |
|---------------|------------------|
| `Nome` | `contacts.first_name` |
| `Cognome` | `contacts.last_name` |
| `telefono_principale` | `contact_phones.phone_raw` (primary) |
| `telefono_secondario` | `contact_phones.phone_raw` (secondary) |
| `citta` | `contacts.city`, `appointments.city` |
| `cap` | `contacts.cap`, `appointments.cap` |
| `indirizzo_completo` | `contacts.address`, `appointments.address` |
| `data_appuntamento` + `ora_appuntamento` | `appointments.scheduled_at` |
| `pacemaker` | `lead_events.pacemaker_status` |
| `note` | `lead_events.booking_notes`, `appointments.notes` |
| `disponibilita_orarie` | `lead_events.logistics_notes` |
| `esito_chiamata` | `appointments.status` |

## Mapping Pacemaker

| Keplero | CRM |
|---------|-----|
| `no` | `assente` |
| `si` | `presente` |
| `non_so` | `non_chiaro` |

## Mapping Esito Chiamata

| Keplero | Appointment Status |
|---------|-------------------|
| `appuntamento_fissato` | `confirmed` |
| `rifiuto` | `cancelled` |
| `da_ricontattare` | `scheduled` |

## Riconoscimento Brand

Il brand viene estratto automaticamente da:
1. Pattern `BRAND: <nome>` nel body email
2. Nome brand nel subject (EXCELL, MYMED, SONIMED)
3. Fallback al primo brand non-system

## Response

```json
{
  "success": true,
  "contact_id": "uuid",
  "deal_id": "uuid",
  "lead_event_id": "uuid",
  "appointment_id": "uuid"
}
```

## Cosa viene creato

1. **Contatto** - Trova per telefono o crea nuovo
2. **Deal** - Trova aperto o crea nuovo
3. **Lead Event** - Con metadati di qualificazione
4. **Appuntamento** - Se data valida presente

## Test

```bash
curl -X POST \
  https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/keplero-webhook \
  -H 'Content-Type: application/json' \
  -d '{"args":{"Nome":"Test","telefono_principale":"3331234567","data_appuntamento":"2026-02-15"},"config":{"subject":"EXCELL"}}'
```
