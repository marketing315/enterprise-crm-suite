// Edge function: passkey-register
// Salva una nuova passkey nella tabella user_passkeys (multi-dispositivo).
// Upsert idempotente su credential_id: se la stessa passkey viene ri-registrata
// (es. dopo C6 - legacy migration) si aggiornano i campi senza duplicare.
//
// Differenza rispetto alla versione precedente:
//  - INSERT (non UPDATE) → consente N passkey per utente (laptop, telefono, …)
//  - public_key_alg estratto dal CBOR/COSE reale (non più hardcoded -7)
//  - label e user_agent salvati per la UI "I tuoi dispositivi"

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { verifyRegistrationResponse } from "npm:@simplewebauthn/server@10.0.1";
import { extractCoseAlg } from "../_shared/cose-alg.ts";

interface Body {
  challenge?: string;
  rpId?: string;
  origin?: string;
  attestationObject?: string;
  clientDataJSON?: string;
  credentialId?: string;
  transports?: string[];
  label?: string;
  userAgent?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (
      !body?.challenge ||
      !body.rpId ||
      !body.origin ||
      !body.attestationObject ||
      !body.clientDataJSON ||
      !body.credentialId
    ) {
      return json({ error: "invalid_payload" }, 422);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    // Verifica registration → estrai public key + counter
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: {
          id: body.credentialId,
          rawId: body.credentialId,
          type: "public-key",
          clientExtensionResults: {},
          response: {
            attestationObject: body.attestationObject,
            clientDataJSON: body.clientDataJSON,
            transports: body.transports as AuthenticatorTransport[] | undefined,
          },
        },
        expectedChallenge: body.challenge,
        expectedOrigin: body.origin,
        expectedRPID: body.rpId,
        requireUserVerification: true,
      });
    } catch (e) {
      console.error("[passkey-register] verify error", (e as Error).message);
      return json({ error: "attestation_invalid" }, 422);
    }

    if (!verification.verified || !verification.registrationInfo) {
      return json({ error: "not_verified" }, 422);
    }

    // SimpleWebAuthn v10: campi flat su registrationInfo (credentialID/credentialPublicKey/counter).
    // Manteniamo fallback su .credential per compat con eventuali bump minor futuri.
    const info = verification.registrationInfo as unknown as {
      credentialID?: string | Uint8Array;
      credentialPublicKey?: Uint8Array;
      counter?: number;
      aaguid?: string;
      credential?: { id: string; publicKey: Uint8Array; counter: number };
    };
    const credId = info.credential?.id ?? (typeof info.credentialID === "string"
      ? info.credentialID
      : info.credentialID
        ? bytesToBase64Url(info.credentialID)
        : null);
    const credPublicKey = info.credential?.publicKey ?? info.credentialPublicKey;
    const credCounter = info.credential?.counter ?? info.counter ?? 0;
    if (!credId || !credPublicKey) {
      console.error("[passkey-register] missing credential fields", Object.keys(info));
      return json({ error: "registration_info_missing" }, 500);
    }

    // Estrazione algoritmo reale dalla COSE public key
    const coseAlg = extractCoseAlg(credPublicKey);
    const algorithm = coseAlg ?? -7; // fallback ES256 se parser fallisce


    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Upsert su credential_id: idempotente (stesso device che ri-registra)
    const credentialIdBytes = base64urlToBytes(credId);
    const labelTrim = (body.label ?? "").trim().slice(0, 80) || null;
    const uaTrim = (body.userAgent ?? "").trim().slice(0, 200) || null;

    const { error: upErr } = await admin
      .from("user_passkeys")
      .upsert(
        {
          user_id: userId,
          credential_id: credentialIdBytes,
          public_key: credPublicKey,
          public_key_alg: algorithm,
          sign_count: credCounter,
          aaguid: info.aaguid ?? null,
          transports: body.transports ?? null,
          label: labelTrim,
          user_agent: uaTrim,
          disabled_at: null,
        },
        { onConflict: "credential_id" },
      );

    if (upErr) {
      console.error("[passkey-register] upsert failed", upErr.message);
      return json({ error: "save_failed" }, 500);
    }

    // Compat legacy: scrivi anche in user_biometric_credentials se questo
    // utente ha già la riga PIN ma senza public_key (per non rompere il
    // fallback verify legacy). Best-effort, non-fatal.
    try {
      await admin
        .from("user_biometric_credentials")
        .update({
          credential_id: credentialIdBytes,
          public_key: credPublicKey,
          public_key_alg: algorithm,
          sign_count: credCounter,
          aaguid: info.aaguid ?? null,

          transports: body.transports ?? null,
        })
        .eq("user_id", userId)
        .is("public_key", null);
    } catch {
      /* best-effort */
    }

    return json({ ok: true, alg: algorithm });
  } catch (e) {
    console.error("[passkey-register] uncaught", e);
    return json({ error: "internal" }, 500);
  }
});

function base64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");


function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
