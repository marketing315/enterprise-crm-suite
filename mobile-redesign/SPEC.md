# SPEC — Redesign Mobile "C-level" · CRM Gruppo Benessere

> Specifica di prodotto e design per il redesign **esclusivamente mobile** (`< 768px`) del CRM.
> Obiettivo: trasformare un CRM enterprise denso in un'esperienza mobile **semplice, calma e premium**, utilizzabile da **qualsiasi ruolo** con il livello di cura di un'app "unicorn" (Linear, Stripe, Revolut, Things, Superhuman, Arc).
>
> Questo file è la **fonte di verità**. È accompagnato da `fix_plan.md` (backlog eseguibile) e `PROMPT.md` (prompt del ralph loop). Quando spec e codice divergono, vince la spec; se la spec è ambigua, l'agente sceglie l'opzione più semplice per l'utente finale e annota la decisione in `fix_plan.md`.

---

## 0. Vincoli non negoziabili (leggere prima di toccare codice)

1. **Solo mobile.** Tutte le modifiche valgono per viewport `< 768px` (`useIsMobile()` → `MOBILE_BREAKPOINT = 768`). Il layout desktop **non deve cambiare in alcun modo**: stessi pixel, stesse interazioni. Ogni nuovo componente mobile è isolato o reso condizionale.
2. **Niente backend / logica di business.** Non modificare Supabase, edge functions, schema, RLS, hook di data-fetching (`useCeoDashboard`, `useContacts`, ecc.), calcoli o RBAC. Si **riutilizzano** gli hook e i dati esistenti; si cambia solo la **presentazione**.
3. **Niente regressioni.** `npm run lint`, `tsc` (strict dove già attivo), `npm run test` e `npm run build` devono restare verdi a ogni task. Gli e2e Playwright esistenti non devono rompersi.
4. **Stack invariato.** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Radix + react-router-dom + @tanstack/react-query + vaul (bottom sheet) + sonner (toast) + lucide-react + i18next. **Nessuna nuova dipendenza pesante** senza giustificazione in `fix_plan.md`; preferire ciò che è già in `package.json`.
5. **Italiano.** Tutto il testo UI in italiano, via i18n dove già usato. Numeri/valute con i helper esistenti (`formatCurrency`, `formatKpi`). Numeri sempre `tabular-nums`.
6. **RBAC e multi-brand intatti.** La visibilità di sezioni/azioni per ruolo e brand resta identica a quella di `MainLayout.tsx` / `useRoleDashboard`. Il redesign cambia *come* si naviga, non *cosa* un ruolo può vedere.
7. **Accessibilità AA.** Mantenere e rafforzare il lavoro già presente (focus-visible globale, skip-link, target 44px su pointer coarse, reduced-motion).

---

## 1. Visione e principi C-level

Un dirigente (o un venditore di corsa, o un operatore) apre l'app per **pochi secondi**, in piedi, con un pollice. Deve capire *com'è la situazione* e *cosa fare dopo* senza pensare. Principi guida:

1. **Una decisione per schermata.** Ogni schermo ha un'unica risposta primaria ("quanto ho guadagnato", "chi devo richiamare", "cosa è in ritardo"). Tutto il resto è secondario, sotto la piega o dietro un tap.
2. **Risposta prima dei dettagli.** Il numero/insight chiave in alto, grande, leggibile in 1 secondo. Il "come si arriva a quel numero" è espandibile, mai imposto.
3. **Calma, non densità.** Spazio bianco generoso, poche card grandi invece di tabelle. Niente muri di metriche. Gerarchia tipografica forte.
4. **Pollice prima di tutto.** Azioni primarie nella *thumb zone* (parte bassa). Bottom navigation + FAB + bottom sheet. Mai azioni critiche in alto a destra.
5. **Premium quiet.** Estetica sobria e costosa: superfici neutre, un solo colore d'accento per contesto, micro-interazioni morbide, ombre soffuse, angoli generosi (`rounded-2xl`/`3xl`). Niente gradienti chiassosi se non per la hero card.
6. **Stato sempre onesto.** Loading con skeleton che imita il layout finale; empty state che spiega e propone un'azione; error state recuperabile (retry). Mai spinner nudo a tutto schermo dopo il primo caricamento.
7. **Zero gergo.** Etichette comprensibili a un non-tecnico (la sidebar attuale già lo fa: "Lead in arrivo", "Webhook in errore"). Mantenere questo tono.
8. **Continuità desktop.** Stessi dati, stessa terminologia, stesso modello mentale — solo riorganizzati per il pollice.

