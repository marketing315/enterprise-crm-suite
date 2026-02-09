
# Analisi Approfondita dei Bug

## Bug Trovati

### BUG 1 (CRITICO) - Costante `__ALL_BRANDS__` obsoleta in 4 hooks
I file seguenti usano `currentBrand?.id === '__ALL_BRANDS__'` per determinare la vista globale, ma il sistema ora usa `SYSTEM_BRAND_ID` (`00000000-0000-0000-0000-000000000000`). La condizione `=== '__ALL_BRANDS__'` non sara' MAI vera, quindi quando l'utente seleziona "Azienda Intera", questi hook NON passeranno alla vista aggregata e filtreranno per il system brand UUID raw, mostrando dati errati o vuoti.

**File coinvolti:**
- `src/hooks/useCompanyFinance.ts` (7 occorrenze)
- `src/hooks/useCeoDashboard.ts` (1 occorrenza)
- `src/hooks/useBrandTaxSettings.ts` (2 occorrenze)
- `src/hooks/useCostCenters.ts` (2 occorrenze)

**Fix:** Sostituire `currentBrand?.id === '__ALL_BRANDS__'` con `isAllBrandsSelected` dal context BrandContext, ottenendo `isAllBrandsSelected` tramite `useBrand()`.

---

### BUG 2 (MEDIO) - Query key errate in `useGlobalRealtime.ts`
La mappa `TABLE_QUERY_MAP` invalida query key inesistenti, rendendo il realtime inefficace per alcune aree:

| Chiave invalida usata | Chiave corretta effettiva |
|---|---|
| `['deal-scoring']` | `['deal-score']`, `['deal-score-history']`, `['brand-deal-scores']` |
| `['forecast']` | `['revenue-forecast']`, `['forecast-history']` |
| `['contact-lead-events']` | `['lead-events']` (gia' coperto), `['contact']` |

**Fix:** Aggiornare la mappa con le chiavi corrette.

---

### BUG 3 (BASSO) - Route duplicata `/analytics`
In `App.tsx`:
- Riga 94: `<Route path="/analytics" element={<AdminAnalytics />} />`
- Riga 108: `<Route path="/admin/analytics" element={<AdminAnalytics />} />`

La sidebar punta a `/admin/analytics`. La route `/analytics` non e' raggiungibile da nessun link nell'interfaccia ed e' codice morto.

**Fix:** Rimuovere la riga 94.

---

### BUG 4 (BASSO) - `NewContactDialog` non usa `useWriteBrandId`
Il componente usa direttamente `currentBrand.id` per le operazioni di scrittura, bypassando la protezione di `useWriteBrandId` che impedisce la creazione nella vista "Azienda Intera". Se un utente admin in vista globale apre il dialog, il contatto verrebbe creato sotto il system brand UUID.

**Fix:** Usare `useWriteBrandId` e disabilitare il bottone "Nuovo contatto" nella vista globale tramite `isGlobalView`.

---

### BUG 5 (BASSO) - `QueryClient` creato senza opzioni di retry/stale
Il `QueryClient` in `App.tsx` (riga 45) e' istanziato senza configurazione. Per un'app in produzione, bisogna configurare: `retry`, `staleTime`, `refetchOnWindowFocus` per evitare eccesso di richieste quando l'utente torna nella tab.

**Fix:** Aggiungere configurazione default ragionevole.

---

## Implementazione

### Passo 1 - Fix `__ALL_BRANDS__` (4 file)
Per ogni file coinvolto:
1. Importare `useBrand` (o aggiungere `isAllBrandsSelected` al destructuring esistente)
2. Sostituire `currentBrand?.id === '__ALL_BRANDS__' ? COMPANY_BRAND_ID : currentBrand?.id` con una logica che usa `isAllBrandsSelected ? COMPANY_BRAND_ID : currentBrand?.id`

### Passo 2 - Fix query key map in `useGlobalRealtime.ts`
Aggiornare `TABLE_QUERY_MAP`:
```text
deals: [['deals'], ['deal-score'], ['brand-deal-scores'], ['pipeline-stages'], ['revenue-forecast'], ['forecast-history']]
```
Rimuovere `['contact-lead-events']` e aggiungere `['contact']` per gli eventi lead.

### Passo 3 - Rimuovere route duplicata
Rimuovere `<Route path="/analytics" ...>` da App.tsx (riga 94).

### Passo 4 - Fix `NewContactDialog`
Sostituire l'uso diretto di `currentBrand` con `useWriteBrandId` per le operazioni di INSERT, e disabilitare il bottone nella vista globale.

### Passo 5 - Configurare `QueryClient`
Aggiungere configurazione default:
```text
defaultOptions: {
  queries: {
    staleTime: 1000 * 60,       // 1 minuto
    retry: 1,
    refetchOnWindowFocus: false, // evita tempeste di richieste
  }
}
```

## Riepilogo

| # | Severita' | Area | Impatto |
|---|-----------|------|---------|
| 1 | CRITICO | Company finance, CEO dashboard, tax, cost centers | Vista globale mostra dati errati o vuoti |
| 2 | MEDIO | Realtime invalidation | Deal scoring e forecast non si aggiornano in realtime |
| 3 | BASSO | Routing | Route morta, nessun impatto funzionale |
| 4 | BASSO | Contatti - creazione | Possibile creazione sotto brand errato in vista globale |
| 5 | BASSO | Performance | Eccesso di richieste su cambio tab |
