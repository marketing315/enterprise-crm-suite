## Onboarding amministratore: wizard `/setup`

### Obiettivo
Pagina `/setup` accessibile solo agli admin che mostra una checklist a 5 step con progress bar. Ogni step può essere completato inline (mini-form embedded) o "saltato" (rimane nello stato pending). Persistenza in DB così sopravvive ai reload e ai cambi device.

### 1. Persistenza stato setup

**Nuova tabella `admin_setup_progress`** (per-utente, non per-brand: l'admin vede il proprio progress globale):
- `user_id uuid` (PK, FK → users.id)
- `brand_created_at timestamptz`
- `users_invited_at timestamptz`
- `webhook_source_created_at timestamptz`
- `ticket_sla_configured_at timestamptz`
- `integration_connected_at timestamptz` (Meta o Google, conta come "tentato anche se solo skippato")
- `dismissed_at timestamptz` (l'admin può dismissare l'intero wizard)
- `created_at`, `updated_at`

RLS: solo il proprietario (`get_user_id(auth.uid()) = user_id`) o admin può leggere/scrivere il proprio record.

**RPC `mark_setup_step_complete(p_step text)`** — SECURITY DEFINER, valida `p_step IN (...)`, fa upsert sul proprio record settando il timestamp del campo corrispondente. Restituisce il record aggiornato. Solo per admin.

**RPC `get_admin_setup_progress()`** — ritorna il record dell'utente corrente + un campo derivato `auto_detected` che verifica davvero lo stato (vedi §3) per non far apparire come "da fare" cose già fatte prima dell'introduzione del wizard.

### 2. Pagina `/setup`

**Nuovo `src/pages/AdminSetup.tsx`** (rotta `/setup`, gated da `RoleGuard allowedRoles={['admin']}`).

Layout C-Level:
- Header con titolo "Configurazione iniziale", sottotitolo "5 passi per essere operativi", e una `<Progress>` shadcn (% completati) ben visibile.
- 5 card numerate (1→5), ognuna con: icona, titolo, descrizione 1-riga, badge stato (`Completato` / `Da fare` / `Saltato`), bottone azione contestuale.
- Card "completata" mostra check verde + timestamp; cliccabile per ri-aprire.
- In fondo: "Salta il setup" (set `dismissed_at`) + "Vai alla dashboard".

**Auto-redirect**: se l'admin loggato non ha mai completato setup AND `dismissed_at IS NULL` AND nessuno step auto-detected è completato, primo accesso → redirect da `/dashboard` a `/setup`. Dopo aver dismissato o completato tutti gli step, mai più auto-redirect.

**Punto di ingresso permanente**: voce nel dropdown utente "Configurazione iniziale" (visibile solo agli admin), per riaprire il wizard quando vogliono.

### 3. Auto-detection dello stato (cruciale)

Per gli admin esistenti con dati già presenti, gli step già completati devono mostrare check verde subito, senza che debbano "rifarli". RPC `get_admin_setup_progress()` aggiunge:

- `brand_created`: TRUE se esiste almeno 1 brand nella tabella `brands` non-system.
- `users_invited`: TRUE se ci sono ≥3 record in `users` (self-count incluso).
- `webhook_source_created`: TRUE se esiste ≥1 riga in `webhook_sources` per i brand dell'admin.
- `ticket_sla_configured`: TRUE se esiste ≥1 riga in `ticket_escalation_policies` o se esistono ticket con SLA configurato.
- `integration_connected`: TRUE se Meta/Google OAuth connection presente (controllo `oauth_integrations` o equivalente — verifico schema con linter).

Lo step si mostra completato se **OR** dei due flag (manuale `*_at` oppure auto-detected). Niente lavoro doppio.

### 4. Step 1-5: implementazione delle card

**Step 1 — Crea il primo brand**
- Card con form inline (Nome + Slug auto-derivato), riusa la logica di `BrandSelector.createBrandMutation` (estraggo in `useCreateBrand` hook condiviso per evitare duplicazione).
- Dopo successo → `mark_setup_step_complete('brand_created')` + auto-select del nuovo brand.

**Step 2 — Invita 2-3 utenti**
- Card con mini-form ripetibile (max 3 righe): email + ruolo (Select da `AppRole`).
- Riusa edge function esistente `admin-create-user` (un invio per utente).
- Step completato quando ne è stato invitato almeno 1; etichetta mostra "1/3 invitati" e suggerisce di continuare (ma è già "Completato").

**Step 3 — Configura una sorgente webhook inbound di test**
- CTA "Apri configurazione sorgenti" → naviga a `/settings?section=inbound-sources` (mantiene il flusso esistente, non ricreare UI complessa).
- Step auto-completato dall'auto-detection appena viene creato il primo webhook source.
- In alternativa: bottone "Crea sorgente di test" che fa POST a `webhook_sources` con un preset (`name: "Test webhook"`, `provider: "generic"`, brand corrente).

**Step 4 — Configura SLA ticket**
- Card con form inline: 3 input numerici (L1/L2/L3 minutes) + Select brand applicabile.
- Submit fa upsert in `ticket_escalation_policies` (RPC esistente o insert diretto, verifico).
- Default suggeriti: 30 / 120 / 480 (allineati al cron escalation runner).

**Step 5 — Collega Meta o Google (opzionale)**
- Card con 2 CTA: "Collega Meta Ads" → `/settings?section=meta-apps`, "Collega Google Ads" → `/settings?section=oauth-channels`.
- Bottone "Salta questo passo" → `mark_setup_step_complete('integration_connected')` con `dismissed_at` solo per questo step (interpretato come "skippato consapevolmente").

### 5. Riduzione attrito

- Dopo completamento di tutti gli step → toast "Setup completato" + redirect a `/dashboard`.
- Banner persistente in cima alle pagine admin se `setup_progress` è < 60% e `dismissed_at IS NULL`: "Hai 2/5 passi rimanenti — completa la configurazione" con link a `/setup`. Si chiude con X (set `dismissed_at`).

### Out of scope

- Onboarding non-admin (già coperto da `WelcomeModal` + `AppTour`).
- Configurazione avanzata (categorie spese, custom fields, pipeline stages personalizzati): rimangono in Settings. Il wizard punta solo all'essenziale per essere operativi.
- Wizard multi-tenant (un wizard separato per ogni nuovo brand): fuori scope, primo brand è sufficiente.

### File creati / modificati

**Nuovi:**
- `src/pages/AdminSetup.tsx` — pagina wizard.
- `src/components/setup/SetupStepCard.tsx` — card riutilizzabile (props: number, title, description, status, children).
- `src/components/setup/steps/Step1CreateBrand.tsx`
- `src/components/setup/steps/Step2InviteUsers.tsx`
- `src/components/setup/steps/Step3WebhookSource.tsx`
- `src/components/setup/steps/Step4TicketSla.tsx`
- `src/components/setup/steps/Step5Integrations.tsx`
- `src/components/setup/SetupReminderBanner.tsx` — banner top-page persistente.
- `src/hooks/useAdminSetupProgress.ts` — query + mutation `markStepComplete`.
- `src/hooks/useCreateBrand.ts` — estratto da `BrandSelector` per riuso.
- 1 migration SQL: tabella `admin_setup_progress` + 2 RPC + RLS.

**Modificati:**
- `src/App.tsx` — aggiunge rotta `/setup` con `RoleGuard admin`.
- `src/components/auth/ProtectedRoute.tsx` o `DashboardRedirect` — auto-redirect primo accesso admin senza setup.
- `src/components/layout/MainLayout.tsx` — voce dropdown "Configurazione iniziale" (solo admin) + render `<SetupReminderBanner />` sopra `<Outlet/>`.
- `src/components/layout/BrandSelector.tsx` — refactor minimo per usare `useCreateBrand`.

**Memory aggiornata**: `mem://features/admin-setup-wizard` (nuova) — flusso 5 step, auto-detection, persistenza per-utente.
