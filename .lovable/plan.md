

## Piano: Creazione campi contatto Keplero

### Cosa faremo

Inseriremo **19 definizioni di campo** nella tabella `contact_field_definitions` con scope **global** (visibili su tutti i brand). Questi campi archivieranno i dati grezzi ricevuti da Keplero, separati dai campi CRM nativi.

### Mapping dei campi

| Key | Label | Tipo |
|-----|-------|------|
| `cap_keplero` | CAP Keplero | `text` |
| `nome_keplero` | Nome Keplero | `text` |
| `numero_keplero` | Numero Keplero | `text` |
| `zona_keplero` | Zona Keplero | `text` |
| `citta_keplero` | Città Keplero | `text` |
| `cognome_keplero` | Cognome Keplero | `text` |
| `indirizzo_keplero` | Indirizzo Keplero | `text` |
| `pacemaker_keplero` | Pacemaker Keplero | `select` (sì/no/non so) |
| `numero_civico_keplero` | Numero Civico Keplero | `text` |
| `esito_chiamata_keplero` | Esito Chiamata Keplero | `select` (appuntamento_fissato/rifiuto/da_ricontattare) |
| `motivo_rifiuto_keplero` | Motivo Rifiuto Keplero | `text` |
| `motivo_contatto_keplero` | Motivo Contatto Keplero | `text` |
| `ora_appuntamento_keplero` | Ora Appuntamento Keplero | `text` |
| `data_appuntamento_keplero` | Data Appuntamento Keplero | `text` |
| `ha_gia_dispositivo_keplero` | Ha Già Dispositivo Keplero | `select` (sì/no) |
| `telefono_principale_keplero` | Telefono Principale Keplero | `phone` |
| `telefono_secondario_keplero` | Telefono Secondario Keplero | `phone` |
| `disponibilita_orarie_keplero` | Disponibilità Orarie Keplero | `text` |
| `fissato_keplero` | Fissato Keplero | `select` (sì/no) |

**Note tecniche:**
- I campi data/ora restano `text` perché Keplero invia formati liberi (es. "30-01-2026", "17:30")
- I campi con valori fissi usano `select` con opzioni predefinite
- Scope `global` = visibili per tutti i brand senza duplicazione
- `display_order` progressivo per raggruppamento nella UI

### Implementazione

1. **Inserire le 19 definizioni** nel DB via INSERT (non migration, sono dati non schema)
2. **Aggiornare il webhook Keplero** (`keplero-webhook/index.ts`) per popolare automaticamente questi campi custom quando riceve un payload, usando la RPC `upsert_contact_field_values`

