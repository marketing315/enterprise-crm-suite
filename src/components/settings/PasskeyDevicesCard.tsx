import { useEffect, useState } from "react";
import { Fingerprint, Loader2, Trash2, Plus, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addPasskeyOnThisDevice,
  listMyPasskeys,
  renameMyPasskey,
  revokeMyPasskey,
  type PasskeyDevice,
} from "@/lib/biometric/passkey-devices";
import { detectSupport } from "@/lib/biometric/client";

/**
 * Gestione passkey multi-dispositivo: una riga per dispositivo registrato.
 * Separato dal BiometricSettingsCard (che gestisce PIN+vault locale).
 */
export function PasskeyDevicesCard() {
  const [devices, setDevices] = useState<PasskeyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<PasskeyDevice | null>(null);
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const [supported, setSupported] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listMyPasskeys();
      setDevices(list);
    } catch (e) {
      console.error("[passkeys] list failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    void detectSupport().then((s) => setSupported(s.webauthn));
  }, []);

  const handleAdd = async () => {
    setAdding(true);
    try {
      await addPasskeyOnThisDevice();
      toast.success("Passkey aggiunta su questo dispositivo");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aggiunta fallita");
    } finally {
      setAdding(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirmRevoke) return;
    try {
      await revokeMyPasskey(confirmRevoke.id);
      toast.success("Passkey revocata");
      setConfirmRevoke(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoca fallita");
    }
  };

  const handleRename = async () => {
    if (!editing) return;
    const label = editing.label.trim();
    if (!label) {
      toast.error("Inserisci un nome");
      return;
    }
    try {
      await renameMyPasskey(editing.id, label);
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rinomina fallita");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Fingerprint className="h-4 w-4 text-primary" />
          Le tue passkey
        </CardTitle>
        <CardDescription>
          Registra una passkey su ogni dispositivo che usi (Mac, iPhone, Android, Windows).
          Da quel dispositivo potrai accedere con un tocco, senza email e password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carico…
          </div>
        ) : devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna passkey registrata. Aggiungine una su questo dispositivo per
            iniziare ad accedere con Face ID / impronta / passkey sincronizzata.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  {editing?.id === d.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editing.label}
                        onChange={(e) =>
                          setEditing({ id: d.id, label: e.target.value })
                        }
                        autoFocus
                        maxLength={80}
                        className="h-8"
                      />
                      <Button size="icon" variant="ghost" onClick={handleRename}>
                        <Check className="h-4 w-4 text-emerald-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium">
                        {d.label || "Passkey senza nome"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Registrata il{" "}
                        {new Date(d.created_at).toLocaleDateString("it-IT")}
                        {d.last_used_at && (
                          <>
                            {" · ultimo uso "}
                            {new Date(d.last_used_at).toLocaleString("it-IT")}
                          </>
                        )}
                      </p>
                    </>
                  )}
                </div>
                {editing?.id !== d.id && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setEditing({ id: d.id, label: d.label ?? "" })
                      }
                      aria-label="Rinomina"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setConfirmRevoke(d)}
                      aria-label="Revoca"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <Button onClick={handleAdd} disabled={adding || !supported}>
          {adding ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Aggiungi passkey su questo dispositivo
        </Button>
        {!supported && (
          <p className="text-xs text-muted-foreground">
            Il browser non supporta WebAuthn.
          </p>
        )}
      </CardContent>

      <Dialog
        open={!!confirmRevoke}
        onOpenChange={(o) => (!o ? setConfirmRevoke(null) : null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revocare questa passkey?</DialogTitle>
            <DialogDescription>
              Non potrai più accedere con &laquo;{confirmRevoke?.label || "Passkey"}&raquo;.
              Le altre passkey sui tuoi dispositivi continuano a funzionare.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevoke(null)}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleRevoke}>
              Revoca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
