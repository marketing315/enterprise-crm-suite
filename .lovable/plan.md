

## Piano: Sidebar verticale nascondibile per navigazione fasi

Trasformare la barra orizzontale di navigazione fasi in una sidebar verticale a sinistra della Kanban board, con possibilità di nasconderla/mostrarla tramite un toggle.

### Layout

```text
┌──────────┬──────────────────────────────┐
│ [«]      │                              │
│ ● Nuovo  │   Kanban columns →          │
│   Lead 5 │                              │
│ ● In     │                              │
│   Tratt 3│                              │
│ ● Chiuso │                              │
│   2      │                              │
│          │                              │
└──────────┴──────────────────────────────┘
```

Quando nascosta, resta solo un piccolo bottone icona per riaprirla.

### Modifiche tecniche

**`src/components/pipeline/KanbanBoard.tsx`**

1. Aggiungere stato `sidebarOpen` (default `true`) con `useState`.
2. Sostituire la barra orizzontale dei chip (righe 214-232) con un pannello verticale a sinistra:
   - Wrapper `flex` orizzontale che contiene sidebar + area kanban.
   - Sidebar: `w-48` quando aperta, `w-0` quando chiusa, con transizione CSS.
   - Dentro: lista verticale delle fasi con pallino colorato, nome, conteggio. Click → `scrollIntoView`.
   - Bottone toggle in alto (icona `PanelLeftClose`/`PanelLeftOpen`) per aprire/chiudere.
3. Quando chiusa, mostrare un piccolo bottone floating/assoluto per riaprirla.

Nessun altro file da modificare — tutto contenuto in `KanbanBoard.tsx`.

