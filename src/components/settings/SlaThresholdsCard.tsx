import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBrandSettings, useUpdateBrandSettings, SlaThresholds, DEFAULT_SLA_THRESHOLDS } from "@/hooks/useBrandSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import { Clock, AlertCircle, Save, RotateCcw } from "lucide-react";

const PRIORITY_LABELS: Record<string, { label: string; description: string }> = {
  "1": { label: "P1 - Critica", description: "Problemi bloccanti" },
  "2": { label: "P2 - Alta", description: "Impatto significativo" },
  "3": { label: "P3 - Media", description: "Impatto moderato" },
  "4": { label: "P4 - Bassa", description: "Impatto limitato" },
  "5": { label: "P5 - Minima", description: "Richieste non urgenti" },
};

function minutesToHumanReadable(minutes: number): string {
  if (minutes < 60) return `${minutes} minuti`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return hours === 1 ? "1 ora" : `${hours} ore`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

export function SlaThresholdsCard() {
  const { data: settings, isLoading } = useBrandSettings();
  const updateSettings = useUpdateBrandSettings();
  const { hasRole } = useAuth();
  const { currentBrand } = useBrand();
  
  const isAdmin = currentBrand ? hasRole("admin", currentBrand.id) : false;

  const [localThresholds, setLocalThresholds] = useState<SlaThresholds>(DEFAULT_SLA_THRESHOLDS);
  const [isDirty, setIsDirty] = useState(false);

  // Sync local state with server data
  useEffect(() => {
    if (settings?.sla_thresholds_minutes) {
      setLocalThresholds(settings.sla_thresholds_minutes);
      setIsDirty(false);
    }
  }, [settings?.sla_thresholds_minutes]);

  const handleChange = (priority: keyof SlaThresholds, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 1) return;
    
    setLocalThresholds((prev) => ({
      ...prev,
      [priority]: numValue,
    }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({ sla_thresholds_minutes: localThresholds });
      toast.success("Soglie SLA aggiornate con successo");
      setIsDirty(false);
    } catch (error) {
      toast.error("Errore durante il salvataggio delle soglie SLA");
    }
  };

  const handleReset = () => {
    setLocalThresholds(DEFAULT_SLA_THRESHOLDS);
    setIsDirty(true);
  };

  if (isLoading) {
    return (
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
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Soglie SLA per Priorità
        </CardTitle>
        <CardDescription>
          Definisci il tempo massimo (in minuti) entro cui i ticket devono essere gestiti
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4">
          {(["1", "2", "3", "4", "5"] as const).map((priority) => (
            <div key={priority} className="flex items-center gap-4">
              <div className="flex-1">
                <Label htmlFor={`sla-${priority}`} className="font-medium">
                  {PRIORITY_LABELS[priority].label}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {PRIORITY_LABELS[priority].description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id={`sla-${priority}`}
                  type="number"
                  min="1"
                  value={localThresholds[priority]}
                  onChange={(e) => handleChange(priority, e.target.value)}
                  disabled={!isAdmin || updateSettings.isPending}
                  className="w-24 text-right"
                />
                <span className="text-sm text-muted-foreground w-20">
                  {minutesToHumanReadable(localThresholds[priority])}
                </span>
              </div>
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={!isDirty || updateSettings.isPending}
              size="sm"
            >
              <Save className="h-4 w-4 mr-2" />
              Salva modifiche
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              disabled={updateSettings.isPending}
              size="sm"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Ripristina default
            </Button>
          </div>
        )}

        {!isAdmin && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Solo gli amministratori possono modificare le soglie SLA.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
