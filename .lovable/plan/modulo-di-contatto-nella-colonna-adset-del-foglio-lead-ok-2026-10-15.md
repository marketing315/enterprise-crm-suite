# Modulo di contatto nella colonna AdSet del foglio "Lead ok"

## Problema
Per l'ultimo lead (Elena Ferrario, 12:15) la colonna AdSet è rimasta vuota:
1. Il nome del modulo veniva cercato con un token Meta nel posto sbagliato (archivio vuoto), quindi Meta non veniva interrogata.
2. Il nome dell'AdSet ("1 Domanda") si trova in una parte più interna dei dati del lead, che la scrittura in tempo reale sul foglio non leggeva.

## Modifiche
1. **Recupero nome modulo da Meta**: usare il token della Meta App (come già fanno le altre funzioni Meta), così qualsiasi modulo senza regola riceve il nome direttamente da Meta. Fail-open invariato: se Meta non risponde, la cella mostra solo l'AdSet e il lead viene comunque scritto.
2. **Lettura AdSet**: nella scrittura in tempo reale sul foglio, leggere AdSet anche dai dati interni del lead (come già fatto nell'export completo).
3. **Correzione righe esistenti**: aggiornare la riga di Elena Ferrario sul foglio "Lead ok" con `1 Domanda — Modulo: <Nome Modulo>` e verificare quella di Giuseppe Di Lorenzo (`… — Modulo: Centri MyMed`).

## Dettagli tecnici
- `supabase/functions/_shared/meta-form-name.ts`: in `resolveMetaFormNames` sostituire `getMetaLeadSourceAccessToken` con `getMetaAppAccessToken` + `resolveMetaPageAccessToken` (meta_app da `meta_lead_events.meta_app_id` o dalle Meta App attive), con cache per app.
- `supabase/functions/sheets-export/index.ts`: fallback `raw_payload.fetched_payload.adset_name / adset`.
- Test Deno aggiornati; deploy `sheets-export` e `sheets-leads-export`.
- Correzione righe via Google Sheets API (service account) cercando la riga per telefono/data.
- Nessuna migrazione database.
