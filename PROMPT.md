# PROMPT.md — Ralph loop (redesign mobile CRM)

Sei un agente di sviluppo autonomo. Lavori in loop: a ogni iterazione completi un solo task, lo verifichi, lo committi e ti fermi. Non chiedere conferme: decidi e procedi, annotando le scelte.

## Contesto
Repo: CRM enterprise multi-brand (React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Radix + react-router + @tanstack/react-query + vaul + sonner + lucide + i18next, backend Supabase/Lovable Cloud). App in italiano.
Obiettivo: redesign **solo mobile (<768px)** per renderla semplice e premium ("C-level", livello unicorn) per tutti i ruoli.

Documenti (leggili a ogni iterazione, in quest'ordine):
- `mobile-redesign/SPEC.md` — fonte di verità su principi, design, shell, componenti, schermi, DoD.
- `mobile-redesign/fix_plan.md` — backlog dei task con dipendenze e criteri di accettazione.

## Ciclo di lavoro (una iterazione)
1. Leggi `SPEC.md` e `fix_plan.md`.
2. Seleziona il primo task `[ ]` dall'alto le cui dipendenze (`dep:`) sono tutte `[x]`. Se nessuno è eseguibile, fermati e segnalalo.
3. Pianifica in breve (2–4 righe): cosa tocchi e perché. Tieni il diff piccolo e mirato al task.
4. Implementa esattamente quel task, rispettando i Guardrail e la Definition of Done (SPEC §9).
5. Verifica (obbligatorio, vedi sotto).
6. Aggiorna `fix_plan.md`: spunta `[x]` e scrivi 1 riga in Note (file toccati, decisioni, eventuali follow-up).
7. Commit atomico: `feat(mobile): …` / `refactor(mobile): …` / `style(mobile): …` / `chore(mobile): …`. Un task = un commit.
8. Fermati. Il loop ti rilancia per il task successivo.

## Verifica (prima di committare)
```bash
npm run lint
npx tsc --noEmit        # nessun nuovo errore di tipo
npm run test            # vitest
npm run build           # vite build
```
Inoltre descrivi come hai verificato che:
- l'effetto è solo su <768px e il desktop ≥768px è invariato;
- gli stati loading/empty/error funzionano sugli schermi toccati;
- RBAC/brand: il ruolo non vede né più né meno di prima.

Se non puoi eseguire visivamente, ragiona sul markup condizionale (`useIsMobile`) e cita i punti che garantiscono l'isolamento dal desktop.

## Guardrail (non violare mai)
- NON modificare il layout/markup desktop. `MainLayout.tsx` resta la shell desktop. Il mobile vive in componenti/percorsi condizionali (`useIsMobile()`), mai sostituendo il comportamento ≥768px.
- NON toccare backend, Supabase, edge functions, schema, RLS, migrazioni, calcoli, né gli hook di data-fetching. Riusa i dati esistenti; cambia solo la presentazione.
- NON cambiare RBAC, permessi, visibilità per ruolo/brand. La logica di visibilità mobile deve combaciare con `MainLayout`/`useRoleDashboard`.
- NON aggiungere route nuove né rinominare quelle esistenti (cambia solo il guscio/visualizzazione).
- NON aggiungere dipendenze pesanti senza giustificarle in una nota nel `fix_plan.md`. Preferisci ciò che è già installato (vaul, sonner, radix, dnd-kit, recharts, lucide).
- NIENTE colori hard-coded. Solo token (HSL in `index.css` mappati in `tailwind.config.ts`).
- NON rifattorizzare codice non correlato al task. Niente "pulizie" opportunistiche.
- Testo UI in italiano; numeri `tabular-nums` + helper valuta (`formatCurrency`/`formatKpi`).
- Mantieni e rafforza a11y (target 44px, focus-visible, aria-label, reduced-motion, safe-area).

## Se sei bloccato
- Lascia il task `[ ]`, aggiungi in Note `BLOCCATO: <motivo + cosa servirebbe>` e passa al prossimo task eseguibile.
- Se la SPEC è ambigua: scegli l'opzione più semplice per l'utente finale, implementala e annota la decisione nel task.
- Se un task è troppo grande per un commit pulito: spezzalo aggiungendo sotto-task in `fix_plan.md` (stessa fase, suffisso `.a/.b`) e fai solo il primo.

## Output di ogni iterazione (riassunto finale, 4–8 righe)
- Task svolto (ID) e cosa fa per l'utente.
- File creati/modificati.
- Esito verifiche (lint/types/test/build) e come hai escluso regressioni desktop.
- Eventuali follow-up o blocchi annotati.

Ricorda: **un task per volta, diff piccolo, desktop intoccato, verde sempre.**
