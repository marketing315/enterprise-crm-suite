

## Piano: Aggiungere risposte quiz nella colonna "Messaggio" del Google Sheet

Le risposte quiz sono già salvate nella colonna `quiz_answers` (JSONB) della tabella `contacts`, ma la funzione `sheets-leads-export` non le include nell'export. Il campo "messaggio" corrisponde a `contact.lead_message` nella riga 215.

### Modifiche

**File: `supabase/functions/sheets-leads-export/index.ts`**

1. **Aggiungere `quiz_answers` alle query SELECT** — sia in `fetchSingleLeadRow` (riga 242) che in `fetchAllLeadsRows` (riga 292), aggiungere `quiz_answers` alla lista dei campi di `contacts(...)`.

2. **Modificare la funzione `buildRow`** — nella riga 215, concatenare le risposte quiz al `lead_message`:
   - Se `contact.quiz_answers` esiste e ha contenuto, formattarlo come stringa leggibile (es. `"Domanda: Risposta, Domanda2: Risposta2"`)
   - Concatenarlo al `lead_message` esistente separato da ` | `
   - Se `lead_message` è vuoto, usare solo le risposte quiz

### Dettagli tecnici

Funzione helper per formattare le quiz answers:
```typescript
function formatQuizAnswers(qa: Record<string, string | string[]>): string {
  return Object.entries(qa)
    .map(([q, a]) => `${q}: ${Array.isArray(a) ? a.join(", ") : a}`)
    .join(" | ");
}
```

Nella riga 215 di `buildRow`:
```typescript
const quizStr = contact?.quiz_answers ? formatQuizAnswers(contact.quiz_answers) : "";
const messaggio = [contact?.lead_message, quizStr].filter(Boolean).join(" | ");
// usa messaggio al posto di contact?.lead_message || ""
```

