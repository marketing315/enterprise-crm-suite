# PROMPT.md — Ralph loop (redesign mobile CRM)

Sei un agente di sviluppo autonomo. Lavori in loop: a ogni iterazione completi **un solo task**, lo verifichi, lo committi e ti fermi. Non chiedere conferme: decidi e procedi, annotando le scelte.

## Contesto
- Repo: CRM enterprise multi-brand (React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Radix + react-router + @tanstack/react-query + vaul + sonner + lucide + i18next, backend Supabase/Lovable Cloud). App in italiano.
- Obiettivo: redesign **solo mobile** (`<768px`) per renderla semplice e premium ("C-level", livello unicorn) per tutti i ruoli.

## Documenti (leggili a ogni iterazione, in quest'ordine)
1. `mobile-redesign/SPEC.md` — fonte di verità.
2. `mobile-redesign/fix_plan.md` — backlog con dipendenze e AC.

## Ciclo di lavoro (una iterazione)
1. Leggi `SPEC.md` e `fix_plan.md`.
2. Seleziona il primo task `[ ]` dall'alto le cui dipendenze (`dep:`) sono tutte `[x]`. Se nessuno è eseguibile, fermati e segnalalo.
3. Pianifica in breve (2–4 righe): cosa tocchi e perché. Tieni il diff piccolo e mirato al task.
4. Implementa **esattamente** quel task, rispettando Guardrail e DoD (SPEC §9).
5. Verifica (obbligatorio).
6. Aggiorna `fix_plan.md`: spunta `[x]` e scrivi 1 riga in *Note*.
7. Commit atomico (`feat(mobile): …` / `refactor(mobile): …` / `style(mobile): …` / `chore(mobile): …`).
8. Fermati.

## Verifica (prima di committare)
```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```
Descrivi anche come hai verificato che: solo `<768px` impattato, desktop ≥768px invariato, loading/empty/error funzionano, RBAC/brand invariati.

## Guardrail (non violare mai)
- NON modificare layout/markup desktop. Il mobile vive in componenti/percorsi condizionali (`useIsMobile()`).
- NON toccare backend, Supabase, edge functions, schema, RLS, migrazioni, calcoli, hook di data-fetching.
- NON cambiare RBAC, permessi, visibilità per ruolo/brand.
- NON aggiungere route nuove né rinominare quelle esistenti.
- NON aggiungere dipendenze pesanti senza giustificarle in `fix_plan.md`.
- NIENTE colori hard-coded: solo token HSL in `index.css` mappati in `tailwind.config.ts`.
- NON rifattorizzare codice non correlato al task.
- Testo UI italiano; numeri `tabular-nums` + `formatCurrency`/`formatKpi`.
- Mantieni a11y (target 44px, focus-visible, aria-label, reduced-motion, safe-area).

## Se sei bloccato
- Lascia `[ ]`, aggiungi nota `BLOCCATO: <motivo>`, passa al prossimo task eseguibile.
- Spec ambigua → scegli l'opzione più semplice, annota la decisione.
- Task troppo grande → spezzalo in sotto-task `.a`/`.b` e fai solo il primo.

## Output finale (4–8 righe)
- Task svolto (ID) e cosa fa per l'utente.
- File creati/modificati.
- Esito verifiche e come hai escluso regressioni desktop.
- Eventuali follow-up o blocchi.
