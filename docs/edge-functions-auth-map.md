# Edge Functions Auth Matrix

**Last full audit:** 2026-05-04 (PR: edge-functions-config-completeness)

## Why this document exists

Functions **not** explicitly listed in `supabase/config.toml` inherit the
Supabase platform default, which is `verify_jwt = true`. With Supabase's
signing-keys system, that default **breaks** any function that:

- accepts cron callers (`x-cron-secret` instead of a user JWT),
- accepts inter-function calls (`x-internal-token` instead of a user JWT),
- accepts external HMAC webhooks (no JWT at all),
- accepts the MCP `Bearer mcp_xxx` token format,
- accepts the service-role bearer directly.

The fix is **always**: declare the function in `config.toml` with
`verify_jwt = false` and validate auth in code (`getClaims()`/`getUser()`,
constant-time compare for cron/internal tokens, HMAC verification, etc.).

## Hard rule (CI-enforceable)

> **Every directory under `supabase/functions/` (except `_shared`) MUST appear
> in `supabase/config.toml`.**
> A bare directory without an explicit declaration is a config bug.

`scripts/security/check-edge-functions-config.sh` enforces this. It is
intended to run in CI on every PR that touches `supabase/functions/**` or
`supabase/config.toml`.

## Auth pattern taxonomy

| Pattern | How auth is validated in code | Typical caller |
|---|---|---|
| `client-jwt` | `supabase.auth.getUser()` / `getClaims()` from the user's `Authorization` header | Frontend via `supabase.functions.invoke()` |
| `admin-client-jwt` | `getUser()` + `has_role(get_user_id(auth.uid()), 'admin'\|'ceo')` | Admin UI |
| `cron-relay` | `x-cron-secret` constant-time compared against `CRON_SECRET` (+ `CRON_SECRET_PREVIOUS` during rotation) | `cron-relay` edge function (driven by `pg_cron`) |
| `internal-token` | `x-internal-token` constant-time compared against `INTERNAL_SERVICE_TOKEN` | Other edge functions calling each other |
| `service-role` | `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` constant-time compared in code | Server-to-server only |
| `hmac-inbound` | HMAC-SHA256 signature verified against a per-source secret | External webhooks (Meta, Voispeed, Keplero, etc.) |
| `hmac-outbound` | Function only **sends** HMAC-signed payloads; inbound auth is `client-jwt` or `cron-relay` | Notification/SIEM dispatchers |
| `mcp-token` | `Bearer mcp_xxx` validated via `validate_mcp_token` RPC | External MCP clients |
| `oauth-callback` | OAuth `state` + signed code from provider | Browser redirect from Google/Meta |
| `public-probe` | None required; returns non-sensitive status only | Dashboard health widget |
| `cron-only` | `verify_jwt = true` is intentional — only Supabase's authenticated cron caller is allowed | Default Supabase scheduled invocation |

**`verify_jwt = false` is the right answer for every pattern except `cron-only`.**
Today only `cron-relay`, `process-email-queue`, and `backup-archive-signed-url`
keep `verify_jwt = true`, and they validate the cron anon JWT plus a secondary
secret in code.

## Full matrix (65 functions)

### Client-invoked (validate JWT in code)

| Function | verify_jwt | Pattern | Notes |
|---|---|---|---|
| `admin-create-user` | false | `admin-client-jwt` | restricted CORS allow-list |
| `admin-manage-team` | false | `admin-client-jwt` | restricted CORS allow-list |
| `admin-manage-users` | false | `admin-client-jwt` | restricted CORS allow-list; password policy |
| `ai-agent` | false | `client-jwt` | LLM gateway |
| `ai-call-apply` | false | `client-jwt` | applies AI proposals to CRM |
| `ai-call-proposals` | false | `client-jwt` | generates AI proposals |
| `ai-chat` | false | `client-jwt` | per-user daily quota (300/day) |
| `ai-classify` | false | `client-jwt` + cron-relay | dual entry |
| `ai-generate-automation` | false | `client-jwt` | wizard helper |
| `ai-generate-webhook-mapping` | false | `client-jwt` | wizard helper |
| `ai-tag-deals` | false | `client-jwt` + cron-relay | dual entry |
| `audit-alert-dispatcher` | false | `client-jwt` (admin) | HMAC outbound |
| `calculate-lead-score` | false | `client-jwt` | server-side validation |
| `ga4-stats-sync` | false | `admin-client-jwt` | Google OAuth token in code |
| `generate-weekly-report` | false | `client-jwt` + cron-relay | dual entry |
| `google-ads-sync` | false | `client-jwt` + cron-relay | dual entry |
| `health-check` | false | `public-probe` | non-sensitive status |
| `lead-digest-dispatch` | false | `client-jwt` + cron-relay | dual entry |
| `lead-digest-retry-dispatcher` | false | `cron-relay` | retry queue |
| `meta-create-test-lead` | false | `admin-client-jwt` | dev-only helper |
| `parse-sale-document` | false | `client-jwt` | OCR for QuickSale |
| `quick-backup-runner` | false | `admin-client-jwt` | tar.gz backups |
| `quick-restore-runner` | false | `admin-client-jwt` | restores from tar.gz |
| `sheets-export` | false | `client-jwt` | manual export trigger |
| `sheets-kpi-refresh` | false | `client-jwt` + cron-relay | dual entry |
| `sheets-leads-export` | false | `client-jwt` + cron-relay | dual entry |
| `siem-exporter` | false | `client-jwt` (admin) | HMAC outbound |
| `voispeed-call-request` | false | `client-jwt` | telephony bridge |
| `web-push-dispatcher` | false | `client-jwt` + trigger | also called via pg_net |
| `web-push-public-key` | false | `public-probe` | returns VAPID public key |

