# Onboarding alla prima login

Tre componenti incrementali, isolati, senza modificare flussi esistenti.

## 1. Schema DB additivo

Migration additiva su `public.users` (rispetta vincolo Data Safety: solo nuove colonne nullable):

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_name      text,
  ADD COLUMN IF NOT EXISTS primary_role_hint   text,         -- "sales" | "callcenter" | "admin" | "marketing" | "ceo" | "other"
  ADD COLUMN IF NOT EXISTS preferred_brand_id  uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS welcome_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS tour_completed_at    timestamptz;
```

RPC `complete_welcome(p_preferred_name, p_primary_role_hint, p_preferred_brand_id)` SECURITY DEFINER `search_path=public` — scrive le 4 colonne sull'utente corrente via `get_user_id(auth.uid())`. RPC `complete_tour()` analoga ma scrive solo `tour_completed_at`. REVOKE EXECUTE FROM anon su entrambe.

`user_module_access` non toccato. Nessuna RLS riscritta.

## 2. Welcome Modal post-signup

Nuovo `src/components/onboarding/WelcomeModal.tsx`:

- Si apre automaticamente quando `user.welcome_completed_at IS NULL` (lettura via nuovo hook `useOnboardingStatus`).
- Form a 3 campi: Nome preferito (default = primo token di `full_name`), Ruolo principale (Select con 6 opzioni), Brand di riferimento (Select alimentato da `useBrand()` brands list — opzionale).
- CTA "Inizia" → chiama `complete_welcome` RPC, invalida `["onboarding-status"]`, chiude modal.
- Posizionato in `MainLayout` (subito dopo `IncomingCallPopup`) per essere visibile su qualsiasi pagina post-login.
- Niente "skip": ma il modal è dismissibile via ESC senza persistere → al prossimo login riappare finché non viene completato. Esplicito nel footer: "Compila per personalizzare la tua esperienza".

## 3. Empty-state guidato sulla Dashboard

Nuovo `src/components/onboarding/DashboardEmptyState.tsx`:

- Mostrato in `Dashboard.tsx` (dopo l'header, prima dei KPI) quando `totalContacts === 0 && openDeals === 0 && newDeals === 0` AND `!isLoading`.
- 3 card minimal-glassmorphism con icona+titolo+microcopy+CTA:
  - **Aggiungi il primo contatto** → `navigate('/contacts?create=true')` (URL param già supportato, vedi mem chat-quick-actions).
  - **Configura un webhook inbound** → `navigate('/admin/webhooks')` (mostrato solo se `isAdmin`; altrimenti card "Importa contatti da CSV" → `/contacts?import=true` se la route esiste, fallback a `/contacts`).
  - **Invita un collega** → `navigate('/team?invite=true')` (mostrato solo se `isAdmin`).
- Nasconde i KPI vuoti quando l'empty-state è visibile per ridurre rumore. I grafici/trend restano nascosti finché ci sono ≥1 contatto.

Niente nuove tabelle: il check è puramente derivato dai dati esistenti già in `useDashboardData`.

## 4. Tour interattivo

Aggiungo dipendenza **`driver.js`** (vanilla, ~5KB gz, no React-deps, no peer-issue con React 18 — `react-joyride` ha bundle 3x e known issues con StrictMode).

Nuovo `src/components/onboarding/AppTour.tsx`:

- Si avvia automaticamente quando `welcome_completed_at IS NOT NULL && tour_completed_at IS NULL && hasBrandSelected`.
- 4 step: brand selector (`[data-tour="brand-selector"]`), sezione Quotidiano (`[data-tour="nav-daily"]`), bottone NotificationBell (`[data-tour="notifications"]`), CTA "Nuovo contatto" su Dashboard empty-state (`[data-tour="new-contact"]`).
- Ai dati attributes vengono aggiunti su: `BrandSelector` (root), `MainLayout` SidebarGroup "Quotidiano", `NotificationBell`, `DashboardEmptyState` prima card.
- "Salta tour" e "Fine" entrambi chiamano `complete_tour` RPC.
- Pulsante "Riavvia tour" già esiste? No: lo aggiungo come voce nel dropdown utente del footer sidebar ("Rivedi il tour iniziale") che azzera `tour_completed_at` localmente (state) e riavvia, senza scrivere in DB.

## 5. Hook condiviso

`src/hooks/useOnboardingStatus.ts`:

```ts
export function useOnboardingStatus() {
  // useQuery su users.{welcome_completed_at, tour_completed_at, preferred_name, ...}
  // staleTime: Infinity (cambia solo su mutazione esplicita)
  // ritorna { needsWelcome, needsTour, isLoading, refetch }
}
```

Mutazioni `useCompleteWelcome` / `useCompleteTour` che chiamano gli RPC e fanno `queryClient.invalidateQueries(["onboarding-status"])`.

## File toccati

**Nuovi**:
- `supabase/migrations/<ts>_user_onboarding.sql`
- `src/hooks/useOnboardingStatus.ts`
- `src/components/onboarding/WelcomeModal.tsx`
- `src/components/onboarding/DashboardEmptyState.tsx`
- `src/components/onboarding/AppTour.tsx`
- `mem://features/user-onboarding-flow.md` + index entry

**Modificati**:
- `src/components/layout/MainLayout.tsx` — monta `<WelcomeModal/>` e `<AppTour/>`, aggiunge `data-tour` su SidebarGroup "Quotidiano" e wrapper `BrandSelector`. Aggiunge voce dropdown utente "Rivedi tour".
- `src/pages/Dashboard.tsx` — render condizionale `<DashboardEmptyState/>` + nasconde KPI/charts quando empty.
- `src/components/notifications/NotificationBell.tsx` — aggiunge `data-tour="notifications"` su trigger.
- `package.json` — `npm install driver.js`.

## Cosa NON faccio

- Nessuna migrazione di utenti esistenti: `welcome_completed_at` parte NULL anche per chi è già nel sistema → vedrà il modal una volta. **Mitigazione**: il modal pre-popola tutti i campi con `full_name`/brand corrente, quindi l'utente esistente lo chiude in 2 secondi. Se non ti va, lo backfilliamo con `UPDATE users SET welcome_completed_at = created_at WHERE created_at < now()` come step finale della migration — ditemelo e lo aggiungo, di default lo includo per non spammare i 50+ utenti già attivi.
- Nessun cambio al flusso `/select-brand`.
- Niente A/B test, niente analytics esterni.
