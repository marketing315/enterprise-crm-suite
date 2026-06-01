import { useEffect, useMemo, useState } from "react";
import { Fingerprint, Loader2, ShieldCheck, ShieldOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  detectSupport,
  enableBiometric,
  disableBiometric,
  changeBiometricPin,
  getEnrollmentStatus,
  type BiometricStatus,
} from "@/lib/biometric/client";
import { validatePin } from "@/lib/biometric/pin-policy";
import { BiometricPinPad } from "@/components/auth/BiometricPinPad";

type DialogMode = null | "enroll" | "change" | "confirmDisable";
type EnrollStep = "pin" | "confirm";

export function BiometricSettingsCard() {
  const [support, setSupport] = useState<{ webauthn: boolean; platformAuthenticator: boolean } | null>(null);
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [busy, setBusy] = useState(false);

  // Enroll state
  const [enrollStep, setEnrollStep] = useState<EnrollStep>("pin");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  // Change PIN state
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [changeStep, setChangeStep] = useState<"old" | "new">("old");

  const refresh = async () => {
    setLoading(true);
    try {
      const [sup, st] = await Promise.all([detectSupport(), getEnrollmentStatus()]);
      setSupport(sup);
      setStatus(st);
    } catch (e) {
      console.error("biometric refresh", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const closeDialog = () => {
    setDialog(null);
    setEnrollStep("pin");
    setPin("");
    setPinConfirm("");
    setPinError(null);
    setOldPin("");
    setNewPin("");
    setChangeStep("old");
  };

  const handleEnrollPinComplete = (entered: string) => {
    const v = validatePin(entered);
    if (!v.ok) {
      setPinError(v.reason ?? "PIN non valido");
      setPin("");
      return;
    }
    setPinError(null);
    setEnrollStep("confirm");
  };

  const handleEnrollConfirmComplete = async (entered: string) => {
    if (entered !== pin) {
      setPinError("I PIN non coincidono. Reinserisci.");
      setPinConfirm("");
      setEnrollStep("pin");
      setPin("");
      return;
    }
    setBusy(true);
    try {
      await enableBiometric({ pin });
      toast.success("Accesso biometrico attivato");
      closeDialog();
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Attivazione fallita";
      toast.error(msg);
      setBusy(false);
      // Reset
      setEnrollStep("pin");
      setPin("");
      setPinConfirm("");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      await disableBiometric();
      toast.success("Biometria disattivata");
      closeDialog();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disattivazione fallita");
    } finally {
      setBusy(false);
    }
  };

  const handleChangePin = async (entered: string) => {
    if (changeStep === "old") {
      setOldPin(entered);
      setChangeStep("new");
      return;
    }
    const v = validatePin(entered);
    if (!v.ok) {
      setPinError(v.reason ?? "PIN non valido");
      setNewPin("");
      return;
    }
    setBusy(true);
    try {
      await changeBiometricPin(oldPin, entered);
      toast.success("PIN aggiornato");
      closeDialog();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cambio PIN fallito");
      setOldPin("");
      setNewPin("");
      setChangeStep("old");
    } finally {
      setBusy(false);
    }
  };

  const inEmbeddedPreview = useMemo(() => {
    try {
      return typeof window !== "undefined" && window.top !== window.self;
    } catch {
      return true;
    }
  }, []);

  const stateBadge = useMemo(() => {
    if (loading) return null;
    if (inEmbeddedPreview) {
      return (
        <Alert variant="default">
          <AlertDescription>
            La biometria richiede di aprire il CRM nel suo dominio diretto
            (es. <span className="font-mono">crm.gruppobenessere.it</span>).
            Non funziona dentro l'anteprima embedded.
          </AlertDescription>
        </Alert>
      );
    }
    if (!support?.webauthn) {
      return (
        <Alert variant="default">
          <AlertDescription>
            Il browser non supporta WebAuthn. Usa un browser aggiornato per attivare il login biometrico.
          </AlertDescription>
        </Alert>
      );
    }
    if (!support.platformAuthenticator) {
      return (
        <Alert variant="default">
          <AlertDescription>
            Su questo dispositivo non è disponibile un autenticatore integrato (Face ID, Touch ID o impronta).
          </AlertDescription>
        </Alert>
      );
    }
    return null;
  }, [support, loading, inEmbeddedPreview]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Fingerprint className="h-4 w-4 text-primary" />
          Accesso rapido biometrico
        </CardTitle>
        <CardDescription>
          Sblocca il CRM con Face ID o impronta digitale invece di digitare email e password.
          Per i ruoli admin/CEO sostituisce anche la verifica MFA per 30 giorni.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stateBadge}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carico lo stato…
          </div>
        ) : status?.enrolled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="font-medium">Attivo su questo account</span>
              {status.last_used_at && (
                <span className="text-muted-foreground">
                  · ultimo uso {new Date(status.last_used_at).toLocaleString("it-IT")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDialog("change")}>
                <KeyRound className="mr-2 h-4 w-4" />
                Cambia PIN
              </Button>
              <Button variant="outline" onClick={() => setDialog("confirmDisable")}>
                <ShieldOff className="mr-2 h-4 w-4" />
                Disattiva
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Disattivando, rimuoviamo il vault locale e il PIN dal server. Dovrai accedere con email e password.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Non ancora attivo. Imposta un PIN a 6 cifre come riserva, poi conferma con Face ID/impronta.
            </p>
            <Button
              onClick={() => setDialog("enroll")}
              disabled={!support?.platformAuthenticator || inEmbeddedPreview}
            >
              <Fingerprint className="mr-2 h-4 w-4" />
              Attiva su questo dispositivo
            </Button>
          </div>
        )}
      </CardContent>

      {/* Enroll dialog */}
      <Dialog open={dialog === "enroll"} onOpenChange={(o) => (!o ? closeDialog() : null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {enrollStep === "pin" ? "Scegli un PIN" : "Conferma il PIN"}
            </DialogTitle>
            <DialogDescription>
              {enrollStep === "pin"
                ? "6 cifre. Niente sequenze (123456) o cifre ripetute."
                : "Inserisci di nuovo lo stesso PIN per confermarlo."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {enrollStep === "pin" ? (
              <BiometricPinPad
                value={pin}
                onChange={setPin}
                onComplete={handleEnrollPinComplete}
                disabled={busy}
                autoFocus
              />
            ) : (
              <BiometricPinPad
                value={pinConfirm}
                onChange={setPinConfirm}
                onComplete={handleEnrollConfirmComplete}
                disabled={busy}
                autoFocus
              />
            )}
            {pinError && (
              <p className="mt-3 text-center text-sm text-destructive">{pinError}</p>
            )}
            {busy && (
              <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Attivazione in corso…
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Change PIN dialog */}
      <Dialog open={dialog === "change"} onOpenChange={(o) => (!o ? closeDialog() : null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {changeStep === "old" ? "PIN attuale" : "Nuovo PIN"}
            </DialogTitle>
            <DialogDescription>
              {changeStep === "old"
                ? "Conferma il PIN che usi oggi."
                : "Imposta un nuovo PIN a 6 cifre."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <BiometricPinPad
              value={changeStep === "old" ? oldPin : newPin}
              onChange={changeStep === "old" ? setOldPin : setNewPin}
              onComplete={handleChangePin}
              disabled={busy}
              autoFocus
            />
            {pinError && (
              <p className="mt-3 text-center text-sm text-destructive">{pinError}</p>
            )}
            {busy && (
              <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Aggiorno…
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm disable */}
      <Dialog
        open={dialog === "confirmDisable"}
        onOpenChange={(o) => (!o ? closeDialog() : null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disattivare l'accesso biometrico?</DialogTitle>
            <DialogDescription>
              Rimuoveremo il PIN dal server e la cassaforte locale. Potrai sempre riattivarlo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={busy}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleDisable} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disattiva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
