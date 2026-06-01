import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  detectSupport,
  hasBiometricVaultLocally,
  lastBiometricUser,
  unlockBiometric,
} from "@/lib/biometric/client";
import { PinLoginDialog } from "./PinLoginDialog";

/**
 * Pulsante "Accedi con passkey".
 *
 * - Se questo dispositivo ha una cassaforte biometrica per l'ultimo utente,
 *   lancia Face ID / Touch ID / Windows Hello e sblocca la sessione locale.
 * - Altrimenti propone all'utente di accedere via Email + PIN universale
 *   (passkey sincronizzate da altri dispositivi → fallback PIN).
 */
export function PasskeyLoginButton() {
  const navigate = useNavigate();
  const [hasLocalVault, setHasLocalVault] = useState(false);
  const [platformOk, setPlatformOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sup = await detectSupport();
      if (cancelled) return;
      setPlatformOk(sup.platformAuthenticator);
      const last = lastBiometricUser();
      if (!last) return;
      const has = await hasBiometricVaultLocally(last.userId);
      if (!cancelled) setHasLocalVault(has);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Nessun supporto WebAuthn e nessun vault → non mostriamo nulla.
  if (!platformOk && !hasLocalVault) return null;

  const handleClick = async () => {
    const last = lastBiometricUser();
    if (!last || !hasLocalVault) {
      // Nessuna passkey/vault registrata su questo browser → fallback PIN universale
      setPinOpen(true);
      return;
    }
    setBusy(true);
    try {
      await unlockBiometric({ userId: last.userId, mode: "biometric" });
      toast.success("Accesso riuscito");
      navigate("/select-brand");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sblocco fallito";
      if (msg === "PRF_UNSUPPORTED") {
        // Su browser senza PRF servono biometria + PIN: apri il dialog PIN universale
        setPinOpen(true);
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
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
      <PinLoginDialog
        triggerLabel=""
        controlledOpen={pinOpen}
        onControlledOpenChange={setPinOpen}
      />
    </>
  );
}
