# Settimana 2-3 P0 — Audit remediation (C4–C7, C9–C12, A3, F1, F6)

Stato: **completata** (additive, no breaking changes).

## Riepilogo finding

### C4 — PII safe payload outbound
- Migration: colonna `outbound_webhooks.pii_safe_payload boolean default false`.
- Helper `_shared/pii-sanitizer.ts` (HMAC pseudonimizzazione email/phone/first_name/last_name/address/tax_id/iban).
- `webhook-dispatcher` integra sanitize quando `pii_safe_payload=true` + whitelisting `ALLOWED_URL_PARAM_KEYS`.

### C7 — OAuth CSRF + redirect whitelist
- Tabelle `oauth_sessions` + `oauth_redirect_whitelist` con seed dei 2 callback Supabase.
- RPC `create_oauth_session`, `consume_oauth_session`, `is_oauth_redirect_allowed` (SECURITY DEFINER, solo service_role).
- Le edge function `*-oauth-callback` continuano con HMAC state attuale; le nuove RPC sono pronte per cutover futuro senza rompere flussi attivi.

### C9 — `user_roles_guard` defense-in-depth
- Trigger `BEFORE INSERT` su `user_roles` blocca cross-brand admin grant da utenti non-global-admin.
- Bypassa correttamente service_role / postgres / migration (auth.uid() NULL).

### C10 — Backup signed URL audit + revoke
- Tabella `backup_signed_url_audit` (user_id, brand_id, run_id, storage_path, expires_at, revoked_at, revoked_by).
- RPC `revoke_backup_signed_url(p_audit_id)` admin/CEO-only.
- `backup-archive-signed-url` ora popola la tabella ad ogni signed URL emesso.

### C11 — cron-relay locking + audit
- Tabella `cron_relay_log` + RPC `try_lock_cron_job(job_name, brand_id)` (advisory lock).
- `cron-relay` integra: skip con `lock_held` se job già in volo, persiste log con request_id, status, durata, errore.

### C12 — SSRF guard outbound
- `_shared/safe-outbound.ts` (assertSafeUrl, safeFetch) con block IPv4/IPv6 privati, link-local, ULA, metadata internal hosts.
- Integrato in: `webhook-dispatcher`, `notification-webhook-dispatcher`, `send-n8n-webhook`.

### C5/C6 — già coperti
- C5 CORS restricted: gestito da `_shared/cors.ts` (memoria progetto).
- C6 AI quota & context cap: già live in `ai-chat` (DAILY_QUOTA_AI_CHAT=300, MAX_TOTAL_INPUT_CHARS=12k, vedi memoria `ai-quota-and-context-cap`).

### A3 — audit_events immutable (già applicato)
- Migration `20260505084648_*`: trigger `audit_events_immutable` su BEFORE UPDATE/DELETE + REVOKE UPDATE/DELETE/TRUNCATE da PUBLIC/anon/authenticated.

### F1 — Sanitize markdown AI/utenti (rehype-sanitize)
- Nuovo wrapper `src/components/ui/SafeMarkdown.tsx` con `rehype-sanitize` (schema GitHub di default).
- Sostituito `ReactMarkdown` → `SafeMarkdown` in: `ChatMessageBubble`, `AgentChatPanel`, `ExecutiveSummaryCard`.
- Blocca `<script>`, `<iframe>`, attributi `on*`, `javascript:`/`data:` URI, style arbitrari → mitiga prompt-injection AI che tenti di iniettare HTML.

### F6 — Stack trace nascosti in produzione
- `ErrorBoundary` mostra il pannello "Dettagli tecnici" solo se `import.meta.env.DEV`. In prod l'utente vede ID errore + CTA, non il messaggio interno.

## Deploy
- Migration applicata: `20260505090613_settimana2_p0_hardening.sql`.
- Edge function deployate: `cron-relay`, `notification-webhook-dispatcher`, `send-n8n-webhook`, `backup-archive-signed-url`, `webhook-dispatcher`.
- Frontend: SafeMarkdown + ErrorBoundary prod-safe (no migration richiesta).

## Cosa NON è stato fatto (su richiesta)
- Cutover OAuth da HMAC state a session-based: tabelle/RPC pronte, ma il taglio richiede coordinamento con popup Google/Meta in produzione → rinviato.
- Drop colonne `*_token_encrypted`: vietato da Data Safety HARD.
- Rimanenti finding A1, A4–A10, F2–F5, F7–F8, H1–H14: pianificati per le iterazioni successive.

---

## Settimana 4 P0 — Auth rate limiting (A4–A10)

- Migration `auth_rate_limit` (additive): tabella + 2 RPC `consume_auth_rate_limit` / `reset_auth_rate_limit` + `cleanup_auth_rate_limit`.
- Soglie: signin 10/15min con lock 15min, password_reset 5/15min con lock 15min.
- Identity hash = `SHA-256(email_lower|scope)` (browser side, no email in chiaro al log).
- Wiring: `AuthContext.signIn` (consume + reset on success), `ForgotPasswordForm` (consume).
- Fail-open su RPC error (non bloccare il login se backend è giù).
- RLS: tabella accessibile solo a service_role; gli RPC sono SECURITY DEFINER esposti ad anon+authenticated.
