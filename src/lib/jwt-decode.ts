/**
 * F8: small helper to decode the `exp` claim of a Supabase JWT without
 * verifying it (verification happens server-side). We only need to know
 * if the token is about to expire so realtime can be re-authed before
 * the WebSocket gets disconnected by the server.
 *
 * Returns the expiration as a unix epoch in seconds, or `null` if the
 * token is malformed.
 */
export function decodeJwtExp(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // base64url -> base64
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = typeof atob === "function" ? atob(padded) : "";
    if (!json) return null;
    const payload = JSON.parse(json);
    return typeof payload?.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Returns seconds until expiry, or `null` if unknown.
 */
export function secondsUntilExpiry(token: string | null | undefined): number | null {
  const exp = decodeJwtExp(token);
  if (exp === null) return null;
  return exp - Math.floor(Date.now() / 1000);
}
