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

### F1.3 — `BottomSheet` + `MobileFab` `[ ]`
- **dep:** F0.3
- Wrapper standard su **vaul** (handle, header, scroll, azioni in basso, focus trap) e FAB in thumb zone con safe-area.
- **AC:** sheet apre/chiude con gesto, focus gestito, reduced-motion ok; FAB ≥44px.
- *Note:*

### F1.4 — `Segmented` / `ChipGroup` `[ ]`
- **dep:** F1.1
- Selettore a pillole scrollabile orizzontale (`no-scrollbar`), con conteggi opzionali. Generalizza `MobileCeoPeriodChips`.
- **AC:** selezione controllata, accessibile (role/tab), scroll fluido.
- *Note:*

### F1.5 — `HeroMetricCard` + `KpiList`/`MetricRow` `[ ]`
- **dep:** F1.1
- Hero card (numero display, label, `TrendBadge`, variante neutra/positiva/negativa, sfondo `--primary`/`shadow-hero`) e lista KPI secondari. Generalizza `MobileCeoKpiList`.
- **AC:** valori via props (no fetch); `tabular-nums`; varianti colore via token.
- *Note:*

### F1.6 — `MobileListItem` (+ swipe actions) `[ ]`
- **dep:** F1.3
- Riga lista premium: leading (avatar/icona), titolo, sottotitolo, trailing, supporto **swipe** per 1–2 azioni (riusa dnd-kit o gesture leggera; azioni distruttive con conferma).
- **AC:** swipe fluido, azioni con `aria-label`, conferma su distruttivo, tap principale separato dallo swipe.
- *Note:*

### F1.7 — `EmptyState` + `ErrorState` + `MobileSkeletons` + `PullToRefresh` `[ ]`
- **dep:** F1.2
- Stati coerenti SPEC §6; `ErrorState` con retry che invalida la query react-query; skeleton per hero/lista/kpi; `PullToRefresh` integra `queryClient.invalidateQueries`.
- **AC:** nessun layout shift visibile; retry funzionante; reduced-motion ok.
- *Note:*

### F1.8 — Refactor `ceo/mobile/*` sulla nuova libreria `[ ]`
- **dep:** F1.5, F1.4, F1.1
- Rifattorizza `MobileCeoDashboard`/`MobileCeoKpiList`/`MobileCeoPeriodChips` per usare i componenti condivisi, **senza cambiare dati o comportamento**.
- **AC:** stessa resa funzionale, meno codice duplicato; build/test verdi.
- *Note:*

---

## FASE 2 — App shell mobile

### F2.1 — `MobileTabBar` `[ ]`
- **dep:** F0.4, F1.2
- Bottom navigation ≤5 voci da `useRoleMobileTabs`, FAB centrale opzionale, stato attivo, blur, `pb-safe`.
- **AC:** naviga alle route corrette; voce attiva evidenziata; thumb-zone; ≥44px.
- *Note:*

### F2.2 — `MobileMoreSheet` (navigazione completa) `[ ]`
- **dep:** F1.3, F0.4
- Sheet con tutte le sezioni IA filtrate per ruolo/brand (riusa la logica di visibilità di `MainLayout`), ricerca interna, tema, brand, profilo, logout.
- **AC:** un ruolo vede esattamente le voci che vedrebbe nella sidebar desktop; nessun cambiamento RBAC.
- *Note:*

### F2.3 — `MobileSearch` (ricerca globale full-screen) `[ ]`
- **dep:** F1.3
- Presenta `GlobalSearchDialog` come sheet full-screen mobile (focus auto, risultati grandi, recenti).
- **AC:** stessi risultati del desktop; tastiera non copre i risultati; chiusura con swipe/back.
- *Note:*

### F2.4 — `MobileLayout` + wiring condizionale `[ ]`
- **dep:** F2.1, F2.2, F1.2
- Crea `MobileLayout` (header + `<Outlet/>` + `MobileTabBar`, stessi provider di `MainLayout`) e usalo **solo** quando `useIsMobile()` è true, senza modificare il layout desktop né le route.
- **AC:** su <768px appare la shell mobile; su ≥768px tutto identico a oggi; provider realtime/notifiche/auth intatti.
- *Note:*

---

## FASE 3 — Dashboard di ruolo (Home)

> Ogni dashboard: vista mobile alternativa che riusa i dati delle pagine `src/pages/dashboard/*`. Una hero + KpiList + 1–2 sezioni. dep comune: F2.4 + F1.5/F1.7.

### F3.1 — Mobile Dashboard CEO/Admin `[ ]`
- **dep:** F1.8, F2.4
- Collega la CEO mobile rifattorizzata alla shell; aggiungi pull-to-refresh e drill-down hero→pipeline/finanza.
- **AC:** SPEC §6.2 soddisfatta; stati gestiti; desktop CEO invariato.
- *Note:*

### F3.2 — Mobile Dashboard Venditore/Sales `[ ]`
- **dep:** F2.4, F1.5, F1.7
- Hero (trattative aperte / target), KpiList, prossimi appuntamenti + pipeline mini.
- **AC:** SPEC §6.1; dati da `SalespersonDashboard`; stati gestiti.
- *Note:*

### F3.3 — Mobile Dashboard Resp. Venditori `[ ]`
- **dep:** F2.4, F1.5, F1.7
- Hero (performance team), KpiList, top venditori (lista), pipeline.
- **AC:** dati da `SalesManagerDashboard`; SPEC §6.1.
- *Note:*

### F3.4 — Mobile Dashboard Resp./Operatore Call Center `[ ]`
- **dep:** F2.4, F1.5, F1.7
- Hero (ticket aperti / SLA o code), KpiList, lista urgenti.
- **AC:** dati da `CallcenterManagerDashboard`/`CallcenterOperatorDashboard`; SPEC §6.1.
- *Note:*

### F3.5 — Mobile Dashboard Amministrazione `[ ]`
- **dep:** F2.4, F1.5, F1.7
- Hero (KPI economico chiave) + KpiList + alert.
- **AC:** dati da `AdminDashboard`/overview; SPEC §6.1.
- *Note:*

---

## FASE 4 — Schermate quotidiane (liste)

### F4.1 — Contatti mobile `[ ]`
- **dep:** F1.6, F1.7, F2.4
- Ricerca + chip filtri + lista `MobileListItem`; FAB nuovo contatto; swipe Chiama/Assegna; tap→dettaglio. Sostituisce `ContactsTable` su mobile.
- **AC:** SPEC §6.3; infinite scroll/paginazione via hook esistente; stati gestiti; desktop tabella invariata.
- *Note:*

### F4.2 — Pipeline mobile `[ ]`
- **dep:** F1.4, F1.6, F2.4
- `Segmented` fasi con conteggi + lista deal della fase; azione "Sposta fase" in bottom sheet; FAB.
- **AC:** SPEC §6.4; nessun drag multi-colonna su mobile; dati invariati.
- *Note:*

### F4.3 — Appuntamenti mobile `[ ]`
- **dep:** F1.4, F1.6, F2.4
- `Segmented` Oggi/Settimana/Mese + lista per giorno; FAB nuovo; tap→`AppointmentDetail`.
- **AC:** SPEC §6.5; stati gestiti.
- *Note:*

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
