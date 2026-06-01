## Fase 3 — RBAC Modello 3 (open + pending)

### Obiettivo
Permettere a chiunque acceda (passkey, Google/Apple via bridge Lovable, email/password) di entrare in CRM in **stato pending**, senza ruoli né brand, e mostrare una schermata "in attesa di approvazione" finché un admin non lo abilita assegnando brand + ruolo.

### Stato attuale rilevato
- `public.users`: NO colonna `status`. Tutti gli utenti sono trattati come attivi.
- `public.user_roles`: gate effettivo (utente senza riga = nessun accesso). Oggi un utente senza ruoli vede schermata vuota / errori RLS.
- `supabase.auth`: `disable_signup = true` (Sprint 3). Va riattivato per consentire signup open.
- `AuthContext`: non distingue "in attesa approvazione" da "nessun brand selezionato".

### Database (1 migrazione additiva)
1. **enum `user_status`**: `pending | active | suspended` (additivo).
2. **`public.users.status`** `user_status NOT NULL DEFAULT 'pending'`.
   - Backfill esistenti: utenti con almeno una riga in `user_roles` → `active`; restanti → `pending`.
3. **Trigger `on_auth_user_created_provision`** su `auth.users` AFTER INSERT:
   - Inserisce `public.users(supabase_auth_id, email, full_name, avatar_url, status='pending')` se non esiste.
   - Estrae `full_name`/`avatar_url` da `raw_user_meta_data` (per Google/Apple).
   - Idempotente (ON CONFLICT DO NOTHING).
4. **RPC `approve_pending_user(p_user_id uuid, p_brand_id uuid, p_role app_role, p_can_access_children bool)`** SECURITY DEFINER:
   - Guard: caller deve essere admin del brand target o system admin o CEO (`has_role_for_brand`).
   - Set `users.status='active'`, INSERT `user_roles` (ON CONFLICT update is_active=true).
   - Rate-limit critico (`consume_critical_rate_limit`, riusa pattern H2).
   - Audit via `log_audit_event('user_approved', ...)`.
5. **RPC `reject_pending_user(p_user_id uuid, p_reason text)`** SECURITY DEFINER:
   - Set `status='suspended'`, audit `user_rejected`.
6. **RPC `list_pending_users()`** SECURITY DEFINER: ritorna utenti `status='pending'` visibili al caller (admin del brand "X" vede tutti i pending non assegnati; system admin/CEO vedono tutti).
7. **Notifica admin**: trigger AFTER INSERT su `public.users WHEN NEW.status='pending'` → INSERT `notifications(type='user_pending_approval', entity_type='user', entity_id=NEW.id)` per ogni admin (system + per ogni brand admin) + CEO. Riusa pattern chat-notifications.
8. **RLS**: nessuna modifica ad altre tabelle. La policy di `user_roles` resta invariata (admin scoped al brand).

### Backend / Auth config
- `supabase.configure_auth({ disable_signup: false, password_hibp_enabled: true, auto_confirm_email: false, external_anonymous_users_enabled: false })`.
- Edge function `biometric-pin-login` e `passkey-auth-verify` già emettono sessione tramite `_shared/issue-session.ts`; il trigger di provisioning si attiva sull'INSERT in `auth.users` quindi copre automaticamente passkey + OAuth bridge + email/password.

### Frontend
1. **`src/contexts/AuthContext.tsx`**: dopo `getUser()`, leggere `public.users.status`. Esporre `userStatus: 'pending'|'active'|'suspended'|null`.
2. **`src/components/auth/PendingApprovalScreen.tsx`** (nuovo): card C-level con messaggio "Il tuo account è in attesa di approvazione", email di supporto, pulsante "Esci".
3. **`src/components/auth/SuspendedScreen.tsx`** (nuovo): card "Account sospeso, contatta l'amministratore".
4. **`src/App.tsx` / route guard**: prima del `BrandSelector`/`MfaGuard`, se `userStatus !== 'active'` mostrare la schermata corrispondente.
5. **`src/pages/admin/PendingUsersPage.tsx`** (nuovo) + rotta `/admin/pending-users`:
   - Lista utenti pending con email, nome, data signup, provider (passkey/google/apple/email).
   - Per ogni riga: dialog "Approva" (select brand + select ruolo + checkbox can_access_children) → chiama `approve_pending_user`.
   - Pulsante "Rifiuta" con motivo → `reject_pending_user`.
6. **Sidebar** (area admin): voce "Approvazioni utenti" con badge count pending (riusa pattern notifiche).
7. **Login form**: riattivare CTA "Crea account" (oggi nascosta per `disable_signup`). Dopo signup mostrare schermata pending.

### Sicurezza
- Niente auto-grant di ruoli: stato pending è il default sicuro.
- RPC approve/reject solo SECURITY DEFINER con guard ruolo + rate-limit + audit.
- Trigger di provisioning idempotente per evitare doppi insert su retry.

### Memoria
Salvare `mem://features/rbac-open-pending-modello-3` con: enum `user_status`, RPC approve/reject/list, trigger provisioning, schermate pending/suspended, pagina admin, riattivazione signup.

### Fuori scope di questa fase
- Auto-link identità su email verificata (resta gestito dal bridge Lovable).
- Migrazione Google/Apple a OAuth nativo (Fasi 1/2, posticipate).
- Allowlist dominio email (Modello 2, scartato).