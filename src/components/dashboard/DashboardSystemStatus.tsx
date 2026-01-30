import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, Clock, AlertCircle, Zap, Webhook, Brain, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

interface SystemService {
  name: string;
  status: "active" | "scheduled" | "warning";
  detail: string;
  icon: React.ReactNode;
}

const services: SystemService[] = [
  {
    name: "Webhook Inbound",
    status: "active",
    detail: "Operativo",
    icon: <Webhook className="h-4 w-4" />,
  },
  {
    name: "AI Classification",
    status: "active",
    detail: "Operativo",
    icon: <Brain className="h-4 w-4" />,
  },
  {
    name: "Outbound Webhooks",
    status: "active",
    detail: "Operativo",
    icon: <Zap className="h-4 w-4" />,
  },
  {
    name: "SLA Checker",
    status: "scheduled",
    detail: "Ogni 5 min",
    icon: <Timer className="h-4 w-4" />,
  },
];

export function DashboardSystemStatus() {
  const getStatusIcon = (status: SystemService["status"]) => {
    switch (status) {
      case "active":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case "scheduled":
        return <Clock className="h-3.5 w-3.5 text-amber-500" />;
      case "warning":
        return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Stato Sistema</CardTitle>
        <CardDescription>Servizi backend attivi</CardDescription>
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
                service.status === "active" ? "bg-green-500/10 text-green-600" :
                service.status === "scheduled" ? "bg-amber-500/10 text-amber-600" :
                "bg-destructive/10 text-destructive"
              )}>
                {service.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{service.name}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {getStatusIcon(service.status)}
                <span className="text-xs text-muted-foreground">{service.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
