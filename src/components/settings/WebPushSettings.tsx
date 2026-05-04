import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bell, BellOff, Smartphone, AlertCircle } from "lucide-react";
import { useWebPush } from "@/hooks/useWebPush";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const PUSH_TYPES: { type: string; label: string; description: string }[] = [
  { type: "slo_alert", label: "SLO / Burn Rate", description: "Alert SRE su soglie SLO" },
  { type: "ticket_escalated", label: "Ticket Escalation", description: "Ticket escalati per SLA" },
  { type: "ai_override_alert", label: "AI Override", description: "Override AI rilevati" },
  { type: "payment_overdue", label: "Pagamenti Scaduti", description: "Rate in ritardo" },
  { type: "appointment_risk", label: "Appuntamenti a Rischio", description: "Risk score elevato 24h" },
  { type: "ticket_created", label: "Nuovi Ticket", description: "Apertura nuovi ticket" },
  { type: "ticket_assigned", label: "Ticket Assegnati", description: "Ticket assegnati a te" },
  { type: "appointment_created", label: "Nuovi Appuntamenti", description: "Creazione appuntamenti" },
  { type: "lead_event_created", label: "Nuovi Lead", description: "Lead in ingresso" },
];

export function WebPushSettings() {
  const { isSupported, permission, isSubscribed, loading, subscribe, unsubscribe } =
    useWebPush();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: prefs } = useQuery({
    queryKey: ["user_push_preferences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_push_preferences")
        .select("notification_type, enabled");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const upsertPref = useMutation({
    mutationFn: async ({ type, enabled }: { type: string; enabled: boolean }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const authUid = userRes.user?.id;
      if (!authUid) throw new Error("not authenticated");
      const { data: internal } = await supabase.rpc("get_user_id", { p_auth_id: authUid });
      const internalId = internal as unknown as string;
      const { error } = await supabase
        .from("user_push_preferences")
        .upsert(
          { user_id: internalId, notification_type: type, enabled },
          { onConflict: "user_id,notification_type" },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user_push_preferences"] }),
    onError: () => toast.error("Errore salvataggio preferenza"),
  });

  const getEnabled = (type: string) => {
    const p = prefs?.find((x) => x.notification_type === type);
    return p?.enabled ?? true;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          Notifiche Push (Web/Mobile)
        </CardTitle>
        <CardDescription>
          Ricevi notifiche push sul browser o sul dispositivo anche con l'app chiusa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isSupported && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Il tuo browser non supporta le Web Push notifications.
            </AlertDescription>
          </Alert>
        )}

        {isSupported && permission === "denied" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Hai bloccato i permessi per le notifiche. Sbloccale dalle impostazioni del browser
              (icona lucchetto nella barra indirizzi) e ricarica la pagina.
            </AlertDescription>
          </Alert>
        )}

        {isSupported && permission !== "denied" && (
          <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              {isSubscribed ? (
                <Bell className="h-5 w-5 text-emerald-500" />
              ) : (
                <BellOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-sm">
                  {isSubscribed ? "Push attive su questo dispositivo" : "Attiva le notifiche push"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isSubscribed
                    ? "Riceverai notifiche anche con il browser chiuso (PWA installata)."
                    : "Ti chiederemo l'autorizzazione del browser."}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={isSubscribed ? "outline" : "default"}
              disabled={loading}
              onClick={async () => {
                if (isSubscribed) {
                  const ok = await unsubscribe();
                  if (ok) toast.success("Push disattivate");
                } else {
                  const ok = await subscribe();
                  if (ok) toast.success("Push attivate");
                  else if (permission === "denied")
                    toast.error("Permessi negati dal browser");
                }
              }}
            >
              {loading ? "..." : isSubscribed ? "Disattiva" : "Attiva"}
            </Button>
          </div>
        )}

        {isSubscribed && (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tipi di notifica
            </p>
            <div className="space-y-3">
              {PUSH_TYPES.map((item) => {
                const enabled = getEnabled(item.type);
                return (
                  <div
                    key={item.type}
                    className="flex items-center justify-between py-1.5 border-b last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <Switch
                      checked={enabled}
                      disabled={upsertPref.isPending}
                      onCheckedChange={(checked) =>
                        upsertPref.mutate({ type: item.type, enabled: checked })
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
