import { format } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, Download, Trash2, Moon, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuditAnomalies } from "@/hooks/useAuditDashboard";

export function AuditAnomaliesPanel() {
  const { data, isLoading } = useAuditAnomalies(24);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const anomalies = data ?? {
    lookback_hours: 24,
    generated_at: new Date().toISOString(),
    mass_export: [],
    mass_delete: [],
    off_hours: [],
  };

  const totalAlerts =
    anomalies.mass_export.length + anomalies.mass_delete.length + anomalies.off_hours.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Alert anomalie
          </h2>
          <p className="text-sm text-muted-foreground">
            Ultime 24 ore — generato il{" "}
            {format(new Date(anomalies.generated_at), "dd MMM yyyy HH:mm", { locale: it })}
          </p>
        </div>
        <Badge variant={totalAlerts > 0 ? "destructive" : "outline"}>
          {totalAlerts} alert
        </Badge>
      </div>

      {totalAlerts === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Nessuna anomalia rilevata</AlertTitle>
          <AlertDescription>
            Nessun mass-export, mass-delete o accesso fuori orario nelle ultime 24 ore.
          </AlertDescription>
        </Alert>
      )}

      {/* Mass export */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-amber-600" />
            Mass export
            <Badge variant="outline" className="ml-2">{anomalies.mass_export.length}</Badge>
          </CardTitle>
          <CardDescription>Export di oltre 500 record</CardDescription>
        </CardHeader>
        <CardContent>
          {anomalies.mass_export.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun mass export rilevato</p>
          ) : (
            <div className="space-y-2">
              {anomalies.mass_export.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.accessed_by_display_name || "Sconosciuto"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(m.accessed_at), "dd MMM HH:mm", { locale: it })} · {m.access_type}
                    </p>
                  </div>
                  <Badge variant="destructive">{m.result_count.toLocaleString("it-IT")} record</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mass delete */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-600" />
            Mass delete
            <Badge variant="outline" className="ml-2">{anomalies.mass_delete.length}</Badge>
          </CardTitle>
          <CardDescription>Più di 20 eliminazioni in 1 ora dallo stesso utente</CardDescription>
        </CardHeader>
        <CardContent>
          {anomalies.mass_delete.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna eliminazione massiva</p>
          ) : (
            <div className="space-y-2">
              {anomalies.mass_delete.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.actor_display_name || "Sconosciuto"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(m.window_start), "dd MMM HH:mm", { locale: it })}
                    </p>
                  </div>
                  <Badge variant="destructive">{m.delete_count} delete</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Off-hours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Moon className="h-4 w-4 text-indigo-600" />
            Accessi fuori orario
            <Badge variant="outline" className="ml-2">{anomalies.off_hours.length}</Badge>
          </CardTitle>
          <CardDescription>Almeno 5 azioni tra le 00:00 e le 06:00</CardDescription>
        </CardHeader>
        <CardContent>
          {anomalies.off_hours.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun accesso fuori orario</p>
          ) : (
            <div className="space-y-2">
              {anomalies.off_hours.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.actor_display_name || "Sconosciuto"}</p>
                    <p className="text-xs text-muted-foreground">
                      Ultima alle {format(new Date(m.sample_at), "HH:mm", { locale: it })}
                    </p>
                  </div>
                  <Badge variant="secondary">{m.action_count} azioni</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
