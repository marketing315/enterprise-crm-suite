

## Redesign Completo: Creazione Regola Automazione → Wizard Multi-Step C-Level

### Problema
Il form attuale è un unico pannello Sheet lungo e denso con tutti i campi visibili insieme: trigger, condizioni, azioni, impostazioni avanzate. Non è intuitivo — sembra un form tecnico, non un workflow builder.

### Soluzione
Sostituire il Sheet monolitico con un **wizard a step guidati** (stepper orizzontale) che divide la creazione in 4 fasi chiare, ciascuna con una UI pulita e focalizzata. Stile Apple-like, spaziatura generosa, animazioni fluide.

```text
┌─────────────────────────────────────────────────────┐
│  ① Trigger  →  ② Condizioni  →  ③ Workflow  →  ④ Review  │
│─────────────────────────────────────────────────────│
│                                                     │
│   [Contenuto step corrente]                        │
│                                                     │
│                           ← Indietro    Avanti →   │
└─────────────────────────────────────────────────────┘
```

### I 4 Step

**Step 1 — Trigger ("Quando")**
- Card selezionabili grandi per tipo trigger (Webhook / Cron) con icona e descrizione
- Sotto la selezione: evento webhook come card-grid categorizzate (Keplero, Meta, VOIspeed, Inbound) oppure cron picker
- AI generator come banner in cima ("Descrivi in linguaggio naturale...")
- Nome e descrizione inline, auto-suggeriti dopo la selezione trigger

**Step 2 — Condizioni ("Filtri")**  
- Opzionale, skip-pabile con un toggle "Applica solo se..."
- Builder condizioni con chip visuali: `Campo` `Operatore` `Valore` in una riga pulita
- Pulsante "+ Aggiungi filtro" minimalista
- Testo esplicativo in linguaggio naturale sotto ogni riga (es. "Esegui solo se Nome esiste")

**Step 3 — Workflow ("Cosa fare")**
- Il workflow builder attuale (nodi con connettori verticali) ma migliorato:
  - Empty state con 3-4 template rapidi preconfigurati ("Crea contatto e tagga", "Invia webhook", etc.)
  - Nodo picker come grid di card colorate invece che dropdown
  - Drag handle visibile per riordinare
  - Preview in linguaggio naturale sotto ogni nodo collassato

**Step 4 — Review ("Riepilogo")**
- Vista read-only del workflow completo come flow visivo compatto
- Toggle Attiva/Disattiva, Stop su errore, Priorità come impostazioni secondarie
- Pulsante "Crea Workflow" prominente

### Dettagli Tecnici

**File da modificare:**
1. `src/components/settings/automation/AutomationRuleFormDrawer.tsx` — Riscrittura completa: sostituire il form monolitico con un componente stepper che renderizza 4 sub-componenti
2. Creare 4 nuovi componenti:
   - `AutomationWizardTrigger.tsx` — Step 1
   - `AutomationWizardConditions.tsx` — Step 2  
   - `AutomationWizardWorkflow.tsx` — Step 3 (riusa WorkflowNodeCard, WorkflowNodePicker, NestedActionList, ActionFields)
   - `AutomationWizardReview.tsx` — Step 4

**Pattern UI:**
- Stepper orizzontale con numeri/check e linea di connessione
- Transizione fade tra step
- Sheet mantiene `sm:max-w-3xl` per dare più spazio
- Bottoni "Indietro / Avanti" fissi in basso con validazione per step
- Step completati mostrano un check verde nella barra

**Logica:**
- Lo state rimane nel componente padre (AutomationRuleFormDrawer)
- Ogni step riceve props e callbacks per aggiornare lo state
- Validazione per step: Step 1 richiede trigger, Step 3 richiede almeno 1 azione
- Il form AI resta nello Step 1 come opzione alternativa
- In modalità edit, tutti gli step sono navigabili liberamente