### Cron-driven (via cron-relay → x-cron-secret)

| Function | verify_jwt | Pattern | Notes |
|---|---|---|---|
| `ads-stats-meta` | false | `cron-relay` | |
| `automation-jobs-dispatcher` | false | `cron-relay` | |
| `automation-runner` | false | `cron-relay` | |
| `capi-event-sender` | false | `cron-relay` | |
| `notification-webhook-dispatcher` | false | `cron-relay` + HMAC outbound | |
| `payment-overdue-runner` | false | `cron-relay` | |
| `scheduled-backup-runner` | false | `cron-relay` | |
| `sheets-export-dispatcher` | false | `cron-relay` OR service-role | |
| `sheets-advanced-export` | false | `cron-relay` OR service-role | |
| `sheets-batch-export` | false | `service-role` Bearer | called by dispatcher |
| `sla-breach-checker` | false | `cron-relay` | |
| `slo-burn-rate-monitor` | false | `cron-relay` | persists `mcp_slo_alerts` |
| `ticket-assign-recovery` | false | `cron-relay` | |
| `ticket-escalation-runner` | false | `cron-relay` OR service-role | |
| `webhook-dispatcher` | false | `cron-relay` | round-robin fairness |

### External webhooks (no JWT — HMAC / signature / API key)

| Function | verify_jwt | Pattern | Notes |
|---|---|---|---|
| `auth-email-hook` | false | Supabase Auth hook signature | |
| `keplero-contact-lookup` | false | API key in query | 302 redirect |
| `keplero-webhook` | false | `hmac-inbound` | |
| `meta-leads-webhook` | false | Meta `X-Hub-Signature-256` | |
| `voispeed-events-webhook` | false | `hmac-inbound` | returns 500 to force retries |
| `webhook-ingest` | false | per-source HMAC OR API key | universal AI ingester |
| `send-n8n-webhook` | false | outbound only; `client-jwt` inbound | |

### OAuth callbacks (browser redirect, not JWT)

| Function | verify_jwt | Pattern |
|---|---|---|
| `google-oauth-callback` | false | `oauth-callback` |
| `google-oauth-start` | false | `oauth-callback` |
| `meta-oauth-callback` | false | `oauth-callback` |
| `meta-oauth-start` | false | `oauth-callback` |
| `meta-subscribe-page` | false | `oauth-callback` |

### Inter-function only (x-internal-token)

| Function | verify_jwt | Pattern | Notes |
|---|---|---|---|
| `mcp-gateway` | false | `client-jwt` + `internal-token` | MCP control plane |
| `mcp-server` | false | `mcp-token` | external MCP clients (`Bearer mcp_xxx`) |
| `trace-ingest` | false | `internal-token` | OTel ingestion |

### Genuinely cron-only (verify_jwt = true)

| Function | verify_jwt | Why |
|---|---|---|
| `cron-relay` | **true** | Receives Supabase cron anon JWT; re-emits with `x-cron-secret` |
| `process-email-queue` | **true** | Cron only; validates anon JWT |
| `backup-archive-signed-url` | **true** | Admin client signs; relies on JWT |

## Maintenance procedure

When you add a new edge function:

1. Pick the auth pattern from the taxonomy above.
2. Implement the validation in code (never rely on `verify_jwt` alone).
3. Add an explicit `[functions.<name>]` block to `supabase/config.toml` with
   the chosen `verify_jwt` value and a short comment.
4. Add a row to the matrix above.
5. CI guard `scripts/security/check-edge-functions-config.sh` will fail the
   PR if the function is missing from `config.toml`.

When you delete an edge function:

1. Remove `supabase/functions/<name>/`.
2. Remove the `[functions.<name>]` block from `config.toml`.
3. Remove the row from this matrix.
4. If it was a `cron-relay` target, remove it from `cron-relay/index.ts` too.
