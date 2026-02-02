import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bell, Ticket, Users, Calendar, GitBranch, Tags, MessageSquare, Globe } from "lucide-react";
import { useBrand, SYSTEM_BRAND_ID } from "@/contexts/BrandContext";
import {
  useNotificationPreferences,
  useUpsertNotificationPreference,
} from "@/hooks/useNotifications";
import { toast } from "sonner";

const notificationTypes = [
  {
    type: "lead_event_created",
    label: "Nuovi Lead",
    description: "Ricevi una notifica quando viene creato un nuovo lead",
    icon: Users,
  },
  {
    type: "ticket_created",
    label: "Nuovi Ticket",
    description: "Ricevi una notifica quando viene creato un nuovo ticket",
    icon: Ticket,
  },
  {
    type: "ticket_assigned",
    label: "Ticket Assegnati",
    description: "Ricevi una notifica quando un ticket ti viene assegnato",
    icon: Ticket,
  },
  {
    type: "ticket_status_changed",
    label: "Cambio Stato Ticket",
    description: "Ricevi una notifica quando lo stato di un ticket cambia",
    icon: Ticket,
  },
  {
    type: "pipeline_stage_changed",
    label: "Cambio Stage Pipeline",
    description: "Ricevi una notifica quando un deal cambia stage",
    icon: GitBranch,
  },
  {
    type: "appointment_created",
    label: "Nuovi Appuntamenti",
    description: "Ricevi una notifica quando viene creato un appuntamento",
    icon: Calendar,
  },
  {
    type: "appointment_updated",
    label: "Appuntamenti Modificati",
    description: "Ricevi una notifica quando un appuntamento viene modificato",
    icon: Calendar,
  },
  {
    type: "tags_updated",
    label: "Tag Aggiornati",
    description: "Ricevi una notifica quando i tag di un'entità cambiano",
    icon: Tags,
  },
  {
    type: "chat_message",
    label: "Messaggi Chat",
    description: "Ricevi una notifica per nuovi messaggi in chat",
    icon: MessageSquare,
  },
];

export function NotificationPreferencesSettings() {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const isSystemBrand = brandId === SYSTEM_BRAND_ID;

  // Skip fetching preferences for system brand
  const { data: preferences, isLoading } = useNotificationPreferences(
    isSystemBrand ? "" : (brandId || "")
  );
  const upsertPreference = useUpsertNotificationPreference();

  const getPreferenceEnabled = (type: string): boolean => {
    const pref = preferences?.find((p) => p.notification_type === type);
    // Default to enabled if no preference exists
    return pref?.enabled ?? true;
  };

  const handleToggle = (type: string, enabled: boolean) => {
    if (!brandId || isSystemBrand) return;

    upsertPreference.mutate(
      { brandId, notificationType: type, enabled },
      {
        onError: () => {
          toast.error("Errore nel salvare la preferenza");
        },
      }
    );
  };

  if (!brandId) {
    return null;
  }

  // Show message for system brand
  if (isSystemBrand) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Preferenze Notifiche
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <Globe className="h-4 w-4" />
            <AlertDescription>
              Le preferenze di notifica vanno configurate per ciascun brand singolarmente.
              Seleziona un brand specifico dalla sidebar per gestire le notifiche.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Preferenze Notifiche
        </CardTitle>
        <CardDescription>
          Configura quali notifiche vuoi ricevere per questo brand
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-11" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {notificationTypes.map((item) => {
              const Icon = item.icon;
              const isEnabled = getPreferenceEnabled(item.type);

              return (
                <div
                  key={item.type}
                  className="flex items-center justify-between py-2 border-b last:border-b-0"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted mt-0.5">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <Label htmlFor={item.type} className="text-sm font-medium cursor-pointer">
                        {item.label}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id={item.type}
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggle(item.type, checked)}
                    disabled={upsertPreference.isPending}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
