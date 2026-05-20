import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, Clock, AlertCircle, Zap, Webhook, Brain, Timer, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHealthCheck, type ServiceCheck } from "@/hooks/useHealthCheck";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

const serviceDisplayMap: Record<string, { label: string; icon: React.ReactNode }> = {
  database: { label: "Database", icon: <Webhook className="h-4 w-4" /> },
  edge_runtime: { label: "Edge Runtime", icon: <Zap className="h-4 w-4" /> },
};

const fallbackServices = [
  { name: "Webhook Inbound", status: "active" as const, detail: "—", icon: <Webhook className="h-4 w-4" /> },
  { name: "AI Classification", status: "active" as const, detail: "—", icon: <Brain className="h-4 w-4" /> },
  { name: "SLA Checker", status: "scheduled" as const, detail: "Ogni 5 min", icon: <Timer className="h-4 w-4" /> },
];

export function DashboardSystemStatus() {
  const { data, isLoading, isError } = useHealthCheck();
  const queryClient = useQueryClient();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
      case "active":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case "degraded":
      case "scheduled":
        return <Clock className="h-3.5 w-3.5 text-amber-500" />;
      default:
        return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "healthy": return "Operativo";
      case "degraded": return "Degradato";
      case "down": return "Non disponibile";
      default: return s;
    }
  };

  const liveServices: { name: string; status: string; detail: string; icon: React.ReactNode }[] =
    data?.services.map((s: ServiceCheck) => ({
      name: serviceDisplayMap[s.name]?.label ?? s.name,
      status: s.status,
      detail: s.detail ?? `${s.latency_ms}ms`,
      icon: serviceDisplayMap[s.name]?.icon ?? <Zap className="h-4 w-4" />,
    })) ?? [];

  const services = [
    ...liveServices,
    ...fallbackServices,
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Stato Sistema</CardTitle>
            <CardDescription>
              {data ? `Aggiornato: ${data.timestamp}` : "Servizi backend"}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() = aria-label="Caricamento"> queryClient.invalidateQueries({ queryKey: ["health-check"] })}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {isError && (
          <p className="text-xs text-destructive mt-1">Health check non raggiungibile</p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {services.map((service) => (
            <div
              key={service.name}
              className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className={cn(
                "p-1.5 rounded-md",
                (service.status === "healthy" || service.status === "active") ? "bg-green-500/10 text-green-600" :
                (service.status === "degraded" || service.status === "scheduled") ? "bg-amber-500/10 text-amber-600" :
                "bg-destructive/10 text-destructive"
              )}>
                {service.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{service.name}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {getStatusIcon(service.status)}
                <span className="text-xs text-muted-foreground">
                  {statusLabel(service.status) !== service.status ? statusLabel(service.status) : service.detail}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
