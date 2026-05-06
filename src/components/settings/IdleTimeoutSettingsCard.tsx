import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getIdleTimeoutEnabled, setIdleTimeoutEnabled } from "@/lib/idle-timeout-pref";
import { toast } from "@/hooks/use-toast";

export function IdleTimeoutSettingsCard() {
  const { isAdmin, isCeo } = useAuth();
  const forced = isAdmin || isCeo;
  const [enabled, setEnabled] = useState<boolean>(true);

  useEffect(() => {
    setEnabled(forced ? true : getIdleTimeoutEnabled());
  }, [forced]);

  const handleToggle = (next: boolean) => {
    if (forced) return;
    setEnabled(next);
    setIdleTimeoutEnabled(next);
    toast({
      title: next ? "Logout automatico attivato" : "Logout automatico disattivato",
      description: next
        ? "La sessione verrà chiusa dopo 30 minuti di inattività."
        : "Resterai connesso anche dopo periodi di inattività su questo dispositivo.",
    });
  };

  const minutes = forced ? 15 : 30;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Logout automatico per inattività
        </CardTitle>
        <CardDescription>
          Per sicurezza la sessione viene chiusa dopo{" "}
          <strong>{minutes} minuti</strong> senza attività (mouse, tastiera, tocco).
          Un avviso compare 60 secondi prima del logout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="idle-timeout-toggle" className="text-base">
              Attivo su questo dispositivo
            </Label>
            <p className="text-sm text-muted-foreground">
              La preferenza è salvata localmente: vale solo per questo browser.
            </p>
          </div>
          <Switch
            id="idle-timeout-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={forced}
          />
        </div>

        {forced && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              Per i ruoli <strong>Admin</strong> e <strong>CEO</strong> il logout automatico è
              obbligatorio per requisiti di compliance e non può essere disattivato.
            </AlertDescription>
          </Alert>
        )}

        {!forced && !enabled && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              <strong>Attenzione:</strong> con il logout automatico disattivato la sessione
              resterà aperta finché non chiudi manualmente il browser. Disattivalo solo su
              dispositivi personali e di tua proprietà.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
