---
name: C7 OAuth CSRF Session + Redirect Whitelist
description: Cutover OAuth state da HMAC a session table single-use + enforcement redirect_uri whitelist su google/meta start+callback
type: feature
---

# C7 — OAuth CSRF + Redirect Whitelist

## Componenti
- **`public.oauth_sessions`** (csrf_token unique, user_id, brand_id, provider, redirect_uri, expires_at, consumed_at) — RLS service_role-only.
- **`public.oauth_redirect_whitelist`** (provider, redirect_uri, is_active) — admin read, service write. Seed: callback Supabase google/meta.
- **RPC** (SECURITY DEFINER, REVOKE da anon/authenticated):
  - `create_oauth_session(user_id, brand_id, provider, redirect_uri) → text`
  - `consume_oauth_session(csrf_token, provider) → jsonb` (atomic single-use)
  - `is_oauth_redirect_allowed(provider, redirect_uri) → boolean`
- **Helper edge** `_shared/oauth-session.ts`: `createOAuthSession`, `consumeOAuthSession`, `assertRedirectAllowed` (fail-closed, throw `oauth_redirect_uri_not_allowed`).

## Wiring
- `google-oauth-start` + `meta-oauth-start`: `assertRedirectAllowed` PRIMA di `createOAuthSession` → 400 se redirect non in whitelist.
- `google-oauth-callback` + `meta-oauth-callback`: `consumeOAuthSession(state, provider)` → 403 su replay/expired/mismatch (escape HTML del messaggio).

## Garanzie
- **Single-use**: `UPDATE ... WHERE consumed_at IS NULL` atomico → replay impossibile.
- **CSRF**: token 256-bit `crypto.getRandomValues` non guessable, no dipendenza da SUPABASE_SERVICE_ROLE_KEY come HMAC secret (rotation safe).
- **Open-redirect**: callback URL non controllabile da attaccante; whitelist enforced server-side.
- **Provider pinning**: state legato al provider, mismatch → reject.

## Test
- `scripts/tests/c7-oauth-csrf-redirect-e2e.sql` (whitelist allow/deny, single-use, replay, provider mismatch).