**Benchmark di riferimento** (per tono, non per copia 1:1): Linear (gerarchia + motion sobrio), Stripe Dashboard mobile (numeri grandi + trend), Revolut/Mercury (hero card finanziaria), Things 3 (liste + swipe + calma), Superhuman (velocità percepita), Arc (bottom sheet e gesture).

---

## 2. Design language — evoluzione dei token esistenti

Si **evolve** il design system shadcn già presente in `src/index.css` e `tailwind.config.ts`, **senza rompere** i token attuali. Si aggiungono nuovi token e si raffinano spacing/radius/ombre/motion. Tutti i colori **in HSL**.

### 2.1 Colore
- Mantenere i token base (`--background`, `--foreground`, `--primary`, ecc.) e la modalità `.dark`.
- Aggiungere token **semantici** riutilizzabili (se non già presenti), in HSL, light + dark:
  - `--success`, `--success-foreground`
  - `--warning`, `--warning-foreground`
  - `--danger` (alias di destructive, ma esplicito per KPI)
  - `--info`
  - `--surface` / `--surface-2` (superfici elevate per card su mobile, leggermente distinte dal background)
- **Un solo accento per contesto.** Le hero card usano `--primary`; gli stati usano i token semantici. Evitare arcobaleni.
- Tutte le tinte devono superare il contrasto AA su testo (≥ 4.5:1 per testo normale, ≥ 3:1 per testo grande/icone).

### 2.2 Tipografia (scala mobile)
Definire una scala chiara, usata in modo coerente in tutti gli schermi mobile:
- **Display / hero number**: ~40px, `font-bold`, `tracking-tight`, `tabular-nums` (il numero chiave della schermata).
- **Title (h1 schermo)**: ~17–20px `font-semibold tracking-tight`.
- **Section label**: 11px `font-semibold uppercase tracking-[0.12em] text-muted-foreground` (pattern già usato in `MobileCeoDashboard`).
- **Body**: 14–15px.
- **Caption / meta**: 12px `text-muted-foreground`.
- Numeri sempre `tabular-nums`; valute via helper.

### 2.3 Spacing, radius, elevazione
- Spacing verticale tra sezioni: `20px` (`space-y-5`); padding orizzontale schermo: `16px` (`px-4`).
- Radius: card `rounded-2xl`; hero / contenitori principali `rounded-3xl`; chip/pill `rounded-full`.
- Ombre **soffuse e basse**: definire utility `shadow-card` (ombra leggera neutra) e `shadow-hero` (ombra colorata tenue per la hero). Niente bordi duri + ombre forti insieme: scegliere `border-border/60` *oppure* ombra, raramente entrambi.
- Header sticky con `backdrop-blur-xl` e sfondo `bg-background/85` (già usato).

### 2.4 Motion
- Durate: micro 120–160ms, transizioni schermo 200–280ms. Easing standard `cubic-bezier(0.2, 0.8, 0.2, 1)` (ease-out morbido).
- Pattern: fade+slide-up all'ingresso schermo; spring leggero sui bottom sheet (vaul lo fa già); press-state con `active:scale-[0.98]` sui tap target principali.
- **Rispettare `prefers-reduced-motion`** (già gestito in `index.css`): in quel caso disabilitare scale/slide, mantenere solo opacità istantanea.

### 2.5 Safe area & touch
- Tutti i container fixed (header, bottom nav, FAB, sheet) rispettano `env(safe-area-inset-*)`. Aggiungere utility `pb-safe`/`pt-safe` (via plugin tailwind o CSS in `index.css`).
- Touch target minimo **44×44px** (già forzato su `pointer: coarse`). Mantenere `data-touch-target="primary"` sulle azioni chiave.

> **Regola d'oro token:** ogni nuovo token va in `index.css` (HSL) ed esposto in `tailwind.config.ts`. Mai colori hard-coded nei componenti.

---

## 3. App shell mobile

