import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Fingerprint, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  detectSupport,
  hasBiometricVaultLocally,
  lastBiometricUser,
  unlockBiometric,
} from "@/lib/biometric/client";
import { BiometricPinPad } from "./BiometricPinPad";

interface BiometricUnlockPanelProps {
  /** Callback opzionale per nascondere il pannello (es. dopo "Usa password"). */
  onFallbackToPassword?: () => void;
}

type Mode = "idle" | "biometric" | "pin";

/**
 * Pannello mostrato sopra al LoginForm quando il dispositivo ha una
 * cassaforte biometrica per un utente noto. Permette lo sblocco con
 * Face ID/impronta o con PIN di fallback.
 */
export function BiometricUnlockPanel({ onFallbackToPassword }: BiometricUnlockPanelProps) {
  const navigate = useNavigate();
  const [available, setAvailable] = useState<{
    userId: string;
    email: string;
  } | null>(null);
  const [supported, setSupported] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const last = lastBiometricUser();
      if (!last) return;
      const has = await hasBiometricVaultLocally(last.userId);
      if (!has) return;
      const sup = await detectSupport();
      if (cancelled) return;
      setAvailable(last);
      setSupported(sup.platformAuthenticator);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  const startBiometric = async () => {
    if (!available) return;
    setError(null);
    setBusy(true);
    try {
      await unlockBiometric({ userId: available.userId, mode: "biometric" });
      toast.success("Accesso riuscito");
      navigate("/select-brand");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sblocco fallito";
      if (msg === "PRF_UNSUPPORTED") {
        // Su browser senza PRF combiniamo biometria + PIN: chiediamo il PIN
        setMode("pin");
        setError(
          "Su questo browser serve confermare con il PIN dopo Face ID/impronta.",
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async (entered: string) => {
    if (!available) return;
    setError(null);
    setBusy(true);
    try {
      await unlockBiometric({ userId: available.userId, mode: "pin", pin: entered });
      toast.success("Accesso riuscito");
      navigate("/select-brand");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PIN errato");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-primary/30 bg-primary/5">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Fingerprint className="h-4 w-4 text-primary" />
          Sblocca {available.email}
        </CardTitle>
        <CardDescription>
          Accesso rapido attivo su questo dispositivo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {mode === "pin" ? (
          <div className="space-y-3">
            <BiometricPinPad
              value={pin}
              onChange={setPin}
              onComplete={submitPin}
              disabled={busy}
              autoFocus
            />
            {busy && (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Sblocco in corso…
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              onClick={startBiometric}
              disabled={busy || !supported}
              className="h-11 w-full"
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Fingerprint className="mr-2 h-4 w-4" />
              )}
              Sblocca con Face ID / impronta
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setMode("pin");
                setError(null);
              }}
              disabled={busy}
              className="h-11 w-full"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Usa PIN
            </Button>
          </div>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              onFallbackToPassword?.();
            }}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Accedi con un altro account (email + password)
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
