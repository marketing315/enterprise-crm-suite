

## Fix: Impedire lo scroll verticale al click sulla sidebar

Il problema è che `scrollIntoView` muove anche verticalmente la pagina. La soluzione è usare `scrollIntoView` solo per lo scroll orizzontale, oppure usare direttamente `element.scrollIntoView` con `block: 'nearest'` sostituito da uno scroll manuale sul contenitore orizzontale.

### Modifica

**`src/components/pipeline/KanbanBoard.tsx`** — Sostituire le due chiamate `scrollIntoView` (sidebar e bottoni stage) con uno scroll orizzontale diretto sul contenitore delle colonne:

1. Aggiungere un `useRef` per il contenitore scrollabile delle colonne kanban (`div.overflow-x-auto`).
2. Al click su una fase nella sidebar, trovare l'elemento colonna e calcolare il suo `offsetLeft` relativo al contenitore, poi usare `containerRef.current.scrollTo({ left: offset, behavior: 'smooth' })`.

Questo evita qualsiasi movimento verticale della pagina.

