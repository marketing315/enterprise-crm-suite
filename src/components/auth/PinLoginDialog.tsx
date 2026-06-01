/**
 * PinLoginDialog — accesso universale Email + PIN da qualunque device.
 *
 * Flusso:
 *   1) utente inserisce email → startPinLogin → challengeId
 *   2) utente inserisce PIN 6 cifre → verifyPinLogin → sessionToken (60s)
 *   3) redeemPinLoginSession → setSession Supabase → onSuccess()
 *
 * Lockout/wipe gestiti server-side (5/15min, 10 → wipe). Non rivela
 * se l'email esiste.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, Loader2, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BiometricPinPad } from "./BiometricPinPad";
import {
  startPinLogin,
  verifyPinLogin,
  redeemPinLoginSession,
} from "@/lib/biometric/client";

interface Props {
  triggerLabel?: string;
  /** Se passato, il dialog è controllato dall'esterno e il trigger non viene mostrato quando triggerLabel è vuoto. */
  controlledOpen?: boolean;
  onControlledOpenChange?: (open: boolean) => void;
}

type Step = "email" | "pin";

export function PinLoginDialog({
  triggerLabel = "Accedi con PIN",
  controlledOpen,
  onControlledOpenChange,
}: Props) {
  const navigate = useNavigate();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen! : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) onControlledOpenChange?.(v);
    else setInternalOpen(v);
  };
  const showTrigger = !isControlled && triggerLabel.length > 0;
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("email");
    setEmail("");
    setPin("");
    setChallengeId(null);
    setError(null);
    setBusy(false);
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await startPinLogin(email);
      if (!r.ok || !r.challengeId) {
        setError("Email non valida.");
        return;
      }
      setChallengeId(r.challengeId);
      setStep("pin");
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setBusy(false);
    }
  };

  const handlePinComplete = async (entered: string) => {
    if (!challengeId) return;
    setError(null);
    setBusy(true);
    try {
      const v = await verifyPinLogin(challengeId, entered);
      if (!v.ok || !v.sessionToken) {
        if (v.reason === "locked") {
          setError("PIN bloccato per 15 minuti.");
        } else if (v.reason === "wiped") {
          setError(
            "Troppi tentativi: la biometria è stata disattivata per questo account.",
          );
        } else if (v.reason === "expired" || v.reason === "already_consumed") {
          setError("Sessione scaduta. Ricomincia.");
          setStep("email");
          setChallengeId(null);
        } else if (typeof v.remainingAttempts === "number") {
          setError(`PIN errato. Tentativi rimasti: ${v.remainingAttempts}.`);
          setPin("");
        } else {
          setError("PIN errato.");
          setPin("");
        }
        return;
      }
      await redeemPinLoginSession(v.sessionToken);
      toast.success("Accesso riuscito");
      setOpen(false);
      reset();
      navigate("/select-brand");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accesso non riuscito.");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs">
          <KeyRound className="mr-1.5 h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Accesso con PIN
          </DialogTitle>
          <DialogDescription>
            Inserisci la tua email e il PIN di 6 cifre che hai impostato
            sull'account. Funziona da qualunque dispositivo.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === "email" ? (
          <form onSubmit={handleStart} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin-login-email">Email</Label>
              <Input
                id="pin-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@gruppobenessere.it"
                autoComplete="email"
                required
                disabled={busy}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !email}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continua
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="text-center text-sm text-muted-foreground">
              {email}
            </div>
            <BiometricPinPad
              value={pin}
              onChange={setPin}
              onComplete={handlePinComplete}
              disabled={busy}
              autoFocus
            />
            {busy && (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifica in corso…
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setStep("email");
                setPin("");
                setError(null);
                setChallengeId(null);
              }}
              disabled={busy}
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Cambia email
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
