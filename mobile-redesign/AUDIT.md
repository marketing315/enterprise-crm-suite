# AUDIT.md — Inventario mobile (task F0.1)

> Fotografia del codebase per il redesign mobile. **Solo lettura**: nessun file di `src/` modificato.
> Aggiornato: 2026-06-01.

---

## 1. Routing (`src/App.tsx`)

87 route totali. Le pagine raggiungibili sotto `MainLayout` (post-auth, post-brand) sono raggruppate per area IA.

### 1.1 Dashboard di ruolo (entrypoint per ruolo)
| Path | Componente pagina | Ruoli ammessi |
|---|---|---|
| `/dashboard` | `DashboardRedirect` | tutti (redirect via `useRoleDashboard`) |
| `/dashboard/overview` | `Dashboard` (`pages/DashboardOverview.tsx` fallback) | tutti |
| `/dashboard/admin` | `AdminDashboard` | admin |
| `/dashboard/ceo` | `CeoDashboardView` | admin, ceo |
| `/dashboard/responsabile-callcenter` | `CallcenterManagerDashboard` | admin, ceo, responsabile_callcenter |
| `/dashboard/responsabile-venditori` | `SalesManagerDashboard` | admin, ceo, responsabile_venditori |
| `/dashboard/callcenter` | `CallcenterOperatorDashboard` | admin, ceo, responsabile_callcenter, operatore_callcenter |
| `/dashboard/venditore` | `SalespersonDashboard` | admin, ceo, responsabile_venditori, venditore |

### 1.2 Quotidiano / Vendite & Clienti
| Path | Componente | Note mobile |
|---|---|---|
| `/contacts` | `Contacts` | usa `ContactsTable` (tabella → diventa lista) |
| `/pipeline` | `Pipeline` | usa `KanbanBoard` (Kanban → segmented + lista) |
| `/sales` | `Sales` | card+tabelle |
| `/products` | `Products` | card+lista |
| `/events` | `Events` | lead in arrivo, già consapevole di `useIsMobile` |
| `/appointments` | `Appointments` | lista appuntamenti |
| `/appointments/calendar` | `AppointmentsCalendar` | calendario, raggiungibile da Menu |
| `/appointments/ops-board` | `AppointmentsOpsBoard` | ops board, raggiungibile da Menu |
| `/appointments/:id` | `AppointmentDetail` | dettaglio, già mobile-friendly |
| `/tickets` | `Tickets` | usa `TicketsTable` (tabella → lista) |
| `/chat` | `Chat` | conversazioni / thread |
| `/notifications` | `Notifications` | lista raggruppata |

### 1.3 Azienda / Finance / Marketing / Performance
| Path | Componente |
|---|---|
| `/azienda`, `/azienda/costi`, `/azienda/budget`, `/azienda/report` | `CompanyOverview` + figli |
| `/marketing` + `/marketing/{campagne,costi,report,leads,performance}` | `MarketingDashboard` + figli |
| `/performance` | `PerformanceHub` |
| `/sales/performance-sheet[/:userId]` | `SalesPerformanceSheet`, `SalespersonDrilldown` |
| `/team`, `/team/salespersons` | `Team`, `SalespersonKpi` |
| `/callcenter-wallboard` (incluso fra `/admin/*`) | `CallcenterWallboard` |

### 1.4 Settings / Admin / Sistema
Tutto sotto `/settings`, `/settings/security`, `/admin/*` (≈ 35 route admin). Per SPEC §6.14 sono **bassa priorità mobile**: solo non-rottura, no redesign profondo.

---

## 2. Componenti già mobile-aware

### 2.1 `useIsMobile` (`src/hooks/use-mobile.tsx`, breakpoint 768)
Usato in:
- `src/components/ui/sidebar.tsx` — switch sidebar/sheet
- `src/components/contacts/ContactsTable.tsx`
- `src/components/contacts/ContactsTableWithViews.tsx`
- `src/components/tickets/TicketsTable.tsx`
- `src/components/pipeline/KanbanBoard.tsx`
- `src/pages/dashboard/CeoDashboardView.tsx` (rende `<MobileCeoDashboard />` se mobile)
- `src/pages/Contacts.tsx`, `src/pages/Tickets.tsx`, `src/pages/Events.tsx`

### 2.2 Componenti mobile già esistenti (`src/components/ceo/mobile/`)
- `MobileCeoDashboard.tsx` — shell mobile della CEO dashboard (hero + KPI + sezioni)
- `MobileCeoKpiList.tsx` — pattern `KpiList`
- `MobileCeoPeriodChips.tsx` — pattern `Segmented`/`ChipGroup`
→ Da generalizzare in `src/components/mobile/` nelle fasi F1.4 / F1.5 / F1.8.

