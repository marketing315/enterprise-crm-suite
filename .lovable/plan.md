## Personalizzazione minima

### 1. Tema chiaro / scuro (next-themes già installato)

- **Nuovo file `src/components/providers/ThemeProvider.tsx`**: wrapper su `next-themes` `ThemeProvider` con `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange` per evitare flash sul primo render.
- **`src/main.tsx`** o **`src/App.tsx`**: avvolgere l'app con `<ThemeProvider>` (mantenere ordine: AuthProvider → BrandProvider → ThemeProvider all'esterno per evitare re-mount al login).
- **`src/index.css`**: i token `--*` sotto `.dark` esistono già (controllato), nessuna modifica al design system.
- **`src/components/layout/MainLayout.tsx`** (riga ~519, dropdown "Il mio account", presente in 2 punti — desktop ~505 e mobile ~601):
  - Nuovo sub-menu **Aspetto** con `DropdownMenuSub` o 3 voci dirette: "Tema chiaro" / "Tema scuro" / "Sistema" con check accanto al tema attivo (`useTheme()`).
  - Icona `Sun` / `Moon` / `Monitor` da lucide.

### 2. Densità tabelle (compact / comoda) + preferenze UI persistite

Niente colonna `ui_preferences` su `users` (la tabella oggi non ce l'ha): più sicuro creare una tabella dedicata, evita di ampliare `users` ed è coerente con le memory di data-safety.

**Migrazione SQL (additive-only):**
```sql
create table public.user_ui_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  theme text,                       -- 'light' | 'dark' | 'system' (mirror lato server, opzionale)
  density text not null default 'comfortable', -- 'comfortable' | 'compact'
  language text not null default 'it',
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_ui_preferences enable row level security;
create policy "ui_prefs_self_select" on public.user_ui_preferences for select
  using (user_id = public.get_user_id(auth.uid()));
create policy "ui_prefs_self_upsert" on public.user_ui_preferences for insert
  with check (user_id = public.get_user_id(auth.uid()));
create policy "ui_prefs_self_update" on public.user_ui_preferences for update
  using (user_id = public.get_user_id(auth.uid()));
```

**Frontend:**
- **Nuovo `src/hooks/useUIPreferences.ts`**: TanStack Query GET/UPSERT su `user_ui_preferences`. Cache locale via `userScopedStorage` per applicare la densità immediatamente al boot prima della query (evita flash).
- **Nuovo `src/components/providers/DensityProvider.tsx`**: legge la preferenza, applica `data-density="compact"` su `document.documentElement`.
- **`src/index.css`**: regole CSS basate su attributo:
  ```css
  [data-density="compact"] table th,
  [data-density="compact"] table td { padding-top: 6px; padding-bottom: 6px; }
  [data-density="compact"] [data-row] { min-height: 32px; }
  ```
  (Niente toccare i token globali — solo override dentro tabelle.)
- **Dropdown utente**: aggiungere voce "Densità tabelle" con scelta Comoda / Compatta.

### 3. Estensione `useTableViews` a Deal e Ticket

Oggi `contact_table_views` è specifico per Contatti (FK `owner_user_id`, payload `columns`/`filters`). Generalizziamo senza rompere l'esistente.

**Migrazione SQL (additive):**
- Nuove tabelle gemelle **`deal_table_views`** e **`ticket_table_views`** con schema identico a `contact_table_views` (stesse colonne, stessi index, stesse policy). Motivo: zero rischio per i dati esistenti, types.ts auto-generato pulito, niente migrazione dati.
- (Alternativa più pulita ma più invasiva: tabella unica `table_views` con `entity_type`. Scartata per memory di data-safety: non vogliamo migrare le view esistenti dei Contatti.)

**Frontend:**
- **Refactor `src/hooks/useTableViews.ts`** in factory: estrai `createTableViewsHook({ table, defaultColumns })` che ritorna `{ useTableViews, useActiveTableView, useSaveTableView, useDeleteTableView, useUpdateTableView }`.
- **Nuovi `src/hooks/useDealTableViews.ts`** e **`src/hooks/useTicketTableViews.ts`** che istanziano la factory.
- **`src/components/contacts/views/*`** (TableViewSelector, SaveViewDialog, EditViewDialog, ColumnManager): rendere agnostici al tipo (props `viewsHook`, `defaultColumns`). Spostare in `src/components/shared/views/` e re-export per i Contacts esistenti per non rompere import.
- **Pagine Deal e Ticket**: dove esistono filtri/colonne (es. `DealsListPage`, `TicketsTable`), agganciare lo stesso selettore di view + colonne configurabili. Se la tabella Ticket non supporta ancora colonne dinamiche, primo step: solo salvataggio filtri (status, assignee, priority, sla).

### 4. Struttura i18n con react-i18next (preparazione, no full translation)

- **Dipendenze**: `i18next`, `react-i18next`, `i18next-browser-languagedetector`.
- **Nuovo `src/i18n/index.ts`**: init con `lng: 'it'`, `fallbackLng: 'it'`, `supportedLngs: ['it', 'en']`, `interpolation.escapeValue: false`. Detector che legge prima `user_ui_preferences.language`, poi `navigator.language`.
- **Nuovi file risorse**:
  - `src/i18n/locales/it/common.json` (label dropdown utente, "Esci", "Tema", "Densità", "Lingua", "Comoda", "Compatta", "Chiaro", "Scuro", "Sistema").
  - `src/i18n/locales/en/common.json` con le stesse chiavi tradotte (per sanity check struttura).
- **`src/main.tsx`**: `import './i18n'` prima di `ReactDOM.createRoot`.
- **Adozione iniziale**: usare `t()` SOLO nelle nuove voci del menu Aspetto/Densità/Lingua e nel toggle lingua. **Non** sweep massivo dei testi italiani esistenti — la struttura è pronta ma la migrazione progressiva avverrà file-per-file in PR future.
- **Voce "Lingua"** nel dropdown utente: Italiano / English. Salva in `user_ui_preferences.language` e chiama `i18n.changeLanguage()`.

### Out of scope (esplicito)

- Migrazione delle stringhe italiane hardcoded esistenti a `t()` (sweep separato).
- Skin/temi colore custom oltre chiaro/scuro.
- Salvataggio densità per-tabella (per ora globale).

### File toccati / creati

**Nuovi:**
- `src/components/providers/ThemeProvider.tsx`
- `src/components/providers/DensityProvider.tsx`
- `src/hooks/useUIPreferences.ts`
- `src/hooks/useDealTableViews.ts`
- `src/hooks/useTicketTableViews.ts`
- `src/components/shared/views/*` (spostati da `contacts/views/`)
- `src/i18n/index.ts`, `src/i18n/locales/{it,en}/common.json`
- 1 migration SQL (tabelle `user_ui_preferences`, `deal_table_views`, `ticket_table_views` + RLS)

**Modificati:**
- `src/main.tsx` (i18n + Theme + Density provider)
- `src/components/layout/MainLayout.tsx` (sub-menu Aspetto / Densità / Lingua, 2 occorrenze desktop+mobile)
- `src/index.css` (regole `[data-density="compact"]`)
- `src/hooks/useTableViews.ts` (factory)
- `src/components/contacts/ContactsTableWithViews.tsx` (import dal nuovo path shared)
- `package.json` (3 deps i18n)

**Memory da aggiornare dopo l'implementazione:**
- Nuova memory `mem://features/personalization-preferences` con tabella `user_ui_preferences`, struttura i18n, tabelle `*_table_views` parallele.
