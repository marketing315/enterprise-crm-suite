

## Evoluzione Automazioni → Workflow con Step Avanzati (stile n8n)

### Situazione Attuale
Il motore di automazione esegue una lista lineare di azioni sequenziali (`multi_action`). Non supporta branching condizionale, delay, loop o HTTP request generici. Il backend (`automation-runner`) itera gli step uno dopo l'altro con `stop_on_failure`.

### Cosa Cambia
Evoluzione del sistema da "lista di azioni" a "workflow con nodi tipizzati" che supporta IF/ELSE, Delay, Loop e HTTP Request — mantenendo la UI a lista (non canvas).

### Modello Dati — Nuovi Tipi di Nodo

Estendere il tipo `Action` (salvato nel campo JSON `actions` della tabella `automation_rules`) con 4 nuovi tipi:

```text
Tipo Nodo          Comportamento
─────────────────  ──────────────────────────────────────
if_else            Valuta condizioni → esegue branch "then" o "else"
                   Campi: conditions, then_actions[], else_actions[]
delay              Pausa il workflow per N secondi/minuti/ore
                   Campi: delay_value, delay_unit (seconds|minutes|hours)
loop               Itera su un array del payload, esegue sub-actions per ogni item
                   Campi: items_path, loop_actions[]
http_request       Chiamata HTTP generica configurabile
                   Campi: url, method, headers, body (con template {{...}})
```

Non serve migrazione DB: tutto è nel campo JSON `actions`.

### Piano di Implementazione

**1. Estendere i tipi frontend** (`src/hooks/useAutomationRules.ts`)
- Aggiungere i 4 nuovi valori a `ActionType`
- Aggiungere i campi specifici all'interfaccia `Action` (conditions, then_actions, else_actions, delay_value, delay_unit, items_path, loop_actions, url, method, headers, body)
- Aggiungere le nuove entry in `ACTION_TYPES`

**2. Aggiungere i form dei nuovi nodi** (`AutomationRuleFormDrawer.tsx`)
- `ActionFields` per `if_else`: editor condizioni + due liste azioni nidificate (then/else) con indentazione visiva
- `ActionFields` per `delay`: input numerico + select unità
- `ActionFields` per `loop`: input path array + lista sub-actions nidificata
- `ActionFields` per `http_request`: input URL, select metodo (GET/POST/PUT/DELETE), editor headers key-value, textarea body con supporto template
- Le liste nidificate (then/else/loop) riutilizzano lo stesso componente azione con un livello di indentazione

**3. Aggiornare il backend** (`supabase/functions/automation-runner/index.ts`)
- Aggiungere executor per `if_else`: valuta condizioni con `evaluateCondition`, poi esegue ricorsivamente `then_actions` o `else_actions`
- Aggiungere executor per `delay`: `await new Promise(r => setTimeout(r, ms))` (max 30 secondi per edge function; delay più lunghi schedulano un `automation_job`)
- Aggiungere executor per `loop`: risolve `items_path` dal payload, itera ed esegue `loop_actions` per ogni elemento
- Aggiungere executor per `http_request`: fetch con URL/method/headers/body risolti via template, salva status code e response nel step log
- Rendere l'esecuzione degli step ricorsiva per supportare nidificazione

**4. Aggiornare log e preview**
- `getActionsPreview` in `LinkedAutomationsSection` e `AutomationSettings` per mostrare i nuovi tipi
- `StepLog` già supporta action_type arbitrari, nessuna modifica necessaria

### Dettagli Tecnici

- **Nidificazione massima**: 3 livelli (es. IF → loop → azione) per evitare complessità eccessiva
- **Delay lungo**: Se > 25 secondi, il delay crea un `automation_job` con `run_at` futuro e interrompe l'esecuzione corrente. Il job dispatcher riprende il workflow dallo step successivo.
- **HTTP Request**: Timeout 10 secondi, response salvata in `step_log.result`
- **Loop**: Max 50 iterazioni per evitare timeout edge function

### File Modificati
1. `src/hooks/useAutomationRules.ts` — tipi e costanti
2. `src/components/settings/automation/AutomationRuleFormDrawer.tsx` — UI form per i 4 nuovi nodi
3. `supabase/functions/automation-runner/index.ts` — executor backend ricorsivo
4. `src/components/settings/automation/AutomationSettings.tsx` — preview label
5. `src/components/settings/webhooks/LinkedAutomationsSection.tsx` — preview label

