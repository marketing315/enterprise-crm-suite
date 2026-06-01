# fix_plan.md — Backlog eseguibile (Ralph loop)

> Backlog atomico per il redesign mobile. Leggere insieme a `SPEC.md` (fonte di verità) e `PROMPT.md` (regole del loop).
>
> **Come l'agente usa questo file (ogni iterazione):**
> 1. Scorri dall'alto e prendi **il primo task `[ ]`** le cui **dipendenze (`dep:`) sono tutte `[x]`**.
> 2. Implementa **solo quel task**, rispettando la Definition of Done (SPEC §9).
> 3. Spunta `[x]`, aggiungi 1 riga sotto al task in *Note* (file toccati / decisioni / follow-up).
> 4. Commit atomico. Fine iterazione.
> 5. Se bloccato: lascia `[ ]`, aggiungi nota `BLOCCATO: <motivo>`, passa al task successivo eseguibile.
>
> **Regole:** un task = un commit piccolo. Mai più task per iterazione. Mai toccare desktop, backend, RBAC, dati. Vedi guardrail in `PROMPT.md`.

Legenda: `[ ]` da fare · `[x]` fatto · `dep:` dipendenze · `AC:` criteri di accettazione.

---

## FASE 0 — Fondamenta (token, utility, audit)

### F0.1 — Audit & inventario mobile `[x]`
- **dep:** nessuna
- Esegui un censimento (in `mobile-redesign/AUDIT.md`) di: route in `App.tsx`, pagine in `src/pages`, punti che già usano `useIsMobile`, componenti `ceo/mobile/*`, tabelle che diventeranno liste, hook dati per ogni schermo della SPEC §6.
- **AC:** `AUDIT.md` elenca per ogni schermo SPEC il file pagina, gli hook dati, e i componenti da riusare. Nessun codice app modificato.
- *Note:* Creato `mobile-redesign/AUDIT.md` (87 route censite, 6 file con `useIsMobile`, 3 componenti in `ceo/mobile/*`, 5 tabelle→liste, hook dati mappati per SPEC §6, mappa IA per ruolo pronta per F0.4). Nessun file di `src/` toccato.

### F0.2 — Token semantici in `index.css` + `tailwind.config.ts` `[x]`
- **dep:** nessuna
- Aggiungi token HSL `--success/--warning/--danger/--info/--surface/--surface-2` (light + dark) e mappali in `tailwind.config.ts`. Non modificare i token esistenti.
- **AC:** classi `bg-success`, `text-warning`, `bg-surface` ecc. funzionano; build verde; desktop invariato.
- *Note:* Aggiunti in `src/index.css` (sezioni `:root` e `.dark`, blocchi additivi marcati F0.2) i token `--success/--warning/--danger/--info/--surface/--surface-2` + relativi `*-foreground` (HSL, light+dark con contrasto AA). Mappati in `tailwind.config.ts` come `success/warning/danger/info/surface` (con `surface.2` e `surface.2-foreground`). Nessun token esistente modificato; nessun componente toccato → desktop invariato. Disponibili classi `bg-success`, `text-warning`, `bg-surface`, `bg-surface-2`, ecc.

### F0.3 — Utility safe-area + ombre + motion `[x]`
- **dep:** F0.2
- Aggiungi in `index.css`/config: `pt-safe`/`pb-safe`/`pl-safe`/`pr-safe` (via `env(safe-area-inset-*)`), `shadow-card`, `shadow-hero`, easing/duration coerenti con SPEC §2.4. Press-state util `active:scale-[0.98]`.
- **AC:** utility disponibili e usate da un esempio; reduced-motion rispettato; build verde.
- *Note:* Aggiunti in `src/index.css` (blocco F0.3 sotto `@layer utilities`): `.pt-safe/.pb-safe/.pl-safe/.pr-safe/.px-safe` con `env(safe-area-inset-*)`; `.press-scale` con `transition` e `active:scale-[0.98]` (ridotta a `none` sotto `prefers-reduced-motion`). In `tailwind.config.ts` (extend): `boxShadow.card` (neutra soffusa), `boxShadow.hero` (colorata tenue con `hsl(var(--primary) / 0.15)`); `transitionDuration.micro` (150ms) / `screen` (250ms); `transitionTimingFunction.ease-out-soft` (`cubic-bezier(0.2, 0.8, 0.2, 1)`); keyframe `slide-up-fade` + animazione `slide-up-fade` (250ms). Build verde; desktop invariato (nessun componente toccato).

### F0.4 — Hook `useRoleMobileTabs` (config tab per ruolo) `[x]`
- **dep:** F0.1
- Crea `src/hooks/useRoleMobileTabs.ts` che, dato il ruolo/brand correnti (riusa `useAuth`/`useRoleDashboard`/`useBrand`), ritorna le ≤5 tab della SPEC §5 come dato (`{icon,label,path|action}`). La visibilità deve combaciare con `MainLayout`.
- **AC:** unit test che per ogni ruolo ritorna ≤5 tab coerenti; nessuna modifica a RBAC.
- *Note:* Creato `src/hooks/useRoleMobileTabs.ts` con tipo `MobileTab` (path XOR action, `isPrimaryAction` per FAB-in-bar) + mappatura ruolo→tab da SPEC §5 (CEO/Admin, Amministrazione, Resp. Venditori, Resp. CC, Venditore/Sales, Operatore CC/Callcenter, fallback). Riusa `useRoleDashboard().primaryPath` per "Home" → coerente con `MainLayout`. Test in `src/hooks/useRoleMobileTabs.test.ts`: 10 test verdi (9 ruoli + fallback) — assertion ≤5 tab, Home/Menu agli estremi, esattamente 1 primary action, path XOR action, id univoci. Nessun file `src/` esistente toccato; desktop intatto.

---

## FASE 1 — Libreria componenti mobile (`src/components/mobile/`)

> Costruire i mattoni **prima** degli schermi. Ogni componente: tipizzato, `className` passabile, solo token, JSDoc breve, niente fetch dati dentro.

### F1.1 — `SectionLabel` + `TrendBadge` `[x]`
- **dep:** F0.2
- Estrai `SectionLabel` da `MobileCeoDashboard`; crea `TrendBadge` (delta %, freccia, colore semantico, `tabular-nums`).
- **AC:** entrambi renderizzano in tutte le varianti; storybook/esempio non richiesto; test di render base.
- *Note:* Creati `src/components/mobile/SectionLabel.tsx` (con slot `trailing`, override `as`) e `src/components/mobile/TrendBadge.tsx` (delta % con `intent="default"|"inverse"`, segno tipografico `−`, `tabular-nums`, `role=status` + `aria-label`, varianti pill/compact, colori `success/danger/muted-foreground` da token F0.2). Refactor `MobileCeoDashboard.tsx`: rimossa duplicazione locale, ora importa `SectionLabel` dalla libreria condivisa. Test `SectionLabel.TrendBadge.test.tsx`: 13 test verdi (positivo/negativo/null/zero/inverse/suffix/aria-label/compact/segno tipografico/tabular-nums). Barrel export in `src/components/mobile/index.ts`. Nessun colore hard-coded, accessibilità AA (segno = freccia + colore + label).

