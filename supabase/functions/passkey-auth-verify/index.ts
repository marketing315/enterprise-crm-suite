// Edge function: passkey-auth-verify
// Verifica una asserzione WebAuthn discoverable e restituisce una sessione Supabase.
//
// Lookup credenziale: prima nella tabella canonica `user_passkeys` (multi-dispositivo),
// poi fallback su `user_biometric_credentials` (legacy / passkey "principale" registrata
// insieme al PIN).
//
// Sicurezza:
// - challenge single-use (consumed_at) con TTL 3 min, allineato a passkey-auth-begin
// - sign_count monotonico (anti-clone)
// - rate-limit IP
// - verifyAuthenticationResponse di @simplewebauthn/server
// - sessione emessa via helper condiviso _shared/issue-session.ts

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { verifyAuthenticationResponse } from "npm:@simplewebauthn/server@10.0.1";
import { issueSessionForEmail } from "../_shared/issue-session.ts";

const CHALLENGE_TTL_MS = 3 * 60_000;

interface Body {
  challenge?: string;
  rpId?: string;
  origin?: string;
  credentialId?: string;
  authenticatorData?: string;
  clientDataJSON?: string;
  signature?: string;
  userHandle?: string | null;
}

interface CredentialRow {
  source: "user_passkeys" | "user_biometric_credentials";
  id: string;
  user_id: string;
  public_key: ArrayBuffer | null;
  sign_count: number | null;
  transports: string[] | null;
  disabled_at: string | null;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = (await req.json().catch(() => null)) as Body | null;
    if (
      !body?.challenge ||
      !body.rpId ||
      !body.origin ||
      !body.credentialId ||
      !body.authenticatorData ||
      !body.clientDataJSON ||
      !body.signature
    ) {
      return json({ error: "invalid_payload" }, 422);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    try {
      const { data: allowed } = await admin.rpc("consume_ip_rate_limit", {
        _bucket: "passkey-auth-verify",
        _ip: ip,
        _max: 10,
        _window_seconds: 60,
      });
      if (allowed === false) return json({ error: "rate_limited" }, 429);
    } catch { /* opzionale */ }

    // 1) Consuma la challenge (single-use + TTL 3 min)
    const { data: ch, error: chErr } = await admin
      .from("passkey_auth_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("challenge_b64", body.challenge)
      .is("consumed_at", null)
      .gte("created_at", new Date(Date.now() - CHALLENGE_TTL_MS).toISOString())
      .select("id")
      .maybeSingle();
    if (chErr || !ch) {
      return json({ error: "challenge_invalid_or_expired" }, 401);
    }

    // 2) Lookup credenziale: prima user_passkeys (nuovo, multi-device),
    //    poi fallback user_biometric_credentials (legacy / passkey "primaria")
    const credIdBytes = b64urlToBytes(body.credentialId);
    const cred = await lookupCredential(admin, credIdBytes);

    if (!cred) {
      await audit(admin, "passkey_login_failed", { reason: "credential_not_found", ip });
      return json({ error: "credential_not_found" }, 401);
    }
    if (cred.disabled_at) {
      return json({ error: "credential_disabled" }, 401);
    }
    if (!cred.public_key) {
      return json({ error: "credential_needs_reregistration" }, 409);
    }

    // 3) Verifica firma WebAuthn
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: {
          id: body.credentialId,
          rawId: body.credentialId,
          type: "public-key",
          clientExtensionResults: {},
          response: {
            authenticatorData: body.authenticatorData,
            clientDataJSON: body.clientDataJSON,
            signature: body.signature,
            userHandle: body.userHandle ?? undefined,
          },
        },
        expectedChallenge: body.challenge,
        expectedOrigin: body.origin,
        expectedRPID: body.rpId,
        credential: {
          id: body.credentialId,
          publicKey: new Uint8Array(cred.public_key as ArrayBuffer),
          counter: Number(cred.sign_count ?? 0),
          transports: (cred.transports ?? undefined) as AuthenticatorTransport[] | undefined,
        },
        requireUserVerification: true,
      });
    } catch (e) {
      console.error("[passkey-verify] signature error", (e as Error).message);
      await audit(admin, "passkey_login_failed", { reason: "signature_invalid", ip });
      return json({ error: "signature_invalid" }, 401);
    }

    if (!verification.verified) {
      await audit(admin, "passkey_login_failed", { reason: "not_verified", ip });
      return json({ error: "not_verified" }, 401);
    }

    // 4) Anti-clone: sign_count deve aumentare (eccetto 0=non supportato dall'authenticator)
    const newCounter = verification.authenticationInfo.newCounter;
    const oldCounter = Number(cred.sign_count ?? 0);
    if (newCounter !== 0 && newCounter <= oldCounter) {
      await audit(admin, "passkey_login_failed", {
        reason: "counter_regression",
        old: oldCounter,
        new: newCounter,
      });
      return json({ error: "counter_regression" }, 401);
    }

    await admin
      .from(cred.source)
      .update({ sign_count: newCounter, last_used_at: new Date().toISOString() })
      .eq("id", cred.id);

    // 5) Recupera email dell'utente per il helper sessione
    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(cred.user_id);
    if (userErr || !userRes?.user?.email) {
      return json({ error: "user_not_found" }, 401);
    }

    // 6) Emetti sessione via helper condiviso
    const sessionRes = await issueSessionForEmail(admin, userRes.user.email);
    if (!sessionRes.ok) {
      console.error("[passkey-verify] issue session failed", sessionRes.reason, sessionRes.detail);
      return json({ error: "session_unavailable" }, 500);
    }

    await audit(admin, "passkey_login_success", {
      user_id: cred.user_id,
      source: cred.source,
      ip,
    });

    return json({
      access_token: sessionRes.session.access_token,
      refresh_token: sessionRes.session.refresh_token,
      expires_at: sessionRes.session.expires_at,
      user_id: cred.user_id,
    });
  } catch (e) {
    console.error("[passkey-verify] uncaught", e);
    return json({ error: "internal" }, 500);
  }
};

