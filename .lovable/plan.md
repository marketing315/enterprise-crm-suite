
# Meta Lead Ads — Piano implementazione (4 stream)

Tutto si appoggia sull'infrastruttura esistente: `meta_apps`, `meta_lead_sources`, `_shared/meta-secrets.ts` (vault A2), `_shared/oauth-session.ts` (CSRF C7), `_shared/circuit-breaker.ts` (H7), `_shared/safe-error-response.ts` (H6).

## Stream 1 — Bump Graph API v20 → v21 + appsecret_proof

**Cosa:**
- Centralizzo versione e proof in `supabase/functions/_shared/meta-graph.ts` (nuovo): costante `META_GRAPH_VERSION = "v21.0"` + helper `appsecretProof(token, appSecret)` + `metaFetch(url, { token, appSecret })` che inietta `access_token` + `appsecret_proof` automaticamente.
- Refactor di tutte le edge function che chiamano `graph.facebook.com`:
  - `meta-oauth-start`, `meta-oauth-callback`
  - `meta-leads-webhook`, `meta-subscribe-page`, `meta-unsubscribe-page`
  - `meta-lead-sources-*` (list/sync forms/pages)
  - `capi-event-sender` (CAPI usa stessa proof)
  - eventuali `meta-ads-*` per insights
- `app_secret` letto da `meta_apps` via vault helper esistente.
- Test Deno: `meta-graph_test.ts` verifica HMAC della proof.

**Rischio:** zero se proof è opzionale lato Meta. Se "Require App Secret Proof" non è attivo nell'app, funziona uguale; se attivato in futuro, già pronto.

## Stream 2 — Scope completi + UI "collega pagina"

**Cosa:**
- `meta-oauth-start`: aggiungo scope mancanti `pages_manage_metadata`, `pages_manage_ads`, `leads_retrieval` (oggi ha solo `ads_read,ads_management,business_management`).
- `meta-oauth-callback`: dopo lo scambio code→token, chiama `fb_exchange_token` per long-lived, salva su `meta_oauth_tokens` (nuova tabella o campo su `meta_apps`).
- Nuova edge `meta-list-pages`: ritorna `/me/accounts` + `/me/businesses` + `/me/adaccounts` per la UI.
- Nuova edge `meta-connect-page`: dato `page_id`, recupera page-token non scadente da `/me/accounts`, crea/aggiorna riga `meta_apps` (page_id, brand, access_token via vault) e chiama `subscribed_apps` con `subscribed_fields=leadgen`.
- UI in `src/pages/Settings.tsx` sezione `meta-apps`:
  - Dopo callback OK → `MetaPageConnectDialog` che fa GET `meta-list-pages`, lista pagine con bottone "Collega" (chiama `meta-connect-page`), mostra stato `is_subscribed`.
  - Hook `useMetaPagesAvailable` accanto a `useMetaApps`.

**Migration:**
- Tabella `meta_oauth_tokens (brand_id, user_id, long_lived_token vault, expires_at, scopes[], created_at)` con RLS admin/ceo per brand.

## Stream 3 — Health-check token settimanale

**Cosa:**
- Nuova edge `meta-token-health-check`:
  - per ogni `meta_apps.is_active=true`: leggi token via vault, chiama `GET /debug_token?input_token=...&access_token={app_id}|{app_secret}`, leggi `is_valid`, `expires_at`, `scopes`.
  - aggiorna `meta_apps.token_status` (`valid|expiring|invalid`), `token_expires_at`, `token_last_checked_at`.
  - se `is_valid=false` o expires < 7 giorni → `report_client_incident` (F6) + notification webhook admin (canale `meta_token_health`).
- Migration: aggiungo colonne `token_status text default 'unknown'`, `token_expires_at timestamptz`, `token_last_checked_at timestamptz`, `token_scopes text[]` su `meta_apps` (additive, nullable).
- Cron via `cron-relay` esistente: registro `meta-token-health-check` ogni lunedì 06:00 Europe/Rome in `cron_job_registry` (A10).
- Dashboard admin: piccola card in `AdminObservability` o nuova `/admin/meta-health` con tabella stato token per brand.

## Stream 4 — Backfill storico lead per form

**Cosa:**
- Nuova edge `meta-leads-backfill`:
  - input: `{ meta_app_id, form_id, since? (ISO) }`
  - cursor pagination su `/{form_id}/leads?fields=id,created_time,ad_id,form_id,campaign_id,field_data&limit=100` (con filtering `time_created` se `since`)
  - per ogni lead → `mapLead(field_data)` → riusa la pipeline `lead-ingest` esistente (idempotenza per `external_lead_id = leadgen_id`).
  - risultato: `{ fetched, inserted, skipped_duplicates, errors[] }`, salvato in nuova tabella `meta_backfill_runs` per audit.
- Migration: tabella `meta_backfill_runs (id, brand_id, meta_app_id, form_id, since, fetched, inserted, skipped, errors jsonb, started_at, finished_at, status)` con RLS admin/ceo.
- UI: in `Settings → meta-apps`, per ogni page connessa, lista form (già esistente in `meta-lead-sources`) con bottone "Backfill" → dialog che chiede `since` (default ultimi 30gg), avvia job, mostra progress + risultato finale + link a contacts importati.

## Note tecniche

- Tutte le chiamate Graph passano per nuovo helper `metaFetch` → coerenza versione + proof + circuit breaker (`provider="meta_graph"`).
- Errori Graph mappati: 4/17/32/613 → backoff esponenziale; 190 → marca token invalid e triggera health-check; 200 → non-retry, log scope mancante.
- Logging: solo `code/subcode/fbtrace_id`, mai token né `field_data` in chiaro (rispetta C4 PII redaction + H6 safe error).
- Memoria: aggiorno `mem://features/meta-integration-flow` + nuovo `mem://technical/meta-graph-helper` con `META_GRAPH_VERSION` e regole proof.

## Ordine di esecuzione consigliato

1. **Stream 1** (helper + bump v21 + proof) — base condivisa, no migration.
2. **Stream 3** (migration meta_apps + health-check) — sblocca visibilità prima di toccare flussi utente.
3. **Stream 2** (scope + UI page connect) — depende da Stream 1.
4. **Stream 4** (backfill) — dipende da Stream 2 (page-token affidabile).

Approva per partire dallo Stream 1, oppure dimmi se vuoi un sottoinsieme/ordine diverso.