Il cuore del redesign. Oggi su mobile la navigazione è solo la `Sidebar` shadcn che collassa in uno *sheet* — pesante e poco "pollice". Si introduce una **shell mobile dedicata**.

### 3.1 Struttura
```
┌───────────────────────────────┐
│  Header compatto (sticky)      │  brand · titolo schermo · azione contestuale
├───────────────────────────────┤
│                               │
│        Contenuto schermo       │  scroll verticale, pull-to-refresh
│        (1 risposta primaria)   │
│                               │
├───────────────────────────────┤
│  Bottom Tab Bar (fixed)        │  ≤5 voci, thumb zone, safe-area
└───────────────────────────────┘
        + FAB azione primaria (contestuale)
```

### 3.2 Bottom navigation (`MobileTabBar`)
- **Massimo 5 tab**, scelte per ruolo (vedi §5). Icone lucide + label corta (11–12px). Stato attivo: icona piena/accent + label accent.
- Fissa in basso, `backdrop-blur`, `border-t border-border/40`, `pb-safe`.
- Una delle tab può essere un **pulsante d'azione centrale** rialzato (FAB-in-bar) per l'azione più frequente del ruolo (es. venditore → "Nuovo contatto/Chiamata"; CEO → "Cerca/Insight").
- Tab universali presenti per (quasi) tutti: **Home**, **Cerca**, **Profilo/Menu**. Le 2 centrali sono role-specific.
- L'ultima voce **Menu** apre un **bottom sheet** con *tutta* la navigazione restante (le sezioni Insight/Configurazione/Sistema/Marketing filtrate per ruolo, riusando la stessa logica di visibilità di `MainLayout`).

### 3.3 Header (`MobileHeader`)
- Sticky, compatto: a sinistra titolo schermo + sottotitolo (brand o contesto); a destra **una sola** azione contestuale (es. periodo, filtro, o "AI").
- Brand selector accessibile da header (tap sul sottotitolo brand → bottom sheet di selezione brand), riusando `BrandSelector`/`BrandContext`.
- Niente hamburger: la navigazione vive nella bottom bar + Menu sheet.

### 3.4 Menu sheet (`MobileMoreSheet`)
- Bottom sheet a piena altezza con ricerca interna, raggruppato per le sezioni IA esistenti (Quotidiano / Vendite & Clienti / Insight / Configurazione / Sistema / Marketing), **filtrate per ruolo e brand** con la stessa funzione di `MainLayout`.
- Include: cambio brand, tema (riusa `AppearanceMenuItems`), profilo, logout, link impostazioni.

### 3.5 Ricerca globale (`MobileSearch`)
- Riusa `GlobalSearchDialog` ma presentato come **bottom sheet full-screen** su mobile: campo in alto (focus automatico), risultati a lista grande tap-abile, sezioni recenti.

### 3.6 Gesture
- **Pull-to-refresh** sulle schermate-lista e dashboard (invalida la query react-query corrispondente).
- **Swipe orizzontale su riga lista** → azioni rapide (es. contatto: chiama / assegna; ticket: prendi in carico / chiudi). Solo dove ha senso, mai distruttivo senza conferma.
- **Swipe-back** nativo: non intercettare il gesto di sistema; le navigazioni di dettaglio usano route push standard.
- **Tap su hero card** → drill-down alla sezione di dettaglio relativa.

### 3.7 Wiring
- Introdurre un `MobileLayout` usato **solo** quando `useIsMobile()` è true, in alternativa a `MainLayout` (che resta intatto per desktop). Stesse `<Outlet/>` e stessi provider (Auth, Brand, realtime, notifiche). Nessuna route nuova; cambia solo il guscio.

---

## 4. Libreria componenti mobile (`src/components/mobile/`)

Componenti riusabili, isolati, tipizzati, documentati con JSDoc breve. Riusare i primitivi shadcn/Radix sotto il cofano. Tutti accettano `className` e rispettano i token.

