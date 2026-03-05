# Integrazione Keplero Webhook — Household Model

## Endpoint

```
POST /functions/v1/keplero-webhook?brand=<slug>
```

## Autenticazione

Header obbligatorio: `X-Keplero-Secret: <secret>`

## Payload

```json
{
  "args": {
    "Nome": "Anna",
    "Cognome": "Bianchi",
    "telefono_utente": "3331112222",
    "telefono_principale": "3339998888",
    "telefono_secondario": "3201234567",
    "citta": "Lecce",
    "cap": 73100,
    "indirizzo": "Via Roma",
    "numero_civico": "14",
    "zona": "Centro",
    "data_appuntamento": "16-08-2026",
    "ora_appuntamento": "17:30",
    "pacemaker": "no",
    "ha_gia_dispositivo": "no",
    "motivo_contatto": "info prova gratuita",
    "esito_chiamata": "appuntamento_fissato",
    "motivo_rifiuto": "",
    "note": "Appuntamento per prova gratuita",
    "disponibilita_orarie": "pomeriggio dopo le 17",
    "fissato_keplero": true
  },
  "config": {
    "subject": "Nuovo appuntamento EXCELL",
    "body": "BRAND: Excell"
  }
}
```

## Modello Household

### Ruoli

| Campo | Ruolo | Descrizione |
|-------|-------|-------------|
| `telefono_utente` | **Requester** | Chi chiama/prenota |
| `telefono_principale` | **Beneficiary** | Chi riceve il servizio |

- Se `telefono_utente` assente → fallback su `telefono_principale`
- Se stessi numeri → stessa persona (requester = beneficiary)
- `telefono_secondario` → telefono aggiuntivo nel household

### Tabelle coinvolte

| Tabella | Comportamento |
|---------|--------------|
| `contacts` | Find-or-create, **NO overwrite** campi root esistenti |
| `household_people` | Link persona requester + beneficiary |
| `keplero_interactions` | Append-only, idempotente via fingerprint |
| `appointments` | Sempre **nuovo** se data/ora presenti |
| `deals` | Find-or-create, auto-stage se fissato |
| `lead_events` | Append-only con raw payload |

## Auto-Stage "Fissato"

Quando `fissato_keplero = true`:
1. Il deal viene spostato allo stage **"Fissato"** (globale, order_index=2)
2. Record in `deal_stage_history`
3. Audit log con `action: auto_stage_fissato`

## Idempotenza

Fingerprint SHA-256 su: `brandId|telefono_utente|telefono_principale|data|ora|esito|nome|cognome`

Payload duplicato → risposta `200 { success: true, duplicate: true }`

## Response

```json
{
  "success": true,
  "contact_id": "uuid",
  "deal_id": "uuid",
  "lead_event_id": "uuid",
  "appointment_id": "uuid",
  "interaction_id": "uuid",
  "requester_person_id": "uuid",
  "beneficiary_person_id": "uuid",
  "fissato_applied": true,
  "inbound_event_id": "uuid"
}
```

## Edge Cases

| Caso | Comportamento |
|------|--------------|
| `telefono_utente == telefono_principale` | Stessa persona, un solo household_people |
| `telefono_utente` mancante | Fallback su `telefono_principale` |
| `fissato_keplero=true` + `esito=rifiuto` | Fissato ha priorità, deal → stage Fissato |
| Payload duplicato | Dedup via fingerprint, 200 OK |
| Numeri +39/0039/raw | Normalizzazione automatica |
