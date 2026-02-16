
# Export Lead Events su Google Sheets (tutti i brand)

## Obiettivo
Creare una nuova edge function `sheets-leads-export` che esporta i lead_events di tutti i brand in un Google Sheet con le 23 colonne concordate, e aggiungere un bottone nella UI Settings per attivare l'export manuale.

## Colonne (23 totali)

| Col | Header | Origine dati |
|-----|--------|-------------|
| A | Data | lead_events.received_at (solo data) |
| B | Brand | brands.name |
| C | Nome | contacts.first_name |
| D | Cognome | contacts.last_name |
| E | Numero | contacts.phone_normalized o contact_phones |
| F | Email | contacts.email |
| G | Campagna | raw_payload -> campaign_name |
| H | Fonte | lead_events.source_name |
| I | AdSet | raw_payload -> adset_name |
| J | Motivo | contacts.lead_reason |
| K | Messaggio | contacts.lead_message |
| L | CAP | contacts.cap |
| M | Citta | contacts.city |
| N | Provincia | contacts.province |
| O | Tag | tag_assignments + tags (comma-separated) |
| P | Note | contacts.notes |
| Q | Appuntamento Status | appointments.status |
| R | Appuntamento Data | appointments.scheduled_at (solo data) |
| S | Appuntamento Orario | appointments.scheduled_at (solo orario HH:mm) |
| T | Appuntamento Via | appointments.address |
| U | Appuntamento Civico | estratto da address (se presente) |
| V | Appuntamento Citta | appointments.city |
| W | Appuntamento CAP | appointments.cap |

## Architettura

Lo sheet verra scritto nello stesso spreadsheet gia configurato (`GOOGLE_SHEETS_FILE_ID`) in un tab chiamato **LEADS**. Ad ogni export il tab viene svuotato e riscritto (full replace), con header formattati.

## Dettagli tecnici

### 1. Edge Function `sheets-leads-export`
- **Auth**: service role o JWT utente autenticato (verifica ruolo admin)
- **Parametri**: `{ date_from?, date_to?, brand_id? }` - se brand_id omesso, esporta tutti i brand
- **Query dati**: join tra `lead_events`, `contacts`, `contact_phones`, `brands`, `tag_assignments`+`tags`, `appointments` (ultima per contact/brand)
- **Riutilizza** le helper functions gia esistenti in `sheets-export` (getAccessToken, writeRange, createTab, applyFormatting) copiate nella nuova function
- **Logging**: scrive in `sheets_export_logs` con tab_name = "LEADS"
- **Limite**: 5000 righe max per evitare timeout

### 2. Config.toml
Aggiungere entry `[functions.sheets-leads-export]` con `verify_jwt = false`.

### 3. UI - Bottone Export nella pagina Settings > Google Sheets
Aggiungere nella `GoogleSheetsSettings.tsx`:
- Un nuovo tipo export "leads" nel selettore ("Tutti i Lead")
- Quando selezionato, invoca `sheets-leads-export` invece di `sheets-advanced-export`
- Stessa UX: filtro periodo, bottone "Esporta Ora", log nella tabella export recenti

### 4. Flusso dati

```text
UI (Settings > Google Sheets)
  |
  v
supabase.functions.invoke("sheets-leads-export", { date_from, date_to })
  |
  v
Edge Function:
  1. Auth check (JWT admin)
  2. Fetch lead_events + join contacts, phones, brands, tags, appointments
  3. Google Sheets API: ensureTab("LEADS") -> clear -> write headers + data
  4. Log in sheets_export_logs
  5. Return { success, rows_exported }
```

### 5. Query principale (pseudo-SQL)

```text
lead_events
  JOIN brands ON brand_id
  LEFT JOIN contacts ON contact_id
  LEFT JOIN contact_phones ON contact_id (is_primary = true)
  LEFT JOIN tag_assignments ON contact_id
  LEFT JOIN tags ON tag_id
  LEFT JOIN appointments ON contact_id + brand_id (latest)
```

I tag vengono aggregati con GROUP_CONCAT equivalente lato codice TypeScript (array -> join con virgola).
Gli appuntamenti vengono presi il piu recente per contatto.