| Componente | Scopo | Note |
|---|---|---|
| `MobileScreen` | Scaffold schermo: header + area scroll + safe area + pull-to-refresh opzionale | Wrapper standard di ogni pagina mobile |
| `MobileHeader` | Header compatto sticky (titolo, sottotitolo, 1 azione) | blur + safe-area |
| `MobileTabBar` | Bottom navigation ≤5 voci, FAB centrale opzionale | per-ruolo |
| `MobileMoreSheet` | Sheet con navigazione completa filtrata per ruolo | usa vaul |
| `HeroMetricCard` | Card grande con numero chiave + trend + delta | variante neutra/positiva/negativa |
| `MetricRow` / `KpiList` | Lista di KPI secondari (label, valore, trend, sparkline opz.) | pattern già in `MobileCeoKpiList` |
| `MobileListItem` | Riga lista premium (leading avatar/icon, titolo, sottotitolo, trailing, swipe-actions) | base per Contatti/Ticket/Lead/Appuntamenti |
| `SectionLabel` | Etichetta sezione uppercase | estrarre da `MobileCeoDashboard` |
| `Segmented` / `ChipGroup` | Selettori periodo/filtro a pillole scrollabili | `no-scrollbar` |
| `BottomSheet` | Wrapper standard su vaul (handle, header, scroll, azioni in basso) | usato per filtri/dettagli/azioni |
| `MobileFab` | Floating action button azione primaria | thumb zone, safe-area |
| `EmptyState` | Stato vuoto con icona, messaggio, CTA | |
| `ErrorState` | Stato errore con retry | invalida/ritenta query |
| `MobileSkeletons` | Skeleton coerenti col layout (hero, lista, kpi) | |
| `PullToRefresh` | Wrapper gesto refresh | integra react-query invalidate |
| `TrendBadge` | Delta % con freccia e colore semantico | `tabular-nums` |

> Estrarre i pattern già nati in `src/components/ceo/mobile/` (`MobileCeoDashboard`, `MobileCeoKpiList`, `MobileCeoPeriodChips`) e **generalizzarli** in questa libreria, poi rifattorizzare il CEO mobile per usarla (senza cambiarne i dati).

---

## 5. Information architecture mobile per ruolo

Stessi permessi di oggi, ma **massimo 5 tab** per ruolo + Menu sheet per il resto. La tab "Home" porta sempre alla dashboard di ruolo già esistente (`useRoleDashboard().primaryPath`). La 3ª voce è il **FAB azione** del ruolo.

| Ruolo | Tab 1 Home | Tab 2 | Tab 3 (azione/FAB) | Tab 4 | Tab 5 Menu |
|---|---|---|---|---|---|
| **CEO / Admin** | Dashboard CEO | Pipeline | Cerca (insight) | Notifiche | Menu |
| **Amministrazione** | Dashboard | Vendite | Cerca | Notifiche | Menu |
| **Resp. Venditori** | Dashboard | Pipeline | Nuovo contatto | Performance venditori | Menu |
| **Resp. Call Center** | Dashboard | Ticket | Wallboard | Notifiche | Menu |
| **Venditore / Sales** | Dashboard | Pipeline | Nuovo contatto / Chiamata | Appuntamenti | Menu |
| **Operatore CC / Call** | Dashboard | Lead in arrivo | Chiamata | Ticket | Menu |

- "Cerca" apre `MobileSearch`. "Menu" apre `MobileMoreSheet`. "Notifiche" apre la pagina/sheet notifiche (riusa `NotificationBell`/`Notifications`).
- Tutto ciò che non sta nelle 5 tab resta raggiungibile dal **Menu sheet**, identico per visibilità a quanto un ruolo vede oggi nella sidebar.
- La mappatura esatta tab↔ruolo è in `fix_plan.md` come dato di configurazione (`mobileTabsByRole`), così è facile da rifinire.

---

## 6. Specifiche schermo-per-schermo

Per ogni schermo: **Obiettivo** (la singola risposta), **Layout**, **Azioni primarie**, **Stati** (loading/empty/error), **Gesture**. Riusare sempre gli hook dati esistenti.

### 6.1 Home / Dashboard di ruolo
- **Obiettivo:** "com'è la situazione adesso, per me".
- **Layout:** Header (ruolo + brand + periodo). **HeroMetricCard** col numero più importante per quel ruolo (CEO: utile netto; venditore: trattative aperte / target; resp. CC: ticket aperti / SLA). Sotto: `KpiList` con 4–6 KPI secondari. Poi 1–2 sezioni contestuali (pipeline mini, prossimi appuntamenti, alert) come card. Sezioni dense → `Collapsible`.
- **Azioni:** tap hero → drill-down; tap KPI → dettaglio; pull-to-refresh.
- **Stati:** skeleton hero+lista; empty "nessun dato per il periodo"; error con retry.
- Riusare le dashboard di ruolo esistenti in `src/pages/dashboard/*` come fonte dati; la versione mobile è una *vista* alternativa, non una nuova logica.

