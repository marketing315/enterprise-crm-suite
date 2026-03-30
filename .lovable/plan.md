

## Aggiunta "Risposte Quiz" al Dettaglio Contatto

### Cosa serve

Il payload webhook contiene un campo `answers` con domande fisse e risposte variabili (stringa singola o array). Serve:
1. Una colonna JSONB `quiz_answers` sulla tabella `contacts` per persistere le risposte
2. Il webhook-ingest deve mappare `answers` → `quiz_answers`
3. Una nuova sezione nel dettaglio contatto che mostra domanda/risposte in modo leggibile

### Implementazione

**1. Migrazione DB**
```sql
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS quiz_answers jsonb DEFAULT NULL;
```

**2. Webhook Ingest** (`supabase/functions/webhook-ingest/index.ts`)
- Nel blocco di creazione/aggiornamento contatto, mappare `effectivePayload.answers` → `quiz_answers` (salvare il JSON as-is)
- Aggiungere `answers` al field mapping editor come campo disponibile

**3. Nuovo componente `ContactQuizAnswersSection.tsx`**
- Riceve `contact.quiz_answers` (tipo `Record<string, string | string[]>`)
- Mostra ogni domanda come label bold, sotto le risposte come Badge (se array) o testo (se stringa singola)
- Icona `ClipboardList` nel titolo sezione "Risposte Quiz"
- Stile coerente con le altre sezioni (bordo, padding, separatore)

**4. ContactDetailSheet** — Inserire la nuova sezione dopo "Dati Lead" (riga ~471)

**5. Tipi** — Aggiungere `quiz_answers?: Record<string, string | string[]> | null` a `Contact` in `types/database.ts`

**6. Field Mapping Editor** — Aggiungere `contact_snapshot.quiz_answers` alla categoria "Contatto - Lead Data"

### UI della sezione

```text
─────────────────────────────
📋 Risposte Quiz
┌─────────────────────────────┐
│ Di che natura è il tuo      │
│ dolore?                     │
│ [Cronico]                   │
│                             │
│ In quali parti del corpo    │
│ senti dolore?               │
│ [Schiena]                   │
│                             │
│ Quali trattamenti hai già   │
│ provato?                    │
│ [Farmaci] [Trattamenti nat] │
└─────────────────────────────┘
```

