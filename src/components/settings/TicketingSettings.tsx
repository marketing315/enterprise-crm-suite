import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrandSettings, useUpdateBrandSettings } from "@/hooks/useBrandSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import { Bot, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SlaThresholdsCard } from "./SlaThresholdsCard";

export function TicketingSettings() {
  const { data: settings, isLoading } = useBrandSettings();
  const updateSettings = useUpdateBrandSettings();
  const { hasRole } = useAuth();
  const { currentBrand } = useBrand();

  const isAdmin = currentBrand ? hasRole("admin", currentBrand.id) : false;

  const handleAutoAssignToggle = async (enabled: boolean) => {
    try {
      await updateSettings.mutateAsync({ auto_assign_enabled: enabled });
      toast.success(
        enabled
          ? "Auto-assign abilitato: i nuovi ticket verranno assegnati automaticamente"
          : "Auto-assign disabilitato: i nuovi ticket resteranno non assegnati"
      );
    } catch (error) {
      toast.error("Errore durante l'aggiornamento delle impostazioni");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Auto-assign Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Assegnazione Automatica
          </CardTitle>
          <CardDescription>
            Configura come vengono assegnati i ticket di supporto
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-assign" className="text-base font-medium">
                Auto-assign Round Robin
              </Label>
              <p className="text-sm text-muted-foreground">
                {settings?.auto_assign_enabled
                  ? "I ticket vengono assegnati automaticamente agli operatori in rotazione"
                  : "I ticket restano non assegnati fino all'intervento manuale"}
              </p>
            </div>
            <Switch
              id="auto-assign"
              checked={settings?.auto_assign_enabled ?? true}
              onCheckedChange={handleAutoAssignToggle}
              disabled={!isAdmin || updateSettings.isPending}
            />
          </div>

          {!isAdmin && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Solo gli amministratori possono modificare questa impostazione.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* SLA Thresholds Card */}
      <SlaThresholdsCard />
    </div>
  );
}