### 2.3 Shell di navigazione attuale
- Desktop: `src/components/layout/MainLayout.tsx` (sidebar + header + outlet). **Non toccare** per il redesign.
- Brand selector: `BrandSelector` + `BrandContext` (`src/contexts/BrandContext.tsx`).
- Auth/role: `AuthContext`, `useRoleDashboard` (`src/hooks/useRoleDashboard.ts` — già ritorna `availableDashboards`, base per `useRoleMobileTabs`).

### 2.4 Primitivi UI già installati e utili
- `vaul` → bottom sheet (`src/components/ui/drawer.tsx`)
- `sonner` → toast
- `lucide-react` → icone
- `recharts` → grafici (semplificare su mobile)
- `dnd-kit` → gesture (per swipe-actions opzionale)
- `react-router-dom` v6 + `Outlet`
- `@tanstack/react-query` v5 con persist client
- `react-day-picker`, `cmdk` (per `GlobalSearchDialog`)
- shadcn/ui primitives (Button, Sheet, Dialog, Popover, DropdownMenu, ScrollArea, Skeleton, ecc.)

---

## 3. Tabelle che diventano liste su mobile (SPEC §6)

| Tabella attuale | File | Schermata mobile target |
|---|---|---|
| `ContactsTable` | `src/components/contacts/ContactsTable.tsx` | §6.3 Contatti → `MobileListItem` |
| `TicketsTable` | `src/components/tickets/TicketsTable.tsx` | §6.6 Ticket → lista chip + `MobileListItem` |
| `KanbanBoard` | `src/components/pipeline/KanbanBoard.tsx` | §6.4 Pipeline → `Segmented` fasi + lista deal |
| `TeamMembersTable`, `SalespersonTable` | `src/components/team/*` | §6.10 Performance → top-N lista |
| Tabelle admin (Webhooks, DLQ, Cron, Audit, ecc.) | `src/pages/Admin*.tsx` | §6.14 read-only: solo `overflow-x-auto no-scrollbar` |

---

## 4. Hook dati per schermo SPEC §6

> Riusare così come sono — niente modifiche, solo presentazione mobile.

| Schermo SPEC | File pagina | Hook dati principali | Componenti riusabili |
|---|---|---|---|
| §6.1 Home generica | `pages/dashboard/DashboardOverview.tsx` | dipende dal ruolo (vedi sotto) | — |
| §6.2 CEO | `pages/dashboard/CeoDashboardView.tsx` | `useCeoDashboardBundle`, `useCeoDashboard`, `useCeoOperationalKpis` | `MobileCeoDashboard` (da rifattorizzare F1.8) |
| §6.1 Venditore | `pages/dashboard/SalespersonDashboard.tsx` | `useSalesOrders`, `useDealScoring`, `useAppointments` | — |
| §6.1 Resp. Venditori | `pages/dashboard/SalesManagerDashboard.tsx` | `useFunnelOverviewCompare`, `usePipeline`, `useDealTableViews` | — |
| §6.1 Resp./Op. Call Center | `pages/dashboard/CallcenterManagerDashboard.tsx`, `CallcenterOperatorDashboard.tsx` | `useCallcenterKpis`, `useTicketQueue`, `useTickets` | — |
| §6.1 Amministrazione | `pages/dashboard/AdminDashboard.tsx` | `useAdminTodos`, `useCeoDashboardBundle` | — |
| §6.3 Contatti | `pages/Contacts.tsx` | `useContacts`, `useContactsSales`, `useContactsRealtime` | `MobileListItem` (F1.6) |
| §6.4 Pipeline | `pages/Pipeline.tsx` | `usePipeline`, `usePipelineStagesAdmin`, `useDealScoring`, `useCanEditDeals` | `Segmented` (F1.4), `MobileListItem` |
| §6.5 Appuntamenti | `pages/Appointments.tsx` | `useAppointments` | `Segmented`, `MobileListItem` |
| §6.6 Ticket | `pages/Tickets.tsx` | `useTickets`, `useTicketsSearch`, `useTicketUrlState`, `useTicketBulkActions` | chip + `MobileListItem` |
| §6.7 Lead in arrivo | `pages/Events.tsx` | `useLeadsBySourceDay` + realtime | `MobileListItem` |
| §6.8 Chat | `pages/Chat.tsx` | `useChat` | layout messaging mobile |
| §6.9 Vendite/Prodotti/Azienda | `pages/Sales.tsx`, `Products.tsx`, `azienda/*` | `useSalesOrders`, hook dedicati | card+`KpiList` |
| §6.10 Performance Hub | `pages/PerformanceHub.tsx`, `pages/sales/SalesPerformanceSheet.tsx`, `team/SalespersonKpi.tsx` | `useChannelPerformance`, `useAdvancedAnalytics`, `useFunnelStageDrill` | `HeroMetricCard` + grafici semplificati |
| §6.11 Wallboard | `pages/CallcenterWallboard.tsx` | `useCallcenterKpis` (auto-refresh esistente) | numeri grandi `HeroMetricCard` |
| §6.12 Notifiche | `pages/Notifications.tsx` | hook notifiche esistenti (`NotificationBell`) | lista per data |
| §6.13 Settings | `pages/Settings.tsx`, `SettingsSecurity.tsx`, `SettingsSalesRoute.tsx` | hook impostazioni, `AppearanceMenuItems` | lista a gruppi iOS-style |
| §6.14 Admin/Sistema | `pages/Admin*.tsx` (≈35 pagine) | molteplici | solo non-rottura (overflow-x-auto) |

