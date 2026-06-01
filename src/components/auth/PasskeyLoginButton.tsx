import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  hasBiometricVaultLocally,
  lastBiometricUser,
  unlockBiometric,
} from "@/lib/biometric/client";

/**
 * Pulsante "Accedi con passkey".
 *
 * Mostrato SOLO se questo browser ha già una cassaforte biometrica
 * registrata per l'ultimo utente: il click lancia direttamente
 * Face ID / Touch ID / Windows Hello e sblocca la sessione locale.
 *
 * Se non c'è ancora una passkey su questo dispositivo, l'utente deve
 * accedere con email+password (o usare il link "Accedi con PIN") e poi
 * attivare la biometria dal proprio profilo.
 */
export function PasskeyLoginButton() {
  const navigate = useNavigate();
  const [hasLocalVault, setHasLocalVault] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const last = lastBiometricUser();
      if (!last) return;
      const has = await hasBiometricVaultLocally(last.userId);
      if (!cancelled) setHasLocalVault(has);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Niente vault locale → niente pulsante (evitiamo fallback PIN nascosto).
  if (!hasLocalVault) return null;

  const handleClick = async () => {
    const last = lastBiometricUser();
    if (!last) return;
    setBusy(true);
    try {
      await unlockBiometric({ userId: last.userId, mode: "biometric" });
      toast.success("Accesso riuscito");
      navigate("/select-brand");
    } catch (e) {
      // Qualsiasi errore (annullamento, PRF non supportato, sblocco fallito)
      // → resta sulla schermata di login senza aprire il dialog PIN.
      const msg = e instanceof Error ? e.message : "Sblocco fallito";
      console.warn("[passkey] unlock failed:", msg);
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
