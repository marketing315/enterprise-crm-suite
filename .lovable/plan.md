## Backfill `cap` sui contatti da `post_code` nel raw Meta

### Cosa ho trovato
- I lead Meta salvano i campi del form in `meta_lead_events.fetched_payload->'field_data'` come array `[{name, values:[...]}, ...]`. Il CAP arriva come `name = "post_code"`.
- Eventi con `post_code` presente: **153**.
- Di questi, valori CAP italiani validi (4–5 cifre): **141** — gli altri 12 sono test lead Meta con placeholder tipo `<test lead: dummy data for post_code>` e vanno scartati.
- Tra i 141 collegati a un contatto:
  - **12 contatti** hanno `cap` NULL → da popolare.
  - **1 contatto** ha un `cap` diverso da quello del raw → da decidere se sovrascrivere.
  - I restanti hanno già il CAP corretto.

### Piano
1. Estrarre `post_code` da `meta_lead_events.fetched_payload->'field_data'` solo se matcha `^\d{4,5}$` (esclude i placeholder dei test lead).
2. Per ogni `contact_id`, prendere il valore più recente (per `created_at` desc) in caso di più eventi.
3. Aggiornare `contacts.cap`:
   - **Modalità conservativa (default proposto)**: aggiorna solo dove `cap IS NULL` → 12 contatti.
   - **Modalità "tutti"**: aggiorna anche dove differente → 13 contatti totali (1 sovrascrittura).
4. Eseguito tramite `supabase--insert` (UPDATE su `contacts`), nessuna modifica di schema.
5. Nessun trigger/RLS impattato (update di una colonna nullable).

### Domanda di conferma
Vuoi sovrascrivere anche l'unico contatto che ha già un CAP diverso dal raw, o lasciamo solo il riempimento dei 12 vuoti?

> Nota: i webhook `lead_events.raw_payload` contengono lo stesso `field_data` di Meta — la backfill via `meta_lead_events` copre già tutti i casi, non serve una seconda passata.
