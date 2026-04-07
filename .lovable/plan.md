

## Piano: Aggiungere "Appuntamenti Fissati" nelle KPI card ADV

Il dato "Appuntamenti Fissati" è già presente nella tab **Overview**, ma manca nella tab **Statistiche ADV** (`AdStatsKpiCards`).

### Modifiche

1. **`src/components/marketing/AdStatsTab.tsx`** — importare e invocare `useFunnelMetrics` con le stesse date del range selezionato, passare il dato appointments al componente `AdStatsKpiCards`.

2. **`src/components/marketing/AdStatsKpiCards.tsx`** — aggiungere prop opzionale `appointments` (number), aggiungere una KPI card "Appuntamenti" con icona `CalendarCheck` e colore verde, posizionata dopo Lead e CPL.

### Dettagli tecnici

- `AdStatsKpiCardsProps` riceverà `appointments?: number | null`
- La nuova card userà `CalendarCheck` da lucide-react con `text-teal-500`
- In `AdStatsTab.tsx`, il hook `useFunnelMetrics` verrà chiamato con `from`/`to` derivati dai filtri data già presenti nel componente

