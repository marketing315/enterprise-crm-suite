

## Piano: Barra riepilogo fasi con navigazione rapida

Aggiungere una barra orizzontale compatta sopra la Kanban board che mostra tutte le fasi con il conteggio dei deal. Cliccando su una fase, la board scrolla automaticamente alla colonna corrispondente.

### Cosa viene creato

**Barra di navigazione fasi** — una riga di chip/badge sopra la kanban, ognuno con:
- Pallino colorato della fase
- Nome fase
- Conteggio deal (badge numerico)
- Click → scroll orizzontale fluido alla colonna corrispondente

### Modifiche tecniche

**`src/components/pipeline/KanbanBoard.tsx`**

1. Ogni `KanbanColumn` riceve un `id` HTML basato sullo stage ID (es. `stage-{id}`) per poterlo individuare nel DOM.

2. Sopra il contenitore delle colonne, aggiungere una riga di chip cliccabili che mappano `stages` con il conteggio da `dealsByStage`. Al click, si usa `document.getElementById('stage-{id}')?.scrollIntoView({ behavior: 'smooth', inline: 'start' })`.

3. La barra è visibile solo su desktop (nascosta su mobile dove c'è già la tab view).

**`src/components/pipeline/KanbanColumn.tsx`**

1. Aggiungere una prop `htmlId` passata come attributo `id` al div contenitore della colonna.

File modificati: `KanbanBoard.tsx`, `KanbanColumn.tsx`.

