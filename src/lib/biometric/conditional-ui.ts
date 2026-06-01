import { supabase } from "@/integrations/supabase/client";
import { b64urlEncode } from "@/lib/biometric/webauthn";

/**
 * §5.4 — Conditional UI / autofill passkey.
 *
 * Quando supportato, lancia in background un `navigator.credentials.get`
 * con `mediation: "conditional"`: il browser mostra le passkey disponibili
 * nel popup di autofill dell'input email (autocomplete="username webauthn")
 * senza ulteriore interazione dell'utente.
 *
 * Restituisce una promise risolta con `{ ok, reason }`:
 *  - ok=true → l'utente ha scelto una passkey ed è loggato (chiamante deve navigare)
 *  - ok=false con reason="unsupported"/"cancelled"/"error" → no-op silenzioso
 *
 * Da chiamare una sola volta sulla Login page. AbortController per smontaggio.
 */
export async function tryConditionalPasskeyLogin(
  signal: AbortSignal,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (
      typeof window === "undefined" ||
      typeof window.PublicKeyCredential === "undefined" ||
      // @ts-expect-error - feature detection
      typeof PublicKeyCredential.isConditionalMediationAvailable !== "function"
    ) {
      return { ok: false, reason: "unsupported" };
    }
    // @ts-expect-error - feature detection
    const cma: boolean = await PublicKeyCredential.isConditionalMediationAvailable();
    if (!cma) return { ok: false, reason: "unsupported" };

    const rpId = window.location.hostname;
    const { data: beginData, error: beginErr } = await supabase.functions.invoke(
      "passkey-auth-begin",
      { body: { rpId } },
    );
    if (beginErr || !beginData?.challenge) return { ok: false, reason: "begin_failed" };
    if (signal.aborted) return { ok: false, reason: "cancelled" };

    const challengeB64: string = beginData.challenge;
    const challengeBytes = decodeB64Url(challengeB64);

    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: challengeBytes,
        rpId,
        timeout: 60_000,
        userVerification: "preferred",
      },
      mediation: "conditional",
      signal,
    } as CredentialRequestOptions)) as PublicKeyCredential | null;

    if (!cred || signal.aborted) return { ok: false, reason: "cancelled" };

    const response = cred.response as AuthenticatorAssertionResponse;
    const { data: verifyData, error: verifyErr } = await supabase.functions.invoke(
      "passkey-auth-verify",
      {
        body: {
          challenge: challengeB64,
          rpId,
          origin: window.location.origin,
          credentialId: b64urlEncode(new Uint8Array(cred.rawId)),
          authenticatorData: b64urlEncode(response.authenticatorData),
          clientDataJSON: b64urlEncode(response.clientDataJSON),
          signature: b64urlEncode(response.signature),
          userHandle: response.userHandle ? b64urlEncode(response.userHandle) : null,
        },
      },
    );
    if (verifyErr || !verifyData?.access_token || !verifyData?.refresh_token) {
      return { ok: false, reason: "verify_failed" };
    }

    const { error: setErr } = await supabase.auth.setSession({
      access_token: verifyData.access_token,
      refresh_token: verifyData.refresh_token,
    });
    if (setErr) return { ok: false, reason: "set_session_failed" };

    return { ok: true };
  } catch (e) {
    // AbortError quando la pagina viene smontata → silenzioso
    return { ok: false, reason: e instanceof Error ? e.name : "error" };
  }
}

function decodeB64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
