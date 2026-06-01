import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  isWebAuthnAvailable,
  b64urlEncode,
} from "@/lib/biometric/webauthn";

/**
 * Pulsante "Accedi con passkey": lancia WebAuthn discoverable
 * (allowCredentials vuoto) per usare una passkey sincronizzata
 * iCloud/Google o quella registrata sul dispositivo. Dopo l'asserzione
 * chiede al backend di emettere una sessione Supabase via edge function.
 */
export function PasskeyLoginButton() {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setSupported(isWebAuthnAvailable());
  }, []);

  if (!supported) return null;

  const handleClick = async () => {
    setBusy(true);
    try {
      const challengeBytes = new Uint8Array(32);
      crypto.getRandomValues(challengeBytes);

      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: challengeBytes as unknown as ArrayBuffer,
        timeout: 60_000,
        rpId: window.location.hostname,
        userVerification: "required",
        // allowCredentials vuoto → discoverable, mostra il picker passkey
        allowCredentials: [],
      };

      const cred = (await navigator.credentials.get({
        publicKey,
      })) as PublicKeyCredential | null;

      if (!cred) {
        toast.error("Verifica annullata");
        return;
      }

      const response = cred.response as AuthenticatorAssertionResponse;
      const userHandle = response.userHandle
        ? new Uint8Array(response.userHandle)
        : null;

      const payload = {
        credential_id: b64urlEncode(new Uint8Array(cred.rawId)),
        user_handle: userHandle ? b64urlEncode(userHandle) : null,
        client_data_json: b64urlEncode(new Uint8Array(response.clientDataJSON)),
        authenticator_data: b64urlEncode(new Uint8Array(response.authenticatorData)),
        signature: b64urlEncode(new Uint8Array(response.signature)),
      };

      const { data, error } = await supabase.functions.invoke("passkey-login", {
        body: payload,
      });
      if (error) throw error;
      const r = data as { access_token?: string; refresh_token?: string; error?: string };
      if (r?.error || !r?.access_token || !r?.refresh_token) {
        throw new Error(r?.error || "Passkey non riconosciuta");
      }
      const { error: setErr } = await supabase.auth.setSession({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
      });
      if (setErr) throw setErr;
      toast.success("Accesso riuscito");
      navigate("/select-brand");
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError") {
        toast.error("Operazione annullata o nessuna passkey trovata su questo dispositivo");
      } else {
        toast.error(e instanceof Error ? e.message : "Accesso con passkey non riuscito");
      }
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