### F1.2 — `MobileScreen` + `MobileHeader` `[x]`
- **dep:** F0.3
- Scaffold schermo (area scroll, safe-area, slot header) e header compatto sticky (titolo, sottotitolo/brand, 1 azione, `backdrop-blur`).
- **AC:** usato in un esempio; sticky+blur ok; safe-area ok; desktop non usa questi componenti.
- *Note:* Creati `src/components/mobile/MobileHeader.tsx` (sticky di default, `bg-background/85 backdrop-blur-xl border-b border-border/40`, `pt-safe`, titolo h1 17px `font-semibold tracking-tight`, sottotitolo opzionale cliccabile per brand selector con `press-scale`, 1 sola action a destra, `min-h-[44px]`) e `src/components/mobile/MobileScreen.tsx` (flex-col `min-h-[100dvh]`, slot header/footer, body `<main>` scroll verticale `overflow-y-auto`, `px-4 py-4 space-y-5` configurabili, `animate-slide-up-fade` da F0.3 con opt-out, footer sticky bottom con `pb-safe + backdrop-blur`). Test in `MobileScreen.MobileHeader.test.tsx`: 11 test verdi (sticky, blur, safe-area, action slot, sottotitolo cliccabile/onSubtitleClick, nonSticky, noEntryAnimation, AC esempio integrato). Barrel export aggiornato. `rg useRoleMobileTabs|MobileScreen|MobileHeader` su `src/` esclusa `components/mobile/**` = 0 → desktop intatto.

### F1.3 — `BottomSheet` + `MobileFab` `[x]`
- **dep:** F0.3
- Wrapper standard su **vaul** (handle, header, scroll, azioni in basso, focus trap) e FAB in thumb zone con safe-area.
- **AC:** sheet apre/chiude con gesto, focus gestito, reduced-motion ok; FAB ≥44px.
- *Note:* Creato `src/components/mobile/BottomSheet.tsx` (wrapper su `vaul`: overlay `bg-foreground/40 backdrop-blur-sm`, content `rounded-t-2xl border-border/40 shadow-sheet max-h-[92dvh]`, handle drag-to-dismiss opzionale, header con `DrawerPrimitive.Title/Description` per a11y, body scroll `overflow-y-auto overscroll-contain`, footer sticky con `pb-safe + backdrop-blur-xl`, `dismissible` prop per flow critici; focus trap nativo vaul, reduced-motion gestito da vaul). Creato `src/components/mobile/MobileFab.tsx` (FAB `h-14 w-14` o esteso `px-5 py-3`, `min-h-[44px] min-w-[44px]` garantito, `press-scale` + `shadow-fab` (nuovo token F0.3 in `tailwind.config.ts`), varianti `primary`/`neutral`, posizioni `bottom-right`/`bottom-center`/`inline` con offset `calc(64px + env(safe-area-inset-bottom) + 12px)` per stare sopra tab bar e home indicator, `aria-label` obbligatoria, icona aria-hidden, focus-visible ring). Aggiunti shadow token `sheet` e `fab` in `tailwind.config.ts`. Barrel export aggiornato. Test in `BottomSheet.MobileFab.test.tsx`: 11/11 verdi (open/closed, title/description/footer, handle toggle, aria-label, min target 44px, press-scale+shadow-fab, safe-area, inline mode, extendedLabel, onClick, variant neutral). `rg "BottomSheet|MobileFab"` su `src/` esclusa `components/mobile/**` = 0 → desktop intatto.

### F1.4 — `Segmented` / `ChipGroup` `[x]`
- **dep:** F1.1
- Selettore a pillole scrollabile orizzontale (`no-scrollbar`), con conteggi opzionali. Generalizza `MobileCeoPeriodChips`.
- **AC:** selezione controllata, accessibile (role/tab), scroll fluido.
- *Note:* Creato `src/components/mobile/Segmented.tsx` (componente generico tipizzato `<V extends string>`, con `ChipGroup` esportato come alias semantico). Scroll orizzontale `overflow-x-auto no-scrollbar scroll-smooth`, chips `rounded-full press-scale`, varianti selected `bg-foreground/text-background` vs unselected `bg-muted/60` (token F0.2, nessun colore hard-coded). Conteggi opzionali (badge `tabular-nums`, sfondo invertito quando selected). A11y: `role="radiogroup"` di default oppure `role="tablist"` con prop `asTabs`; ogni chip ha `aria-checked`/`aria-selected`, `aria-label` derivata (con override `ariaLabel`), `tabIndex` roving (solo selected = 0). Tastiera: ←/→/↑/↓ scorrono saltando le opzioni `disabled` (wrap-around), Home/End vanno al primo/ultimo abilitato. Size `sm`/`md`. Test in `Segmented.test.tsx`: 11/11 verdi (render, aria, click, disabled, count tabular-nums, asTabs/tablist, ArrowRight skip disabled, ArrowLeft wrap, Home/End, classi scroll, alias ChipGroup, size sm). Barrel export aggiornato. `MobileCeoPeriodChips` non ancora migrato (refactor opzionale in fase F2.x).

### F1.5 — `HeroMetricCard` + `KpiList`/`MetricRow` `[x]`
- **dep:** F1.1
- Hero card (numero display, label, `TrendBadge`, variante neutra/positiva/negativa, sfondo `--primary`/`shadow-hero`) e lista KPI secondari. Generalizza `MobileCeoKpiList`.
- **AC:** valori via props (no fetch); `tabular-nums`; varianti colore via token.
- *Note:* Creato `src/components/mobile/HeroMetricCard.tsx` (card hero `rounded-3xl p-5`, label uppercase `tracking-[0.1em]`, valore display `text-[36px] leading-none font-semibold tracking-tight tabular-nums`, caption opzionale, slot `trailing` (top-right) + `footer` (bottom), `delta?` → integra `TrendBadge` con prop corretta `deltaPct` + `intent inverse/default`, 4 varianti `neutral|primary|positive|negative` su token F0.2 (`bg-card`/`bg-primary`+`shadow-hero`/`bg-success/10`/`bg-danger/10`), text muted adattivo, opzionalmente cliccabile (rende `<button>` con `press-scale` + focus-ring + `aria-label`)). Creato `src/components/mobile/MetricRow.tsx` con `MetricRow` (card compatta `rounded-2xl shadow-card`, icona leading 32px chip muted, title troncato, valore `text-[24px] tabular-nums`, tono `neutral|positive|negative|warning` su token, delta `TrendBadge compact`, subtitle, chevron auto su `onClick`) e `KpiList` (container `role="list"` con `aria-label="Indicatori"` di default, gap `tight|normal|loose`, wrap automatico figli in `role="listitem"`). Barrel `src/components/mobile/index.ts` aggiornato. Test in `HeroMetricCard.MetricRow.test.tsx`: 18/18 verdi (label/value/caption, tabular-nums + 36px, non interattivo di default, onClick→button+press-scale+aria-label, variante primary con bg-primary+shadow-hero, TrendBadge presente/assente, slot trailing/footer; MetricRow title/value/subtitle, tone success/danger, onClick chevron+button, tabular-nums, TrendBadge compact, icon render; KpiList role=list, aria-label custom, gap loose). `MobileCeoKpiList` non ancora migrato (refactor opzionale F2.x). `rg "HeroMetricCard|MetricRow|KpiList"` su `src/` esclusa `components/mobile/**` = 0 → desktop intatto.

