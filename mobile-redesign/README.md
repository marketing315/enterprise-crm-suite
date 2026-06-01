# Redesign Mobile "C-level" — Harness Ralph

Pacchetto di specifica + orchestrazione per ridisegnare **solo la versione mobile** (`<768px`) del CRM, rendendola semplice e premium per **tutti i ruoli**, da eseguire in un **ralph loop** (un agente che lavora un task alla volta, in ciclo).

## File
- **`SPEC.md`** — fonte di verità: principi C-level, evoluzione dei design token, app shell mobile (bottom nav, header, sheet, gesture), libreria componenti, IA per ruolo, spec schermo-per-schermo, accessibilità, performance, Definition of Done.
- **`fix_plan.md`** — backlog atomico in 8 fasi (F0→F7), con dipendenze, criteri di accettazione e checkbox. È il file che l'agente aggiorna.
- **`PROMPT.md`** — il prompt che si dà all'agente a ogni iterazione del loop (regole, ciclo, guardrail, verifica).
- **`run-ralph.sh`** — script di esempio per far girare il loop.

## Idea del loop (tecnica "Ralph")
Si rilancia ripetutamente lo **stesso prompt** (`PROMPT.md`). Ogni iterazione: l'agente legge SPEC + backlog, prende il **primo task `[ ]`** con dipendenze soddisfatte, lo implementa, verifica (lint/types/test/build), spunta la checkbox in `fix_plan.md`, fa **un commit atomico** e si ferma. Il loop riparte finché restano task.

I progressi sono **persistiti nel repo** (checkbox in `fix_plan.md` + commit git), quindi il loop è ripartibile: ogni run riprende dal primo task non spuntato.

## Come eseguire
Con Claude Code (o agente equivalente) dalla root del repo:

```bash
# loop semplice: rilancia il prompt finché ci sono task da fare
bash mobile-redesign/run-ralph.sh
```

Oppure manualmente, una iterazione alla volta:

```bash
claude -p "$(cat mobile-redesign/PROMPT.md)"
```

## Principi non negoziabili (riassunto)
1. **Solo mobile** `<768px` via `useIsMobile()`. Il desktop non cambia di un pixel.
2. **Niente backend/dati/RBAC**: si riusano gli hook esistenti, cambia solo la presentazione.
3. **Sempre verde**: lint, types, test, build a ogni task.
4. **Un task = un commit** piccolo e mirato.
5. **Italiano**, token (no colori hard-coded), a11y AA, safe-area.

## Definizione di "fatto" del progetto
Tutte le checkbox di `fix_plan.md` spuntate, F7.4 (gate finale) verde, desktop verificato invariato, ogni ruolo ha la sua shell mobile coerente con `SPEC.md §5`.
