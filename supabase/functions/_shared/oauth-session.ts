// C7: Session-based OAuth state (replaces HMAC-signed JWT-like state).
// Uses public.oauth_sessions table for single-use, server-side state tokens.
// Eliminates dependency on SUPABASE_SERVICE_ROLE_KEY as HMAC secret (rotation breaks all in-flight flows).

export interface OAuthSessionPayload {
  brand_id: string;
  user_id: string;
  provider: "google" | "meta" | "google_ads";
  redirect_uri: string;
}

export interface OAuthSessionRecord {
  brand_id: string;
  user_id: string;
  provider: string;
  redirect_uri: string;
}

/**
 * C7: Validate redirect_uri against `oauth_redirect_whitelist` via SECURITY DEFINER RPC.
 * Throws `oauth_redirect_uri_not_allowed` if missing from whitelist (fail-closed).
 */
export async function assertRedirectAllowed(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  provider: "google" | "meta" | "google_ads",
  redirectUri: string,
): Promise<void> {
  if (!redirectUri || typeof redirectUri !== "string") {
    throw new Error("oauth_redirect_uri_invalid");
  }
  const { data, error } = await serviceClient.rpc("is_oauth_redirect_allowed", {
    p_provider: provider,
    p_redirect_uri: redirectUri,
  });
  if (error) {
    throw new Error(`oauth_redirect_check_failed:${error.message}`);
  }
  if (data !== true) {
    throw new Error("oauth_redirect_uri_not_allowed");
  }
}

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create a single-use OAuth session and return the opaque CSRF token to put in the `state` URL param.
 */
export async function createOAuthSession(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  payload: OAuthSessionPayload,
): Promise<string> {
  const csrfToken = randomToken(32);
  const { error } = await serviceClient.from("oauth_sessions").insert({
    csrf_token: csrfToken,
    user_id: payload.user_id,
    brand_id: payload.brand_id,
    provider: payload.provider,
    redirect_uri: payload.redirect_uri,
  });
  if (error) {
    throw new Error(`oauth_session_create_failed:${error.message}`);
  }
  return csrfToken;
}

/**
 * Atomically consume a session by csrf_token. Returns the session payload or throws.
 * - Verifies not expired
 * - Verifies not already consumed (single-use)
 * - Marks consumed_at = now() so the same state cannot be replayed
 */
export async function consumeOAuthSession(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  csrfToken: string,
  expectedProvider: string,
): Promise<OAuthSessionRecord> {
  if (!csrfToken || typeof csrfToken !== "string" || csrfToken.length < 16 || csrfToken.length > 256) {
    throw new Error("oauth_state_invalid");
  }

  // Atomic claim: UPDATE ... WHERE consumed_at IS NULL AND expires_at > now() RETURNING *
  // Using rpc-less pattern: SELECT then UPDATE with check on consumed_at being still null.
  // Cleaner approach via an SQL function would be ideal, but this is race-safe enough since
  // csrf_token has unique constraint and the UPDATE filter rejects double-consumes.
  const { data: rows, error: updErr } = await serviceClient
    .from("oauth_sessions")
    .update({ consumed_at: new Date().toISOString() })
    .eq("csrf_token", csrfToken)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("brand_id, user_id, provider, redirect_uri")
    .limit(1);

  if (updErr) {
    throw new Error(`oauth_session_consume_failed:${updErr.message}`);
  }
  if (!rows || rows.length === 0) {
    throw new Error("oauth_state_expired_or_replayed");
  }

  const session = rows[0] as OAuthSessionRecord;
  if (session.provider !== expectedProvider) {
    throw new Error(`oauth_provider_mismatch:expected=${expectedProvider},got=${session.provider}`);
  }
  return session;
}