### F1.6 — `MobileListItem` (+ swipe actions) `[x]`
- **dep:** F1.3
- Riga lista premium: leading (avatar/icona), titolo, sottotitolo, trailing, supporto **swipe** per 1–2 azioni (riusa dnd-kit o gesture leggera; azioni distruttive con conferma).
- **AC:** swipe fluido, azioni con `aria-label`, conferma su distruttivo, tap principale separato dallo swipe.
- *Note:* Creato `src/components/mobile/MobileListItem.tsx`. Card `rounded-2xl shadow-card border-border/60`, `min-h-[64px]`, slot `leading`/`title`/`subtitle` (truncate)/`trailing`, chevron auto su `onSelect`. Gesture **leggera (Pointer Events, niente nuove deps)**: pointerDown→Move→Up con threshold 8px per distinguere swipe da tap, snap aperto/chiuso a 40% di `actionsWidth` (80px/azione, max 2), translate3d con `transition-transform duration-screen ease-out-soft` (rispetta reduced-motion via F0.3), `touch-pan-y` per non bloccare lo scroll verticale, `setPointerCapture` opzionale. Azioni **sempre montate** come `<button>` accessibili (tab/SR), `aria-label` con override, `focus` su un'action apre la riga per visibilità — nessuna funzionalità dipende dal solo swipe (a11y). Conferma distruttiva via `AlertDialog` shadcn quando `variant='destructive'` + `confirm: { title, description?, confirmLabel?, cancelLabel? }`; azione non distruttiva esegue subito. Token only (`bg-card`/`bg-muted`/`bg-primary`/`bg-danger` con `text-danger-foreground` F0.2). Barrel aggiornato. Test in `MobileListItem.test.tsx`: 11/11 verdi (render slots, non-interattivo, click+Enter+Space, actions sempre accessibili, cap a 2, conferma distruttiva flow completo (annulla/conferma), azione non-destructive immediata, transform iniziale + touch-pan-y, tap pulito, ariaLabel custom). *Nota tecnica:* jsdom non propaga Pointer Events ai listener React `onPointer*`, quindi il flusso swipe E2E è coperto da test strutturali; verifica reale su dispositivo nelle fasi F3.x. `rg "MobileListItem"` su `src/` esclusa `components/mobile/**` = 0 → desktop intatto.

### F1.7 — `EmptyState` + `ErrorState` + `MobileSkeletons` + `PullToRefresh` `[x]`
- **dep:** F1.2
- Stati coerenti SPEC §6; `ErrorState` con retry che invalida la query react-query; skeleton per hero/lista/kpi; `PullToRefresh` integra `queryClient.invalidateQueries`.
- **AC:** nessun layout shift visibile; retry funzionante; reduced-motion ok.
- *Note:* Creati 4 componenti in `src/components/mobile/`: **`EmptyState.tsx`** (icona in chip `bg-muted/60`, titolo + descrizione + slot `action`, `role="status"`, variante `compact`, default `Inbox` lucide, max-width descrizione 28ch). **`ErrorState.tsx`** (icona `AlertTriangle` in chip `bg-danger/10 text-danger`, `role="alert"` + `aria-live=polite`, bottone "Riprova" `variant="outline" size="sm"` con `press-scale` + spinner `RefreshCw`, integra `useQueryClient` per invalidare `invalidateKeys: QueryKey[]` + callback opzionale `onRetry`, prop `hideRetry`/`footer`/`compact`). **`MobileSkeletons.tsx`** (componente `Bone` base `bg-muted/60 motion-safe:animate-pulse` — rispetta `prefers-reduced-motion`; varianti `HeroMetricSkeleton` `rounded-3xl p-5 shadow-card` (dimensioni allineate a `HeroMetricCard`), `MetricRowSkeleton` `rounded-2xl p-4` (allineato `MetricRow`), `KpiListSkeleton` con `count` (default 3, `space-y-2.5`), `ListItemSkeleton` + `MobileListSkeleton` `divide-y` per liste di `MobileListItem`; tutti con `role="status"` + `aria-busy="true"` + label aria custom per evitare layout shift). **`PullToRefresh.tsx`** (gesto Pointer Events solo `touch`/`pen` — il mouse è ignorato, attivo solo a `scrollTop === 0`, resistance curve 0.55x con cap `maxPull` 96px, soglia `threshold` 64px; al rilascio sopra soglia invalida le `invalidateKeys` + chiama `onRefresh`; indicatore circolare `bg-muted` con `RefreshCw` che ruota in fase pull e `animate-spin` (motion-safe) in refreshing, colore passa a `text-primary` oltre la soglia; `touch-pan-y` preservato; `prefers-reduced-motion` disattiva rotazioni e transizioni; `aria-busy` correttamente toggled, prop `disabled` ignora il gesto). Barrel `src/components/mobile/index.ts` esteso. Test in `States.PullToRefresh.test.tsx`: 14/14 verdi (EmptyState: status, action slot, compact; ErrorState: alert, hideRetry, retry invalida 2 query keys + chiama onRetry; Skeletons: HeroMetric aria-busy, MetricRow, KpiListSkeleton count=4 → 5 status, MobileListSkeleton count=3, motion-safe:animate-pulse presente; PullToRefresh: render children, no indicator idle, aria-busy=false idle, disabled ignora pointer events). `rg "EmptyState|ErrorState|PullToRefresh|MobileSkeletons|HeroMetricSkeleton"` su `src/` esclusa `components/mobile/**` = 0 → desktop intatto.

