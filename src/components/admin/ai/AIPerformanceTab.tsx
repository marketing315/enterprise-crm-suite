import { useState } from "react";
import { useAIMetricsOverview, type MetricsPeriod } from "@/hooks/useAIMetrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  Timer,
  Gauge,
  AlertTriangle,
  Bell,
  TrendingUp,
  Zap,
  Clock,
  Activity,
} from "lucide-react";

const PERIOD_OPTIONS: { value: MetricsPeriod; label: string }[] = [
  { value: "today", label: "Oggi" },
  { value: "7d", label: "7g" },
  { value: "30d", label: "30g" },
];

interface AlertConfig {
  id: string;
  name: string;
  description: string;
  threshold: number;
  unit: string;
  enabled: boolean;
}

const DEFAULT_ALERTS: AlertConfig[] = [
  {
    id: "cost",
    name: "Costo giornaliero",
    description: "Avvisa quando il costo giornaliero supera la soglia",
    threshold: 50,
    unit: "€",
    enabled: true,
  },
  {
    id: "error_rate",
    name: "Error rate",
    description: "Avvisa quando il tasso di errore supera la soglia",
    threshold: 10,
    unit: "%",
    enabled: true,
  },
  {
    id: "latency",
    name: "Latenza P95",
    description: "Avvisa quando la latenza P95 supera la soglia",
    threshold: 10,
    unit: "s",
    enabled: true,
  },
  {
    id: "queue_depth",
    name: "Profondità coda",
    description: "Avvisa quando ci sono troppi job in coda",
    threshold: 50,
    unit: "job",
    enabled: false,
  },
];

export function AIPerformanceTab() {
  const [period, setPeriod] = useState<MetricsPeriod>("7d");
  const [alerts, setAlerts] = useState(DEFAULT_ALERTS);

  const { data: overview, isLoading } = useAIMetricsOverview(period);

  const toggleAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, enabled: !a.enabled } : a))
    );
  };

  const updateThreshold = (alertId: string, value: number) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, threshold: value } : a))
    );
  };

  // Mock cost data (in real app, would come from usage tracking)
  const estimatedCost = overview ? (overview.job_counts.completed * 0.01).toFixed(2) : "0.00";
  const estimatedTokens = overview ? overview.job_counts.completed * 1500 : 0;

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex justify-end gap-1">
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={period === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(option.value)}
            className="px-3"
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Cost & Usage Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : overview ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Costo stimato
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">€{estimatedCost}</div>
              <p className="text-sm text-muted-foreground">
                ~€{(parseFloat(estimatedCost) / 7).toFixed(2)}/giorno
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Token utilizzati
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {(estimatedTokens / 1000).toFixed(0)}K
              </div>
              <p className="text-sm text-muted-foreground">
                ~1.5K token/richiesta
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Timer className="h-4 w-4" />
                Latenza P50 / P95
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {(overview.latency.avg_ms / 1000).toFixed(1)}s
              </div>
              <p className="text-sm text-muted-foreground">
                P95: {(overview.latency.p95_ms / 1000).toFixed(1)}s
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Coda
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {overview.job_counts.pending + overview.job_counts.processing}
              </div>
              <p className="text-sm text-muted-foreground">
                {overview.job_counts.pending} pending, {overview.job_counts.processing} processing
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Performance Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Breakdown performance
          </CardTitle>
          <CardDescription>
            Distribuzione delle performance nel periodo selezionato
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Richieste completate</span>
              <span className="font-medium text-green-600">
                {overview?.job_counts.completed || 0}
              </span>
            </div>
            <Progress
              value={
                overview?.job_counts.total
                  ? (overview.job_counts.completed / overview.job_counts.total) * 100
                  : 0
              }
              className="h-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Richieste fallite</span>
              <span className="font-medium text-red-500">
                {overview?.job_counts.failed || 0}
              </span>
            </div>
            <Progress
              value={
                overview?.job_counts.total
                  ? (overview.job_counts.failed / overview.job_counts.total) * 100
                  : 0
              }
              className="h-2 [&>div]:bg-red-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Fallback (AI non disponibile)</span>
              <span className="font-medium text-amber-500">
                {overview?.fallback_count || 0}
              </span>
            </div>
            <Progress
              value={
                overview?.job_counts.total
                  ? (overview.fallback_count / overview.job_counts.total) * 100
                  : 0
              }
              className="h-2 [&>div]:bg-amber-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Rate Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Rate limits
          </CardTitle>
          <CardDescription>
            Stato dei limiti di utilizzo API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Richieste/minuto</span>
                <Badge variant="secondary">60/60</Badge>
              </div>
              <Progress value={100} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                Limite: 60 req/min
              </p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Token/giorno</span>
                <Badge variant="secondary">{(estimatedTokens / 1000).toFixed(0)}K/1M</Badge>
              </div>
              <Progress value={(estimatedTokens / 1000000) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                Limite: 1M token/giorno
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configurazione alert
          </CardTitle>
          <CardDescription>
            Configura le soglie per gli avvisi automatici
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  alert.enabled ? "bg-background" : "bg-muted/50"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className={`h-4 w-4 ${
                        alert.enabled ? "text-amber-500" : "text-muted-foreground"
                      }`}
                    />
                    <span className="font-medium">{alert.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {alert.description}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-20 h-8"
                      value={alert.threshold}
                      onChange={(e) =>
                        updateThreshold(alert.id, parseFloat(e.target.value) || 0)
                      }
                      disabled={!alert.enabled}
                    />
                    <span className="text-sm text-muted-foreground w-8">
                      {alert.unit}
                    </span>
                  </div>
                  <Switch
                    checked={alert.enabled}
                    onCheckedChange={() => toggleAlert(alert.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