### 6.2 CEO Dashboard (`/ceo-dashboard`)
- Già abbozzata in `MobileCeoDashboard`. **Rifattorizzare** per usare la nuova libreria (`HeroMetricCard`, `KpiList`, `Segmented`, `SectionLabel`, `BottomSheet`). Mantenere: hero utile netto, chip periodo, KPI, pipeline overview, sezioni finanza collassabili, alert. Aggiungere pull-to-refresh e drill-down coerenti.

### 6.3 Contatti (`/contacts`)
- **Obiettivo:** trovare e agire su un contatto.
- **Layout:** barra ricerca sticky + chip filtri (stato, brand, assegnatario) in `Segmented`; lista `MobileListItem` (avatar iniziali, nome, stato + canale come sottotitolo, trailing: ultima attività). **Niente tabella** su mobile (sostituisce `ContactsTable`).
- **Azioni:** FAB "Nuovo contatto"; swipe riga → Chiama / Assegna; tap → dettaglio contatto in route esistente.
- **Stati:** skeleton lista; empty "nessun contatto"; error retry. Paginazione/infinite scroll riusando l'hook esistente.

### 6.4 Pipeline (`/pipeline`)
- **Obiettivo:** stato delle trattative e cosa muovere.
- **Layout:** Kanban su mobile = **selettore di fase** (`Segmented` orizzontale con conteggi) + lista delle deal della fase selezionata come `MobileListItem` (cliente, valore, età). Evitare il drag-multi-colonna su mobile; spostare fase via bottom sheet azione sulla deal.
- **Azioni:** tap deal → dettaglio; azione "Sposta fase" in bottom sheet; FAB "Nuova trattativa" se permesso.
- **Stati:** skeleton; empty per fase; error retry.

### 6.5 Appuntamenti (`/appointments`)
- **Obiettivo:** cosa ho oggi/prossimamente.
- **Layout:** header con `Segmented` Oggi / Settimana / Mese; lista raggruppata per giorno (`MobileListItem` con orario, cliente, tipo, luogo). Vista calendario completa rimandata al Menu.
- **Azioni:** FAB "Nuovo appuntamento"; tap → dettaglio (`AppointmentDetail`); swipe → conferma/annulla se previsto.
- **Stati:** skeleton; empty "nessun appuntamento"; error retry.

### 6.6 Ticket (`/tickets`)
- **Obiettivo:** cosa è aperto / urgente.
- **Layout:** chip stato (Aperti / In corso / Risolti) + priorità; lista `MobileListItem` (oggetto, cliente, priorità badge, SLA/età). Sostituisce `TicketsTable` su mobile.
- **Azioni:** swipe → Prendi in carico / Risolvi (con conferma); tap → dettaglio; FAB "Nuovo ticket" se permesso.
- **Stati:** skeleton; empty; error retry.

### 6.7 Lead in arrivo (`/events`)
- **Obiettivo:** lavorare i nuovi lead velocemente.
- **Layout:** lista cronologica `MobileListItem` (nome, canale/sorgente, ora, badge "nuovo"); filtro per canale.
- **Azioni:** swipe → Assegna / Chiama / Scarta; tap → dettaglio.
- **Stati:** realtime se già presente; skeleton; empty "nessun nuovo lead"; error retry.

### 6.8 Chat (`/chat`)
- **Obiettivo:** conversare. Layout mobile-messaging standard: lista conversazioni → thread a schermo intero, input in basso sopra safe-area, header thread compatto. Riusare logica `Chat.tsx`.

### 6.9 Vendite (`/sales`) / Prodotti (`/products`) / Azienda (`/azienda`)
- Viste a card e liste leggibili al pollice; KPI in `HeroMetricCard`+`KpiList`; tabelle → liste `MobileListItem`. Solo presentazione.