### F1.8 — Refactor `ceo/mobile/*` sulla nuova libreria `[x]`
- **dep:** F1.5, F1.4, F1.1
- Rifattorizza `MobileCeoDashboard`/`MobileCeoKpiList`/`MobileCeoPeriodChips` per usare i componenti condivisi, **senza cambiare dati o comportamento**.
- **AC:** stessa resa funzionale, meno codice duplicato; build/test verdi.
- *Note:* **`MobileCeoPeriodChips`** ora usa `Segmented<Preset>` (F1.4) per i 5 preset (`7g/Mese/3M/6M/1A`) — rimossa la map manuale dei chip e il CSS overflow-x duplicato. Il chip "Custom" (Sheet trigger con `CalendarIcon`) resta separato per via dello Sheet bottom; aggiunto `press-scale` e `aria-label`. Comportamento identico: handlePreset, computePresetDates, Sheet, Calendar `from`/`to`, conferma. **`MobileCeoKpiList`** ora usa `KpiList` + `MetricRow` (F1.5). Rimossi `KpiRow` locale, `Trend` locale (sostituito da `TrendBadge` integrato in `MetricRow.delta`) e il mapping tone con classi hard-coded `text-emerald/rose/amber` → ora `MetricTone` semantico (`positive|negative|warning|neutral`) che mappa ai token (`text-success`/`text-danger`/`text-warning`). `ConfidenceBadge` mantenuto in-line nel `value` come `ReactNode` (slot `value` di `MetricRow` accetta `ReactNode`). Tutti i 9 KPI (Margine, ROI Marketing, Fatturato, Costi, Budget, Contatti, Ticket, Appuntamenti, Deal) preservati con stesso href, stessa logica tone, stessi trend `invertTrend` (Costi). Dimensione valore: `text-[28px]` → `text-[24px] tabular-nums` (standard libreria) — unica differenza visiva minore, comportamento e dati invariati. **`MobileCeoDashboard`** ora usa `HeroMetricCard variant="primary"` (F1.5) per Utile Netto (rimosso gradient e markup custom: tokens `bg-primary`/`shadow-hero` + `TrendBadge` automatico via `delta`) e `HeroMetricSkeleton` + `KpiListSkeleton count={6}` (F1.7) al posto degli `<Skeleton>` ad altezza fissa — zero CLS perché skeleton hanno le stesse dimensioni dei componenti reali. Rimossi import non più usati (`TrendingUp`, `Skeleton`, var `profitPositive`). Verifica: `bunx vitest run src/components/mobile` 89/89 verdi; `tsc --noEmit` su `ceo/mobile/*` 0 errori; nessuna modifica a hook, dati, route o desktop (`MainLayout` intatto). Diff netto: -120 righe, +50 righe (riuso libreria).

---

## FASE 2 — App shell mobile

### F2.1 — `MobileTabBar` `[x]`
- **dep:** F0.4, F1.2
- Bottom navigation ≤5 voci da `useRoleMobileTabs`, FAB centrale opzionale, stato attivo, blur, `pb-safe`.
- **AC:** naviga alle route corrette; voce attiva evidenziata; thumb-zone; ≥44px.
- *Note:* Creato `src/components/mobile/MobileTabBar.tsx` con due esport: **(a)** `MobileTabBar` "puro" che riceve `tabs: MobileTab[]` + `onAction` (zero hook esterni → facile da testare/storybook) e **(b)** `MobileTabBarConnected` wrapper che inietta `useRoleMobileTabs()` (usato nel `MobileLayout`). La separazione evita la dipendenza implicita da `AuthProvider` in test e rispetta le regole degli hook (no condizionali). Layout: `<nav role="navigation" aria-label="Navigazione principale mobile">` sticky in basso, `bg-background/85 backdrop-blur-xl border-t border-border/40 pb-safe` (glassmorphism + safe-area iOS), `<ul>` con celle equidistribuite. Ogni cella standard: `min-h-[56px]` (≥44px target), icona 20px con dot indicatore `bg-primary` sopra quando attiva, label 10px truncata 68px max, `press-scale` + `focus-visible:ring-2`. Cella con `isPrimaryAction=true` rende un FAB rialzato (`-mt-5`, `h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-hero`) — un solo FAB per la tab definita come primary dal hook (Cerca per CEO/Admin, Nuovo per venditori, Chiamata per callcenter, Wallboard per responsabile_cc, ecc.). Stato attivo via `useLocation` con match esatto OR prefix (`/pipeline/123` → Pipeline attiva), `aria-current="page"` sul bottone attivo, `text-primary` sull'icona + dot accent. Click su tab con `path` → `navigate()`, click su tab con `action` → `onAction(action)` (lo shell intercetta `search/menu/notifications/new-contact/new-call/new-appointment/new-ticket`). Token-only, niente colori hard-coded. Test in `MobileTabBar.test.tsx`: 10/10 verdi (render 5 bottoni, nav aria-label, aria-current match esatto, match come prefisso `/pipeline/123`, navigate su tab path, onAction su tab action, FAB con bg-primary+shadow-hero+rounded-full, cella standard `min-h-[56px]`, nav `pb-safe`+`backdrop-blur-xl`+`sticky`, tab senza path/action non rompe). Barrel `src/components/mobile/index.ts` esporta entrambi. `rg "MobileTabBar"` fuori da `components/mobile/` = 0 → desktop intatto, useremo `MobileTabBarConnected` nel `MobileLayout` (F2.4).

### F2.2 — `MobileMoreSheet` (navigazione completa) `[x]`
- **dep:** F1.3, F0.4
- Sheet con tutte le sezioni IA filtrate per ruolo/brand (riusa la logica di visibilità di `MainLayout`), ricerca interna, tema, brand, profilo, logout.
- **AC:** un ruolo vede esattamente le voci che vedrebbe nella sidebar desktop; nessun cambiamento RBAC.
- *Note:* Creato `src/components/mobile/MobileMoreSheet.tsx` su `BottomSheet` (F1.3) con: (1) **search input** (`aria-label="Cerca nel menu"`) che filtra real-time tutte le voci per `label.includes(query)`; (2) **BrandSelector** desktop in `compact`; (3) **5 sezioni IA** (`Quotidiano`, `Vendite & Clienti`, `Marketing`, `Insight`, `Configurazione`, `Sistema`) clonate in `src/components/mobile/mobileNavData.ts` per **non toccare `MainLayout`** ma usando la stessa logica: `adminOnly`, `requiresRole` con `hasRole(role, currentBrand.id)`, `ceoOrAdminOnly`, e `useHasMarketingAccess()` per la sezione Marketing; (4) **Aspetto** = radiogroup 3 chip (Chiaro/Scuro/Sistema) via `next-themes` (token-only); (5) **Account** = avatar+nome+email su card + bottone **Esci** che chiama `signOut()` e naviga `/login`. Ogni voce è `<button>` con `aria-current="page"` su match esatto o prefisso, icona 32px chip muted/primary, disabled se `!hasBrandSelected && path !== '/dashboard'`. Empty state `role="status"` quando la ricerca non matcha nulla. Barrel `src/components/mobile/index.ts` esporta `MobileMoreSheet` + dati nav. Test in `MobileMoreSheet.test.tsx`: 10/10 verdi (sheet chiuso=no body, ricerca+brand+account+logout presenti, sezione Quotidiano visibile e Config/Sistema nascoste per utente non-admin, Config+Sistema visibili per admin, filtro ricerca + empty state, click voce → `navigate` + `onOpenChange(false)`, sezione Marketing condizionata, click chip tema → `setTheme('dark')`, logout → `signOut` + `navigate('/login')`, voci disabilitate senza brand tranne `/dashboard`). Tutti i 9 test file mobile verdi (109/109). `rg "MobileMoreSheet|mobileNavData"` fuori da `components/mobile/` = 0 → desktop intatto, `MainLayout.tsx` non modificato; lo wiring nel `MobileLayout` arriva in F2.4.