---

## 5. Mappatura IA mobile per ruolo (SPEC §5)

> Base per `useRoleMobileTabs` (task F0.4). Riusa la stessa logica di visibilità di `MainLayout` + `useRoleDashboard`.

| Ruolo (chiave `AppRole`) | Tab 1 Home → path | Tab 2 | Tab 3 (FAB) | Tab 4 | Tab 5 Menu |
|---|---|---|---|---|---|
| `admin` / `ceo` | `/dashboard/ceo` (o `/dashboard/admin`) | `/pipeline` | Cerca | `/notifications` | Menu sheet |
| `amministrazione` | `/dashboard/admin` | `/sales` | Cerca | `/notifications` | Menu sheet |
| `responsabile_venditori` | `/dashboard/responsabile-venditori` | `/pipeline` | Nuovo contatto | `/team/salespersons` | Menu sheet |
| `responsabile_callcenter` | `/dashboard/responsabile-callcenter` | `/tickets` | `/callcenter-wallboard` | `/notifications` | Menu sheet |
| `venditore` / `sales` | `/dashboard/venditore` | `/pipeline` | Nuovo contatto / Chiamata | `/appointments` | Menu sheet |
| `operatore_callcenter` / `callcenter` | `/dashboard/callcenter` | `/events` | Chiamata | `/tickets` | Menu sheet |

Note di matching:
- `useRoleDashboard().primaryPath` già fornisce la Home corretta per ogni ruolo.
- "Cerca" → riusa `GlobalSearchDialog` (vedi F2.3).
- "Menu" → `MobileMoreSheet` (F2.2), filtrato con la stessa funzione di visibilità di `MainLayout` (per non duplicare RBAC).

---

## 6. Note operative per le fasi successive

1. **Estrazione mobile esistente**: i 3 file in `ceo/mobile/*` sono già C-level; sono il riferimento estetico per la libreria F1.x.
2. **Provider intoccabili**: `AuthProvider`, `BrandProvider`, `QueryClientProvider`, `RealtimeProvider`, `ThemeProvider`, `TooltipProvider`. `MobileLayout` (F2.4) deve avvolgere lo stesso `<Outlet/>` senza duplicare provider.
3. **Code-splitting**: tutte le route sono già lazy. La libreria mobile dovrà essere importata dietro `useIsMobile()` per evitare di pesare sul bundle desktop (es. dynamic import di `MobileLayout`).
4. **Token mancanti** (per F0.2): `--success / --warning / --danger / --info / --surface / --surface-2` non presenti in `index.css`; le pagine usano `text-emerald-500/600`, `text-red-500/600`, `bg-amber-50` ecc. (vedi `MobileCeoDashboard`). Saranno sostituiti dai token nei refactor successivi.
5. **Helper numerici**: già disponibili `formatCurrency`, `formatKpi`, `formatPercent` in `src/lib/formatKpi.ts`.
6. **PullToRefresh**: nessuna implementazione esistente; sarà costruito in F1.7 sopra `react-query` (`queryClient.invalidateQueries`).

---

## 7. Esclusioni esplicite (per scope mobile)
- Le pagine `/admin/*` (35 route) → **§6.14, solo non-rottura**. Nessuna shell mobile dedicata, ma garantire `overflow-x-auto no-scrollbar` sulle tabelle.
- `MainLayout.tsx` e tutta la sidebar desktop → **intoccabili**.
- Backend, RLS, edge functions, schema DB, hook di fetch → **intoccabili**.
- Route, nomi route, `RoleGuard` → **intoccabili**.
