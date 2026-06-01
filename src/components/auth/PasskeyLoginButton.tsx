import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { b64urlEncode, isWebAuthnAvailable } from "@/lib/biometric/webauthn";

/**
 * Login passkey discoverable (vero "Sign in with passkey").
 *
 * 1. Chiede al server una challenge (passkey-auth-begin)
 * 2. Apre il prompt nativo del browser: l'utente sceglie quale passkey usare
 *    (Face ID, Touch ID, Windows Hello, YubiKey, passkey iCloud/Google sync...)
 * 3. Manda l'asserzione a passkey-auth-verify, che identifica l'utente
 *    tramite credential_id e restituisce una sessione Supabase.
 *
 * Se l'utente annulla o non ha passkey valide → resta sulla schermata di login
 * senza dialog PIN né messaggi d'errore aggressivi.
 */
export function PasskeyLoginButton() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (!isWebAuthnAvailable()) {
      toast.error("Questo browser non supporta le passkey. Usa email e password.");
      return;
    }
    setBusy(true);
    try {
      // 1) challenge
      const rpId = window.location.hostname;
      const { data: beginData, error: beginErr } = await supabase.functions.invoke(
        "passkey-auth-begin",
        { body: { rpId } },
      );
      if (beginErr || !beginData?.challenge) {
        throw new Error("Impossibile ottenere la challenge.");
      }
      const challengeB64: string = beginData.challenge;
      const challengeBytes = decodeB64Url(challengeB64);

      // 2) prompt nativo passkey (discoverable: niente allowCredentials)
      const cred = (await navigator.credentials.get({
        publicKey: {
          challenge: challengeBytes,
          rpId,
          timeout: 60_000,
          userVerification: "required",
        },
        mediation: "optional",
      } as CredentialRequestOptions)) as PublicKeyCredential | null;

      if (!cred) {
        setBusy(false);
        return;
      }

      const response = cred.response as AuthenticatorAssertionResponse;

      // 3) verify lato server
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
            userHandle: response.userHandle
              ? b64urlEncode(response.userHandle)
              : null,
          },
        },
      );
      if (verifyErr || !verifyData?.access_token || !verifyData?.refresh_token) {
        const errCode =
          (verifyErr as { context?: { error?: string } } | null)?.context?.error ??
          (verifyData as { error?: string } | null)?.error ??
          "verify_failed";
        if (errCode === "credential_needs_reregistration") {
          toast.error(
            "Questa passkey è stata creata prima dell'aggiornamento. Accedi con email/password e riattiva la biometria dal profilo.",
          );
        }
        throw new Error(errCode);
      }

      // 4) sessione → setSession
      const { error: setErr } = await supabase.auth.setSession({
        access_token: verifyData.access_token,
        refresh_token: verifyData.refresh_token,
      });
      if (setErr) throw setErr;

      toast.success("Accesso con passkey riuscito");
      navigate("/select-brand");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[passkey] login failed:", msg);
      // Niente toast aggressivo per cancel/timeout dell'utente
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full md:h-10"
      disabled={busy}
      onClick={handleClick}
    >
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Fingerprint className="mr-2 h-4 w-4" />
      )}
      Accedi con passkey
    </Button>
  );
}

function decodeB64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
