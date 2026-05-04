## Header e azioni globali

Tre aggiunte all'header. Tutte basate su componenti già presenti (cmdk, breadcrumb.tsx, DropdownMenu).

### 1. Ricerca globale Cmd+K / Ctrl+K

Nuovo componente `src/components/search/GlobalSearchDialog.tsx`:

- Usa `<CommandDialog>` (`src/components/ui/command.tsx`, già basato su cmdk).
- Listener globale tastiera in MainLayout: `Cmd+K` / `Ctrl+K` apre il dialog (anche `/` opzionale, ma teniamo solo Cmd+K per evitare collisioni con campi di input).
- Input con debounce 200ms.
- Fan-out di 3 query parallele (limit 5 per gruppo) tramite `useQueries`, scoped al `currentBrand`:
  - **Contatti**: `contacts.select('id, first_name, last_name, contact_phones(phone_normalized)').or('first_name.ilike.%q%,last_name.ilike.%q%').eq('brand_id', currentBrand.id).limit(5)` — usa il pattern già presente in `useContacts`. Non usiamo `contact_search_index` perché richiede `to_tsquery` e l'overhead non si giustifica per top-5.
  - **Deal**: `deals.select('id, value, status, contact:contacts(first_name,last_name)').eq('brand_id', currentBrand.id).limit(5)` filtrando lato client per matching sul nome contatto, oppure JOIN; pratico: query separata che usa la sub-search sui contatti e mostra i deal collegati.
  - **Ticket**: `tickets.select('id, title, status').eq('brand_id', currentBrand.id).ilike('title', '%q%').limit(5)`.
- Risultati raggruppati con `<CommandGroup heading="Contatti|Deal|Ticket">`. Ogni `<CommandItem onSelect={...}>` naviga a `/contacts?id=…`, `/pipeline?deal=…`, `/tickets?id=…` (i pattern già esistenti).
- Empty state: "Inizia a digitare per cercare contatti, deal o ticket".
- Footer del dialog con la scorciatoia mostrata: `↵ apri · esc chiude · ⌘K`.
- Bottone in header (icona `Search` + label "Cerca…" con badge `⌘K` su md+) come affordance visuale.

### 2. Avatar utente in header

Nuovo blocco in `MainLayout.tsx` accanto a `NotificationBell`:

- `<DropdownMenu>` con trigger = `<Avatar>` (riuso degli stessi componenti già usati nel SidebarFooter, righe 488-518).
- Menù: nome utente + email come label, separatore, "Rivedi il tour iniziale" (`__restartAppTour`), "Esci" (`handleLogout`).
- L'avatar nel SidebarFooter viene **mantenuto** (utility per chi tiene la sidebar aperta) ma è ora ridondante. Non lo rimuoviamo per non rompere screenshot/onboarding tour: il dropdown è identico tra le due posizioni.

### 3. Breadcrumbs sotto l'header

Nuovo componente `src/components/layout/AppBreadcrumbs.tsx`:

- Mappa `useLocation().pathname` in segmenti leggibili (es. `/appointments/ops-board` → "Appuntamenti › Ops Board"). Mappa statica `LABELS: Record<string, string>` per le rotte note (riusa la stessa naming usata in `navItems` di MainLayout).
- Per segmenti UUID/ID (es. `/appointments/abc-123`) mostra "Dettaglio" come label (no fetch sincrono — semplice e veloce).
- Render con `<Breadcrumb>` da `src/components/ui/breadcrumb.tsx`.
- **Visibilità**: solo se `pathname.split('/').filter(Boolean).length >= 2` (pagine profonde). Niente breadcrumb su `/dashboard`, `/contacts`, etc.
- Posizionato in una riga sottile (`h-9`, sfondo `bg-muted/30`) tra `<header>` e `<main>` in `MainLayout.tsx` (linea ~566 prima di `<RealtimeStatusBanner />`).

### File toccati / creati

- **Creati**: `src/components/search/GlobalSearchDialog.tsx`, `src/components/layout/AppBreadcrumbs.tsx`.
- **Modificati**: `src/components/layout/MainLayout.tsx` (header: search trigger + avatar dropdown + listener Cmd+K; render `<AppBreadcrumbs />`).

Nessuna nuova dipendenza, nessuna migration, nessuna RPC. Le query rispettano il `currentBrand.id` già imposto in tutto il CRM.