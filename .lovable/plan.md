## Performance percepita

### 1. Layout shift — `min-h` sulle card della Dashboard

Oggi `DashboardKpiGrid` mostra Skeleton senza altezza fissa: la card collassa quando arriva il dato (testi più piccoli/più grandi del placeholder) → CLS visibile.

- **`src/components/dashboard/DashboardKpiGrid.tsx`**: aggiungo `className="min-h-[110px]"` alla `<Card>` (sia loading che caricato), così l'altezza è fissa e il numero KPI non spinge il layout.
- **`src/components/ceo/CeoOperationalCards.tsx`** e **`CeoKpiCards.tsx`**: stessa cosa, `min-h-[120px]` sulle card.
- **`CeoExpensesPanel` / `CeoBudgetPanel` / `CeoCostBreakdown` / `BudgetBaselineCard`**: contenitori con `min-h-[280px]` per evitare che la griglia a 2 colonne si riposizioni quando i dati arrivano in tempi diversi.
- **`DashboardShell`**: wrappo `{children}` in un div con `min-h-[60vh]` come fallback per evitare flash di pagina vuota.

Niente token nuovi: solo classi Tailwind utility.

### 2. Skeleton strutturali (page-shape, non rettangoli)

Creiamo 2 skeleton "schema-pagina" riutilizzabili:

- **Nuovo `src/components/dashboard/skeletons/DashboardPageSkeleton.tsx`** — replica la struttura: header (titolo + breadcrumb), riga 4 KPI card (con icona placeholder in alto a destra), griglia 2 card grandi, tabella con 5 righe placeholder. Usa lo stesso layout grid del componente reale così la transizione non sposta nulla.
- **Nuovo `src/components/dashboard/skeletons/CeoDashboardSkeleton.tsx`** — pattern dedicato CEO: KPI period selector (riga top), 4 operational cards, 4 financial KPI cards, pipeline overview (5 stage bars), 2 colonne expense/budget panels. Sostituisce il blocco generico in `CeoDashboardView` (linee 67–76).
- **`CeoDashboardView`**: il blocco `isLoading && <Skeleton…>` viene sostituito con `<CeoDashboardSkeleton />`.
- **`Dashboard.tsx`** e **`DashboardOverview.tsx`**: durante loading mostrano `<DashboardPageSkeleton />`.
- **`PageLoader`** rimane per il fallback Suspense; le skeleton strutturali sono per gli stati "componente caricato, dati ancora in volo".

Ogni skeleton usa le stesse classi `min-h-*` del componente vero → zero CLS al swap.

### 3. Prefetch al hover sui link di navigazione