### 6.10 Performance Hub / Performance venditori / Call center KPI
- **Obiettivo:** trend e confronto. `HeroMetricCard` sul KPI principale, `Segmented` periodo, grafici recharts **semplificati** (1 grafico per card, label minime, tap per tooltip). Niente tabelle larghe: top-N come lista.

### 6.11 Wallboard call center (`/callcenter-wallboard`)
- Vista "glance" a numeri grandi (code, attese, SL) impilati verticalmente, auto-refresh esistente. Ottimizzata per essere guardata, non toccata.

### 6.12 Notifiche (`/notifications`)
- Lista raggruppata per data, item tap-abile che porta al contesto; azione "segna tutte come lette". Riusa logica esistente.

### 6.13 Impostazioni / Profilo (`/settings`)
- Lista a gruppi (stile iOS settings): account, aspetto (tema, `AppearanceMenuItems`), brand, sicurezza, avanzate. Form in schermate dedicate, non in modal stretti.

### 6.14 Admin / Sistema (audit, DLQ, webhook, SLO, ecc.)
- **Bassa priorità mobile.** Garantire **leggibilità e non-rottura** (no overflow orizzontale, tabelle scrollabili in `overflow-x-auto` con `no-scrollbar`, card impilate). Non serve redesign profondo: queste pagine sono usate raramente da mobile. Marcare come "read-only friendly".

---

## 7. Accessibilità (WCAG 2.1 AA)
- Target ≥ 44×44px (già forzato); verificare su ogni nuovo tap target.
- Contrasto AA su testo e icone informative; verificare i nuovi token semantici.
- `focus-visible` su tutti gli elementi interattivi (ring globale già presente); i bottom sheet trappano e restituiscono il focus (Radix/vaul lo fanno).
- `aria-label` su icon-only button; ruoli/landmark corretti (`header`, `nav`, `main`).
- Rispettare `prefers-reduced-motion`.
- Dynamic type: layout non deve rompersi a font ingranditi; usare `rem`, niente altezze fisse sui testi.
- Niente colore come unico veicolo d'informazione (trend = freccia + colore + segno).

---

## 8. Performance
- Mantenere lazy-loading delle route (già presente). I componenti mobile non devono aumentare il bundle desktop: `MobileLayout` e libreria mobile caricati condizionalmente / code-split dove sensato.
- Liste lunghe (contatti, lead, ticket): usare paginazione/infinite scroll degli hook esistenti; valutare virtualizzazione solo se necessario (no nuove dipendenze senza nota).
- Skeleton sempre coerenti col layout per evitare layout shift (CLS ~0).
- Immagini/avatars con dimensioni esplicite; `content-visibility` per sezioni fuori schermo dove utile.
- Riuso aggressivo della cache react-query già configurata (persist client presente).

---

## 9. Definition of Done (per ogni task)
Un task è "done" solo se **tutte** queste condizioni valgono:
1. Implementa esattamente lo scope del task, niente di più (diff piccolo e mirato).
2. Effetto **solo** su `< 768px`; desktop verificato invariato (DOM/markup desktop non modificato o reso identico).
3. `npm run lint` ✅ · `tsc` ✅ (nessun nuovo errore) · `npm run test` ✅ · `npm run build` ✅.
4. Nessuna nuova dipendenza non giustificata; nessun colore hard-coded (solo token).
5. Stati loading / empty / error gestiti per ogni schermo toccato.
6. Touch target ≥44px, `aria-label` presenti, reduced-motion rispettato, safe-area gestita.
7. Testo in italiano, numeri `tabular-nums` + helper valuta.
8. RBAC/brand invariati (un ruolo non vede più né meno di prima).
9. Checkbox del task spuntata in `fix_plan.md` con 1 riga di note (file toccati / decisioni).
10. Commit atomico con messaggio convenzionale (`feat(mobile): …`, `refactor(mobile): …`, `style(mobile): …`).

---

## 10. Glossario rapido
- **Hero card:** card grande in cima allo schermo col numero/insight chiave.
- **Thumb zone:** area in basso raggiungibile col pollice; sede di azioni primarie.
- **Bottom sheet:** pannello che sale dal basso (vaul) per filtri/azioni/dettagli.
- **Menu sheet:** bottom sheet con tutta la navigazione non in tab bar.
- **Drill-down:** dal numero sintetico al dettaglio che lo compone.
