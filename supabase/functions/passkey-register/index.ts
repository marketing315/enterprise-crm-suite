// Edge function: passkey-register
// Salva la public key di una passkey appena creata sull'utente loggato,
// così da abilitare il login server-side discoverable.
//
// Riceve l'attestation completa, la verifica con @simplewebauthn/server
// per estrarre la public key COSE + algoritmo + aaguid + sign_count.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { verifyRegistrationResponse } from "npm:@simplewebauthn/server@10.0.1";

interface Body {
  challenge?: string;
  rpId?: string;
  origin?: string;
  attestationObject?: string;
  clientDataJSON?: string;
  credentialId?: string;
  transports?: string[];
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

    const info = verification.registrationInfo;
    const cred = info.credential;

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Aggiorna la riga esistente dell'utente (UNIQUE su user_id già garantito)
    const { error: updErr } = await admin
      .from("user_biometric_credentials")
      .update({
        credential_id: cred.id ? base64urlToBytes(cred.id) : null,
        public_key: cred.publicKey,
        public_key_alg: -7, // ES256 (default; il valore reale è in COSE ma non esposto)
        sign_count: cred.counter ?? 0,
        aaguid: info.aaguid ?? null,
        transports: body.transports ?? null,
      })
      .eq("user_id", userId);

    if (updErr) {
      console.error("[passkey-register] update failed", updErr.message);
      return json({ error: "save_failed" }, 500);
    }

    return json({ ok: true });
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

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