- **Nuovo `src/hooks/usePrefetchOnHover.ts`** — esporta `prefetchForRoute(path, queryClient, ctx)` con una mappa path→prefetch:
  - `/dashboard*` → ricarica le 5 query già in `usePrefetchOnLogin` (fattorizzo l'array in un modulo condiviso `src/lib/prefetchRecipes.ts` per evitare duplicazione).
  - `/contacts` → query `['contacts', brandKey, undefined]`.
  - `/pipeline` → `['pipeline-stages']` + `['deals', brandKey]`.
  - `/tickets` → `['tickets', brandKey, 'open']`.
  - `/appointments` → `['appointments', brandKey, today]`.
  - Default: nessun prefetch (no-op silenzioso).
- **`src/components/layout/MainLayout.tsx`** (riga 322 `renderItem`): aggiungo `onMouseEnter` e `onFocus` su `SidebarMenuButton` che chiama `prefetchForRoute(item.path, queryClient, { brandIds, isAllBrandsSelected })`. Debounce 80ms via `setTimeout` cancellato su `onMouseLeave` per evitare prefetch su hover di passaggio.
- Le ricette riutilizzano `staleTime` esistenti → se la query è già fresh, TanStack Query è no-op.
- **Coordinazione con `usePrefetchOnLogin`**: estraggo la logica delle 5 query in `prefetchRecipes.ts`, sia il login-prefetch sia l'hover-prefetch importano lo stesso modulo. Niente regressioni, comportamento identico al login.

### 4. CEO Dashboard — consolidamento query

**Stato attuale** (verificato leggendo `CeoDashboardView.tsx`):
- Solo 2 RPC pesanti per il "core dashboard": `get_ceo_dashboard_kpis` + `get_ceo_operational_kpis`.
- Le altre query (`useExpenses`, `useBudgets`, `useExpenseCategories`) sono dentro pannelli **interattivi** (CeoExpensesPanel/CeoBudgetPanel) con dialog di crea/elimina: sono CRUD vivi, NON candidati alla consolidazione (perché altrimenti dovremmo invalidare tutto il blob ad ogni mutazione, peggiorando UX).

**Proposta misurata** (no over-engineering):
- **Nuova RPC `get_ceo_dashboard_bundle(p_brand_id, p_brand_ids?, p_from, p_to)`** che ritorna `{ financial: <get_ceo_dashboard_kpis output>, operational: <get_ceo_operational_kpis output> }` chiamando internamente le due funzioni esistenti (riuso, niente ri-implementazione SQL). `SECURITY DEFINER`, `search_path = public`, autorizzazione via `has_role(get_user_id(auth.uid()), 'ceo' OR 'admin')`.
- **Nuovo hook `useCeoDashboardBundle(from, to)`** — singola query, ritorna `{ financial, operational }`. Mantiene gli stessi `staleTime: 2min` / `refetchInterval: 5min`.
- **`CeoDashboardView`**: sostituisce `useCeoDashboard` + `useCeoOperationalKpis` con `useCeoDashboardBundle`. **Mantiene** i due hook esistenti (deprecati, non rimossi) per evitare di rompere altri consumer (cerco con `rg useCeoDashboard\\|useCeoOperationalKpis` per verificare).
- **Tabelle/CRUD**: `useExpenses`/`useBudgets` rimangono separate per poter invalidare in modo granulare dopo create/delete senza rifetchare il bundle pesante.

**Risultato**: 2 round-trip → 1 round-trip per il primo paint del CEO (≈50% latenza percepita sul header KPI). Le mutazioni sui pannelli sotto restano invariate.

### Out of scope

- Concatenazione di tutte le query Expense/Budget/Categories nel bundle (peggiorerebbe le mutazioni interattive).
- Service Worker route caching (gestito già da PWA Cache Auth Hardening).
- Migrazione altre dashboard (Salesperson/Callcenter): valutabile dopo aver misurato l'impatto sul CEO.

### File toccati / creati

**Nuovi:**
- `src/components/dashboard/skeletons/DashboardPageSkeleton.tsx`
- `src/components/dashboard/skeletons/CeoDashboardSkeleton.tsx`
- `src/lib/prefetchRecipes.ts` (estrazione condivisa)
- `src/hooks/usePrefetchOnHover.ts`
- `src/hooks/useCeoDashboardBundle.ts`
- 1 migration SQL: `get_ceo_dashboard_bundle()` (composizione delle 2 RPC esistenti)

**Modificati:**
- `src/components/dashboard/DashboardKpiGrid.tsx` (min-h su Card)
- `src/components/ceo/CeoOperationalCards.tsx`, `CeoKpiCards.tsx`, `CeoExpensesPanel.tsx`, `CeoBudgetPanel.tsx`, `CeoCostBreakdown.tsx`, `BudgetBaselineCard.tsx` (min-h)
- `src/components/dashboard/DashboardShell.tsx` (min-h fallback)
- `src/pages/dashboard/CeoDashboardView.tsx` (skeleton strutturale + bundle hook)
- `src/pages/Dashboard.tsx`, `src/pages/dashboard/DashboardOverview.tsx` (skeleton strutturale)
- `src/hooks/usePrefetchOnLogin.ts` (refactor verso `prefetchRecipes`)
- `src/components/layout/MainLayout.tsx` (hover prefetch su `renderItem`)

**Memory aggiornata**: `mem://technical/performance-perceived` (nuova) — pattern min-h su card dashboard, skeleton strutturali, hover-prefetch via prefetchRecipes, bundle RPC pattern.