Deno.serve(handler);


async function lookupCredential(
  admin: SupabaseClient,
  credIdBytes: Uint8Array,
): Promise<CredentialRow | null> {
  // 1) Tabella nuova
  const { data: pk } = await admin
    .from("user_passkeys")
    .select("id, user_id, public_key, sign_count, transports, disabled_at")
    .eq("credential_id", credIdBytes)
    .maybeSingle();
  if (pk) {
    return {
      source: "user_passkeys",
      id: pk.id as string,
      user_id: pk.user_id as string,
      public_key: pk.public_key as ArrayBuffer | null,
      sign_count: pk.sign_count as number | null,
      transports: pk.transports as string[] | null,
      disabled_at: pk.disabled_at as string | null,
    };
  }

  // 2) Fallback legacy
  const { data: legacy } = await admin
    .from("user_biometric_credentials")
    .select("id, user_id, public_key, sign_count, transports, disabled_at")
    .eq("credential_id", credIdBytes)
    .maybeSingle();
  if (legacy) {
    return {
      source: "user_biometric_credentials",
      id: legacy.id as string,
      user_id: legacy.user_id as string,
      public_key: legacy.public_key as ArrayBuffer | null,
      sign_count: legacy.sign_count as number | null,
      transports: legacy.transports as string[] | null,
      disabled_at: legacy.disabled_at as string | null,
    };
  }

  return null;
}

async function audit(
  admin: SupabaseClient,
  action: string,
  details: Record<string, unknown>,
) {
  try {
    await admin.rpc("log_audit_event", {
      _event_type: "auth_event",
      _action: action,
      _details: details,
    });
  } catch { /* non-fatal */ }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