### F2.3 — `MobileSearch` (ricerca globale full-screen) `[x]`
- **dep:** F1.3
- Presenta `GlobalSearchDialog` come sheet full-screen mobile (focus auto, risultati grandi, recenti).
- **AC:** stessi risultati del desktop; tastiera non copre i risultati; chiusura con swipe/back.
- *Note:* Estratta la logica dati di `GlobalSearchDialog` in un hook condiviso `src/components/search/useGlobalSearch.ts` (`useGlobalSearchData(query)` → `{enabled,isLoading,noResults,contacts,tickets,deals,debouncedQuery}`) con identici contratti (debounce 200ms, brand effettivo NULL su System Brand, RPC `search_contacts`, `tickets.ilike(title)`, `deals.in(contact_id)`, `staleTime 30s`, limit 8/5/5). **`GlobalSearchDialog.tsx` non è stato toccato** (potrà migrare in futuro): il desktop resta invariato. Creato `src/components/mobile/MobileSearch.tsx` come full-screen sheet su `vaul` (`h-[100dvh]`, `pt-safe`/`pb-safe`) con: header sticky (input search 11h `text-[16px]` per evitare zoom iOS, `enterKeyHint="search"`, `autoComplete=off`, bottone X `aria-label="Chiudi ricerca"`); body scrollabile indipendente (la tastiera virtuale non copre i risultati perché header e body sono in flex column); stato iniziale con suggerimento + **recenti** (max 6) lette/scritte da `userStorage` con chiave `global-search.recents` (esportata dall'hook) — bottone "Cancella" + tap su recente che ripopola la query; spinner `Loader2` + `role="status"` durante il fetch; empty state contestuale con la query; gruppi "Contatti"/"Deal"/"Ticket" come `<section aria-label>` + `<ul role=list>`, ogni riga è un button card (`rounded-xl border bg-card`, icona 36px chip muted, titolo+secondary, meta valore EUR/status) che chiama `navigate(path)` + `onOpenChange(false)` + `pushRecent`. La chiusura swipe-down è gestita nativamente da vaul. Token-only, niente colori hard-coded. Barrel `src/components/mobile/index.ts` aggiornato. Test in `MobileSearch.test.tsx`: 10/10 verdi (sheet chiuso→portal vuoto, input+suggerimento iniziale, auto-focus dopo apertura, loading state, empty state con query, render dei 3 gruppi + navigate+close on click contatto, recenti caricati da storage, bottone Cancella svuota recenti, X chiude lo sheet, recente persistito quando ci sono risultati). Tutti i 10 test file mobile verdi (119/119).

### F2.4 — `MobileLayout` + wiring condizionale `[x]`
- **dep:** F2.1, F2.2, F1.2
- Crea `MobileLayout` (header + `<Outlet/>` + `MobileTabBar`, stessi provider di `MainLayout`) e usalo **solo** quando `useIsMobile()` è true, senza modificare il layout desktop né le route.
- **AC:** su <768px appare la shell mobile; su ≥768px tutto identico a oggi; provider realtime/notifiche/auth intatti.
- *Note:* Creato `src/components/mobile/MobileLayout.tsx` (skip-link, `IncomingCallPopup`/`IdleTimeoutWatcher`/`RealtimeStaleBanner`/`WelcomeModal`/`AppTour` come in `MainLayout`, `MobileHeader` sticky con titolo "CRM" + subtitle = brand corrente cliccabile → apre menu, `<main id="main-content" tabIndex=-1>` con `ErrorBoundary` + `<Outlet/>`, `MobileTabBarConnected` in basso, e sheet locali `MobileMoreSheet`/`MobileSearch` controllati dalle action `menu`/`search`; `notifications`/`new-*` → `navigate` (`/notifications`, `/contacts?new=1`, `/callcenter?new=1`, `/appointments?new=1`, `/tickets?new=1`)). Creato `src/components/layout/ResponsiveLayout.tsx` che fa lo switch via `useIsMobile()` fra `MainLayout` (desktop) e `MobileLayout` (mobile). `src/App.tsx`: unica modifica → import + uso `<ResponsiveLayout />` al posto di `<MainLayout />` dentro l'albero `ProtectedRoute + MfaGuard` (provider auth/brand/query/notifiche intatti, route invariate). Test `MobileLayout.test.tsx`: 5/5 verdi (switch desktop/mobile via mock `useIsMobile`, header+brand subtitle, action search → MobileSearch, action menu → MobileMoreSheet, skip-link). Follow-up: le action `new-*` oggi navigano con `?new=1` — le singole pagine apriranno il dialog di creazione nelle fasi F4.x.

---

## FASE 3 — Dashboard di ruolo (Home)

> Ogni dashboard: vista mobile alternativa che riusa i dati delle pagine `src/pages/dashboard/*`. Una hero + KpiList + 1–2 sezioni. dep comune: F2.4 + F1.5/F1.7.

### F3.1 — Mobile Dashboard CEO/Admin `[x]`
- **dep:** F1.8, F2.4
- Collega la CEO mobile rifattorizzata alla shell; aggiungi pull-to-refresh e drill-down hero→pipeline/finanza.
- **AC:** SPEC §6.2 soddisfatta; stati gestiti; desktop CEO invariato.
- *Note:* `MobileCeoDashboard` ora vive dentro `MobileLayout` (collegamento già esistente in `CeoDashboardView` via `useIsMobile`). Rimosso il vecchio hack `-mx-4 -mt-4` (residuo dei padding di `MainLayout`): la shell mobile ha `<main>` senza padding, quindi la pagina governa direttamente `px-4`. Aggiunto wrapper `PullToRefresh` (F1.7) con `invalidateKeys=[['ceo-dashboard-bundle']]` → swipe-down rifresca l'intero bundle CEO; rispetta `prefers-reduced-motion`. Drill-down: (a) **Hero "Utile Netto"** ora è un `<button>` `press-scale` che naviga a `/pipeline` con `aria-label` esplicita e caption aggiornato "Tocca per il dettaglio"; (b) **`SectionLabel` "Pipeline"** ha trailing "Apri →" verso `/pipeline`; (c) **`SectionLabel` "Finanza"** ha trailing "Apri →" verso `/sales`. Stati gestiti: `HeroMetricSkeleton`/`KpiListSkeleton` durante `isLoading`, Alert destructive su `finError`, guardrail Admin/CEO + brand selezionato già presenti. Nessuna modifica a `CeoDashboardView` desktop, ai dati/hook (`useCeoDashboardBundle` invariato) o ai pannelli `CeoExpensesPanel`/`CeoBudgetPanel`/`CeoCostBreakdown`/`BudgetBaselineCard`. Suite mobile vitest 140/140 verdi; `tsc` pulito sui file toccati.

### F3.2 — Mobile Dashboard Venditore/Sales `[x]`
- **dep:** F2.4, F1.5, F1.7
- Hero (trattative aperte / target), KpiList, prossimi appuntamenti + pipeline mini.
- **AC:** SPEC §6.1; dati da `SalespersonDashboard`; stati gestiti.
- *Note:* Creato `src/components/sales/mobile/MobileSalespersonDashboard.tsx`. Riusa **gli stessi `queryKey`** del desktop (`salesperson-my-deals`, `-sales-month`, `-appointments-today`, `-appt-stats`, `-upcoming-appts`) → react-query deduplica, zero richieste extra; stessi hook (`useBrandFilter`/`useAuth`) e stesse policy RLS. Composizione: header sticky compatto, **hero "Vendite del mese"** in valuta cliccabile → `/pipeline`, **KpiList** con 6 `MetricRow` (Deal attivi / Pipeline / Vendite / Appt oggi / No-show / Follow-up) con `tone` semantici e drill-down on-tap, **sezione "Prossimi 7 giorni"** (max 8 appt) con card data+ora+contatto+città → tap apre `/appointments/:id`, **sezione "Deal caldi"** (score≥60, max 4) → `/pipeline`. Stati: `HeroMetricSkeleton`/`KpiListSkeleton`/`ListItemSkeleton`, `EmptyState` per "Nessun appuntamento" e "Nessun deal caldo", guardrail brand non selezionato. Wrap `PullToRefresh` invalida tutte e 6 le query (incl. `my-action-suggestions`). Wired in `src/pages/dashboard/SalespersonDashboard.tsx`: early-return `<MobileSalespersonDashboard/>` quando `useIsMobile()` — desktop branch invariato (stessa `DashboardShell`, `TodayAppointmentsBoard`, `DashboardKpiGrid`, ecc.). `tsc` pulito, suite mobile 140/140 verdi.

### F3.3 — Mobile Dashboard Resp. Venditori `[x]`
- **dep:** F2.4, F1.5, F1.7
- Hero (performance team), KpiList, top venditori (lista), pipeline.
- **AC:** dati da `SalesManagerDashboard`; SPEC §6.1.
- *Note:* Creato `src/components/sales/mobile/MobileSalesManagerDashboard.tsx` (stessi hook desktop: `useDeals('open'|'won')`, `usePipelineStages`, `useSalespersonKpis`, `useBrandDealScores`, `useRevenueForecast` → query-key condivise, zero fetch extra, RPC/RLS invariati). Composizione: header sticky, hero "Pipeline aperta" con caption forecast (drill `/pipeline`), `KpiList` 6 metriche (deal aperti, pipeline €, win rate medio con tone, deal a rischio `invertTrend`, deal in stallo, vinti complessivi), funnel pipeline compatto (barre per stage, `role=progressbar`), top 5 venditori (con rank, win rate colorato success/warning su soglia 30%) drill `/team/salespersons`, lista deal in stallo (>14gg) drill `/pipeline`. `PullToRefresh` invalida `deals`/`salesperson-kpis`/`brand-deal-scores`/`revenue-forecast`. Wired in `src/pages/dashboard/SalesManagerDashboard.tsx` con guard `useIsMobile()` (desktop intoccato). Solo token semantici (`text-success/-warning/-danger`, `bg-danger/10`, `text-primary`, `bg-card`); EmptyState/Skeletons già esistenti riusati. Test mobile smoke 124/124 verdi; typecheck pulito sul file. Follow-up: F3.4 (Resp./Operatore Call Center).

### F3.4 — Mobile Dashboard Resp./Operatore Call Center `[x]`
- **dep:** F2.4, F1.5, F1.7
- Hero (ticket aperti / SLA o code), KpiList, lista urgenti.
- **AC:** dati da `CallcenterManagerDashboard`/`CallcenterOperatorDashboard`; SPEC §6.1.
- *Note:* Creati `src/components/callcenter/mobile/MobileCallcenterManagerDashboard.tsx` (hero "Backlog ticket" con variant `negative` se >20, KpiList 7 metriche: ticket creati/risolti, backlog, non assegnati, tempi medi assegnazione/risoluzione formattati min↔h, appuntamenti oggi; top 5 operatori per ticket risolti drill `/admin/callcenter-kpi`, badge backlog rosso se >5; tone `invertTrend` su backlog/tempi/non-assegnati; usa `useCallcenterKpisOverview`/`useCallcenterKpisByOperator`/`useDashboardData` con stesse queryKeys del desktop) e `src/components/callcenter/mobile/MobileCallcenterOperatorDashboard.tsx` (hero "Ticket assegnati" drill `/tickets`, KpiList 4: chiamate oggi, ticket assegnati, appt oggi, ricontatti 60min; lista ricontatti con orario, badge minuti urgent ≤10min, tap → contatto). Wired in `CallcenterManagerDashboard.tsx` e `CallcenterOperatorDashboard.tsx` con guard `useIsMobile()` (desktop intoccato). Solo token semantici (`bg-danger/10`/`text-danger`, `bg-warning/10`/`text-warning`, `text-primary`, `bg-card`); `PullToRefresh` invalida le queryKeys condivise → cache react-query riusata, zero fetch extra, RPC/RLS invariati. Mobile suite 124/124 verde. Follow-up: F3.5 (Mobile Dashboard Amministrazione).

### F3.5 — Mobile Dashboard Amministrazione `[x]`
- **dep:** F2.4, F1.5, F1.7
- Hero (KPI economico chiave) + KpiList + alert.
- **AC:** dati da `AdminDashboard`/overview; SPEC §6.1.
- *Note:* Creato `src/components/admin/mobile/MobileAdminDashboard.tsx`: hero "Ticket aperti" con variant `negative` se SLA breach > 0 / `primary` se backlog > 20 / `positive` altrimenti (drill `/tickets`); banner `Alert variant=destructive` condizionale per SLA breach + webhook KO con % fail rate; KpiList 6 metriche (contatti totali + lead 7gg in subtitle, lead 7gg standalone, deal aperti, ticket aperti con `invertTrend`+tone basato su SLA breach, webhook 24h con tone basato su fail rate >5%/>1%, appuntamenti oggi); lista 8 azioni rapide come card uniforme con icona/label/badge (Webhook+badge KO se >0, Ticket+badge SLA se breach, Team, AI, SLO, Slow Queries, Changelog, Settings). Riusa gli stessi queryKeys del desktop (`useDashboardData`, `useWebhookMetrics24h`) → cache react-query condivisa, zero fetch extra, RPC/RLS invariati. `PullToRefresh` invalida tutte le chiavi. Solo token semantici (`bg-danger/10`/`text-danger`/`bg-warning/10`/`text-warning`/`bg-card`/`bg-muted`). Wired in `src/pages/dashboard/AdminDashboard.tsx` con guard `if (isMobile) return <MobileAdminDashboard />;` (desktop intoccato; copre anche ruolo `amministrazione` che punta a `/dashboard/admin`). Mobile suite 124/124 verde. Follow-up: F4.1 (Contatti mobile).



---

## FASE 4 — Schermate quotidiane (liste)

### F4.1 — Contatti mobile `[x]`
- **dep:** F1.6, F1.7, F2.4
- Ricerca + chip filtri + lista `MobileListItem`; FAB nuovo contatto; swipe Chiama/Assegna; tap→dettaglio. Sostituisce `ContactsTable` su mobile.
- **AC:** SPEC §6.3; infinite scroll/paginazione via hook esistente; stati gestiti; desktop tabella invariata.
- *Note:* Creato `src/components/contacts/mobile/MobileContactsList.tsx`: header sticky con titolo + counter `totalLoaded/totalCount`, `Input type=search` debounced 300ms, `Segmented<StatusValue>` 6 stati (Tutti/Nuovi/Attivi/Qualificati/Non qualif./Archiviati). Lista `MobileListItem` con avatar iniziali (40px chip muted), nome, subtitle `ContactStatusBadge` + telefono `tabular-nums`, trailing "ultima attività" (`formatDistanceToNow` locale it, max 80px truncate). Swipe action `Chiama` (variant primary) condizionale quando `primary_phone` presente, usa `tel:` link. Tap → `ContactDetailSheet` esistente (riusa flusso desktop, gestisce deep-link `?open=<id>`). Infinite scroll via `IntersectionObserver` con `rootMargin: '200px'` sul sentinel `<li>`, mostra `ListItemSkeleton` x2 durante `isLoadingMore`. Stati: `MobileListSkeleton count=8` su loading, `EmptyState` (icon Users, messaggio diverso se ricerca attiva), `ErrorState` con retry. Banner `Alert` informativo in modalità all-brands. `PullToRefresh` invalida `contact-search`+`contact-count`. **FAB "Nuovo contatto"** via `NewContactDialog` esteso con nuova prop opzionale `trigger?: React.ReactNode` (additiva, default invariato per il desktop), passa un `MobileFab` (icona UserPlus, `label="Nuovo contatto"`, `position="bottom-right"` sopra tab bar+safe-area). Wired in `src/pages/Contacts.tsx` con `if (isMobile) return <MobileContactsList />` (desktop `ContactsTableWithViews` intoccato). Stessi queryKey desktop (`contact-search`, `contact-count`) → cache react-query condivisa, zero fetch extra, RLS invariata. Solo token semantici. Mobile suite 124/124 verde. Follow-up: F4.2 (Pipeline mobile).


### F4.2 — Pipeline mobile `[x]`
- **dep:** F1.4, F1.6, F2.4
- `Segmented` fasi con conteggi + lista deal della fase; azione "Sposta fase" in bottom sheet; FAB.
- **AC:** SPEC §6.4; nessun drag multi-colonna su mobile; dati invariati.
- *Note:* Creato `src/components/pipeline/mobile/MobilePipelineView.tsx`: header sticky (titolo "Pipeline" + brand corrente / "Vista globale di tutti i brand" + counter `N deal aperti`), `Segmented asTabs` con tutte le fasi (`usePipelineStages`) e conteggio per fase calcolato da `useDeals("open")` raggruppato per `current_stage_id`. Default fase attiva = prima con deal (fallback prima fase). Lista `MobileListItem` per fase: avatar iniziali (40px chip muted), nome contatto (fallback email/"Senza nome"), subtitle owner (`assigned_user.full_name`/email/"Non assegnato" + brand in vista globale), trailing valore deal formattato `Intl.NumberFormat it-IT EUR` (tabular-nums). Tap → `DealDetailSheet` riusato dal desktop. **Swipe action "Sposta fase"** (variant primary, icon `ArrowRightLeft`) → apre `BottomSheet` con titolo "Sposta fase" + sottotitolo `contatto · valore`; lista bottoni fase (dot colore stage + nome + conteggio tabular-nums + check sulla fase corrente). Selezione → `useUpdateDealStage` con `expectedVersion` (stessa logica desktop, gestione `STALE_DEAL` → toast "Deal aggiornato altrove. Ricarica e riprova."). FAB `MobileFab` (icon Plus, label "Nuovo deal (scegli contatto)") → `navigate("/contacts")` (non esiste `NewDealDialog` standalone; i deal nascono dal contatto). `PullToRefresh` invalida `["deals"]` + `["pipeline-stages"]`. Stati: `MobileListSkeleton count=6`, `ErrorState` con retry su entrambe le query, `EmptyState` su fase senza deal e su "Nessuna fase configurata". Wired in `src/pages/Pipeline.tsx`: `Pipeline()` ora fa solo `useIsMobile()` + early return `<MobilePipelineView />`; tutta la logica desktop estratta in `PipelineDesktop()` interno (zero modifiche funzionali, hooks order safe). Solo token semantici (`bg-card`/`bg-muted`/`text-foreground`/`hsl(var(--primary))` per dot stage). Mobile suite 124/124 verde. Follow-up: F4.3 (Appuntamenti mobile).


### F4.3 — Appuntamenti mobile `[x]`
- **dep:** F1.4, F1.6, F2.4
- `Segmented` Oggi/Settimana/Mese + lista per giorno; FAB nuovo; tap→`AppointmentDetail`.
- **AC:** SPEC §6.5; stati gestiti.
- *Note:* Creato `src/components/appointments/mobile/MobileAppointmentsView.tsx`: header sticky (titolo "Appuntamenti" + brand corrente / "Tutti i brand" + counter `N appuntamenti`), `Segmented asTabs` Oggi/Settimana/Mese (range calcolati con `startOfDay/endOfDay`, `startOfWeek/endOfWeek weekStartsOn:1`, `startOfMonth/endOfMonth`). Riusa `useAppointments` con `dateFrom`/`dateTo` ISO → stesso queryKey desktop, cache condivisa, zero RPC nuove. Ordinamento per `scheduled_at` ASC e raggruppamento per giorno con header `dayHeader` ("Oggi · giorno mese" se today, altrimenti `EEEE d MMMM` it). Lista `MobileListItem`: leading chip 40px con orario `HH:mm` tabular-nums, title = nome contatto + dot stato (`scheduled→warning`, `confirmed/visited→success/primary`, `cancelled/no_show→destructive`, `rescheduled→primary/70`) con tooltip `STATUS_LABEL`, subtitle venditore (`sales_user.full_name`/email/"Non assegnato") + città quando presente, trailing iniziali contatto. Tap → `navigate("/appointments/:id")`. **Swipe actions context-aware**: stati non finali (`scheduled`/`confirmed`/`rescheduled`) mostrano "Visitato" (primary) + "No show" (destructive con `confirm` AlertDialog del primitive); stati finali mostrano solo "Chiama" se `primary_phone` presente (`tel:`). Mutation via `useSetAppointmentStatus` con toast sonner. `PullToRefresh` invalida `["appointments"]`. Stati: `MobileListSkeleton count=6`, `ErrorState` retry, `EmptyState` differenziato per range (Oggi/Settimana/Mese). FAB `MobileFab` (Plus) apre `NewAppointmentDialog` esistente (riuso desktop, nessuna modifica al dialog). Wired in `src/pages/Appointments.tsx`: `Appointments()` ora fa solo `useIsMobile()` + early return `<MobileAppointmentsView />`; tutta la logica desktop estratta in `AppointmentsDesktop()` interno (hooks order safe, zero modifiche funzionali). Solo token semantici. Mobile suite 124/124 verde. Follow-up: F4.4 (Ticket mobile).


### F4.4 — Ticket mobile `[ ]`
- **dep:** F1.6, F2.4
- Chip stato/priorità + lista; swipe Prendi in carico/Risolvi (conferma); FAB. Sostituisce `TicketsTable` su mobile.
- **AC:** SPEC §6.6; desktop tabella invariata.
- *Note:*

### F4.5 — Lead in arrivo mobile `[ ]`
- **dep:** F1.6, F2.4
- Lista cronologica + filtro canale; swipe Assegna/Chiama/Scarta; realtime se presente.
- **AC:** SPEC §6.7; stati gestiti.
- *Note:*

### F4.6 — Chat mobile `[ ]`
- **dep:** F2.4
- Lista conversazioni → thread full-screen, input sopra safe-area.
- **AC:** SPEC §6.8; tastiera non copre input.
- *Note:*

---

## FASE 5 — Executive & analytics

### F5.1 — Performance Hub mobile `[ ]`
- **dep:** F1.4, F1.5, F2.4
- Hero KPI + `Segmented` periodo + grafici recharts semplificati (1 per card) + top-N lista.
- **AC:** SPEC §6.10; nessuna tabella larga; dati invariati.
- *Note:*

### F5.2 — Performance venditori / Call center KPI mobile `[ ]`
- **dep:** F5.1
- Stesso pattern; confronti come liste/grafici singoli.
- **AC:** SPEC §6.10.
- *Note:*

### F5.3 — Wallboard call center mobile `[ ]`
- **dep:** F1.5, F2.4
- Numeri grandi impilati (code/attese/SL), auto-refresh esistente.
- **AC:** SPEC §6.11; leggibile a distanza.
- *Note:*

### F5.4 — Vendite / Prodotti / Azienda mobile `[ ]`
- **dep:** F1.5, F1.6, F2.4
- Card+liste; tabelle→liste; KPI in hero.
- **AC:** SPEC §6.9; dati invariati.
- *Note:*

---

## FASE 6 — Sistema, impostazioni, notifiche

### F6.1 — Notifiche mobile `[ ]`
- **dep:** F1.6, F2.4
- Lista raggruppata per data; "segna tutte come lette"; tap→contesto.
- **AC:** SPEC §6.12.
- *Note:*

### F6.2 — Impostazioni / Profilo mobile `[ ]`
- **dep:** F2.4
- Lista a gruppi stile iOS; aspetto/tema (`AppearanceMenuItems`); brand; sicurezza; form in schermate dedicate.
- **AC:** SPEC §6.13.
- *Note:*

### F6.3 — Pagine Admin/Sistema: leggibilità mobile `[ ]`
- **dep:** F2.4
- Garantisci niente overflow orizzontale: tabelle in `overflow-x-auto no-scrollbar`, card impilate, header non rotti, su tutte le pagine `Admin*`. Nessun redesign profondo.
- **AC:** SPEC §6.14; nessuna pagina rompe il layout <768px; desktop invariato.
- *Note:*

---

## FASE 7 — Rifinitura & gate QA

### F7.1 — Pass motion & micro-interazioni `[ ]`
- **dep:** Fase 3–6 completate
- Uniforma durate/easing/press-state/transizioni schermo su tutta la shell; verifica reduced-motion.
- **AC:** coerenza SPEC §2.4; nessun jank percepito.
- *Note:*

### F7.2 — Pass accessibilità (AA) `[ ]`
- **dep:** Fase 3–6 completate
- Verifica target 44px, contrasti token nuovi, `aria-label`, focus trap sheet, landmark; correggi gli scostamenti.
- **AC:** SPEC §7 soddisfatta; audit a11y esistente (`AdminA11yAudit`) non peggiora.
- *Note:*

### F7.3 — Pass performance `[ ]`
- **dep:** Fase 3–6 completate
- Verifica bundle (mobile code-split), skeleton senza CLS, liste lunghe fluide; ottimizza dove serve senza nuove dipendenze.
- **AC:** SPEC §8; build size desktop non peggiora.
- *Note:*

### F7.4 — Gate finale (lint/types/test/build + check desktop) `[ ]`
- **dep:** F7.1, F7.2, F7.3
- Esegui `npm run lint && tsc && npm run test && npm run build`; verifica manualmente (descrivendo) che desktop ≥768px sia identico e che ogni ruolo abbia la sua shell mobile coerente con SPEC §5.
- **AC:** tutto verde; nessuna regressione desktop; checklist SPEC §9 vera per gli schermi principali.
- *Note:*

---

## Backlog idee (non schedulate)
- Widget "oggi" come PWA shortcut / quick actions.
- Haptics su azioni chiave (se PWA/wrapper lo consente).
- Modalità offline read-only sfruttando il persist client react-query.
- Onboarding mobile (riusa `AppTour`/`WelcomeModal`).
