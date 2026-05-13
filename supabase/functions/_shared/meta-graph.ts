// Centralized Meta Graph API helper.
// - META_GRAPH_VERSION single source of truth (bump here, not scattered).
// - appsecretProof() implements `appsecret_proof = HMAC-SHA256(app_secret, access_token)`
//   per https://developers.facebook.com/docs/graph-api/security#appsecret_proof
// - withProof() returns a copy of a URL with `access_token` + `appsecret_proof` set.
//
// Usage:
//   import { META_GRAPH_VERSION, withProof, appsecretProof } from "../_shared/meta-graph.ts";
//   const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${id}/leads`);
//   url.searchParams.set("fields", "id,created_time");
//   const final = await withProof(url, pageToken, appSecret);
//   const res = await fetch(final);
//
// If `appSecret` is null/empty, withProof() simply sets `access_token` and skips the proof
// (so the helper is safe to use even when the app does NOT have "Require App Secret Proof"
// enabled or when the secret is not yet configured per brand).

export const META_GRAPH_VERSION = "v21.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const META_OAUTH_DIALOG_BASE = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;

export function metaGraphUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${META_GRAPH_BASE}${clean}`;
}

/**
 * HMAC-SHA256 of the access token, keyed by the app secret, hex-encoded.
 * Returns null if appSecret is empty/null (caller should skip the param then).
 */
export async function appsecretProof(
  accessToken: string,
  appSecret: string | null | undefined,
): Promise<string | null> {
  if (!appSecret || !accessToken) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(accessToken));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns a string URL with `access_token` (and optionally `appsecret_proof`) set.
 * Accepts a URL instance or a plain string.
 */
export async function withProof(
  urlInput: URL | string,
  accessToken: string,
  appSecret?: string | null,
): Promise<string> {
  const u = typeof urlInput === "string" ? new URL(urlInput) : urlInput;
  u.searchParams.set("access_token", accessToken);
  const proof = await appsecretProof(accessToken, appSecret);
  if (proof) u.searchParams.set("appsecret_proof", proof);
  return u.toString();
}

/**
 * Same as withProof but returns the proof as a separate value, useful when the caller
 * needs to put `access_token` in a request body instead of the query string.
 */
export async function proofParams(
  accessToken: string,
  appSecret?: string | null,
): Promise<{ access_token: string; appsecret_proof?: string }> {
  const proof = await appsecretProof(accessToken, appSecret);
  return proof
    ? { access_token: accessToken, appsecret_proof: proof }
    : { access_token: accessToken };
}
