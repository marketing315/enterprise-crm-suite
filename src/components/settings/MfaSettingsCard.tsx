import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMfaStatus } from "@/hooks/useMfaStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * A5 — MFA card in /settings.
 * - Shows current enrollment + AAL status
 * - Lets the user enroll, disenroll a verified factor (only at AAL2)
 */
export function MfaSettingsCard() {
  const { loading, enrolled, currentLevel, factors, refresh } = useMfaStatus();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleEnroll = () => {
    navigate("/security/mfa-enroll?next=/settings");
  };

  const handleUnenroll = async (factorId: string) => {
    if (currentLevel !== "aal2") {
      toast.error(
        "Per rimuovere MFA devi prima completare la verifica TOTP nella sessione corrente.",
      );
      navigate(`/security/mfa-challenge?next=/settings`);
      return;
    }
    if (!confirm("Rimuovere il fattore MFA? Sarà richiesto di re-enrollare al prossimo accesso se richiesto dal ruolo.")) {
      return;
    }
    setBusyId(factorId);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        toast.error(error.message || "Errore rimozione MFA");
        return;
      }
      // A10: audit MFA unenroll
      void import("@/lib/session-audit").then(({ logSessionEvent }) =>
        logSessionEvent("mfa_unenroll"),
      );
      toast.success("Fattore MFA rimosso");
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Autenticazione a due fattori (MFA)
        </CardTitle>
        <CardDescription>
          TOTP (Google Authenticator, 1Password, Authy…). Obbligatorio per ruoli
          admin e CEO.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento stato MFA…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Stato sessione:</span>
              <Badge variant={currentLevel === "aal2" ? "default" : "secondary"}>
                {currentLevel ?? "—"}
              </Badge>
            </div>

            {!enrolled ? (
              <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
                <div className="flex items-center gap-2 text-sm">
                  <ShieldOff className="h-4 w-4 text-muted-foreground" />
                  Nessun fattore TOTP attivo.
                </div>
                <Button onClick={handleEnroll} className="w-fit">
                  Attiva MFA
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {factors.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {f.friendly_name || "TOTP"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Attivato il{" "}
                        {new Date(f.created_at).toLocaleDateString("it-IT")}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === f.id}
                      onClick={() => handleUnenroll(f.id)}
                    >
                      {busyId === f.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Rimuovi"
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
