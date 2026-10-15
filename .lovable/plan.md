# Nome del modulo Meta nella colonna AdSet del Google Sheet

## Obiettivo
Nella colonna **AdSet** del foglio Google "LEADS", oltre al nome dell'AdSet, scrivere anche il **nome del modulo di contatto** da cui proviene il lead (solo per i lead Meta).

Formato proposto della cella:
- Lead Meta con AdSet: `Nome AdSet — Modulo: Nome Modulo`
- Lead Meta senza AdSet: `Modulo: Nome Modulo`
- Lead non Meta: invariato (solo AdSet)

## Come funziona oggi
- La colonna AdSet (colonna I) viene compilata in `supabase/functions/sheets-leads-export/index.ts`, funzione `buildRow()`, leggendo `raw_payload.adset / adset_name / meta_adset_name`.
- Il nome del modulo NON è salvato nel lead: in `lead_events.raw_payload` c'è solo `meta_form_id` (l'ID numerico).
- Il nome del modulo esiste solo per i moduli con una regola configurata (`meta_form_brand_routes.form_name`, `meta_form_email_recipients.form_name`, `meta_form_sheet_exclusions.form_name`). Verificato: dei lead Meta recenti, solo "Centri MyMed" ha un nome; gli altri form_id non hanno nome in nessuna tabella.

## Modifiche

### 1. `sheets-leads-export/index.ts`
- Nuova funzione `buildFormNameMap(supabaseAdmin)`: raccoglie `form_id → form_name` dall'unione di `meta_form_brand_routes`, `meta_form_email_recipients`, `meta_form_sheet_exclusions`.
- Per i `form_id` presenti nei lead ma senza nome in quelle tabelle, recupera il nome da Meta Graph API (`/{form_id}?fields=name`) usando il token della Meta App (helper `_shared/meta-secrets.ts`), una sola chiamata per modulo, con cache in memoria per la durata dell'export. In caso di errore API, il nome resta vuoto e la cella mostra solo l'AdSet (fail-open, nessun lead perso).
- `buildRow()` riceve un parametro opzionale `formName` e compone la colonna AdSet come sopra.
- Il nome del modulo viene risolto da `raw_payload.meta_form_id` sia in modalità singolo lead (`fetchSingleLeadRow`) sia in export completo (`fetchAllLeadsRows`).

### 2. Test
- Aggiornare `sheets-leads-export/index.test.ts`: nuovi casi per la composizione AdSet + modulo (con/senza AdSet, con/senza nome modulo, lead non Meta invariato).

### 3. Deploy
- Deploy di `sheets-leads-export`.

## Note
- Vale per i lead esportati **da quel momento in poi**. Le righe già presenti nel foglio non cambiano; se vuoi aggiornare anche lo storico, si può fare un export completo (riscrittura del foglio) dopo il deploy — dimmi se lo vuoi incluso.
- Nessuna migrazione database necessaria.
