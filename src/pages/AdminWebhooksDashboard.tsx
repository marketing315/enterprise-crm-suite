import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { MetricCard } from "@/components/admin/MetricCard";
import { WebhookMetricsCharts } from "@/components/admin/WebhookMetricsCharts";
import { WebhookErrorsTable } from "@/components/admin/WebhookErrorsTable";
import { WebhookDeliveriesCompact } from "@/components/admin/WebhookDeliveriesCompact";
import {
  useWebhookMetrics24h,
  useWebhookTimeseries24h,
  useWebhookTopErrors24h,
  useWebhookTopEventTypes24h,
  useWebhookTopWebhooks24h,
} from "@/hooks/useWebhookMetrics";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  RefreshCw,
  Webhook,
  Timer,
} from "lucide-react";
import { Navigate } from "react-router-dom";

export default function AdminWebhooksDashboard() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const { isAdmin } = useAuth();

  // Fetch all metrics
  const { data: metrics, isLoading: loadingMetrics, refetch: refetchMetrics } = useWebhookMetrics24h();
  const { data: timeseries, isLoading: loadingTimeseries, refetch: refetchTimeseries } = useWebhookTimeseries24h(15);
  const { data: errors, isLoading: loadingErrors, refetch: refetchErrors } = useWebhookTopErrors24h(10);
  const { data: eventTypes, refetch: refetchEventTypes } = useWebhookTopEventTypes24h(10);
  const { data: webhooks, isLoading: loadingWebhooks, refetch: refetchWebhooks } = useWebhookTopWebhooks24h(10);

  // Admin-only access
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!hasBrandSelected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Webhook className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl md:text-2xl font-bold mb-2">Seleziona un Brand</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Utilizza il selettore nella sidebar per scegliere il brand.
        </p>
      </div>
    );
  }

  const isLoading = loadingMetrics || loadingTimeseries || loadingErrors || loadingWebhooks;

  const handleRefreshAll = () => {
    refetchMetrics();
    refetchTimeseries();
    refetchErrors();
    refetchEventTypes();
    refetchWebhooks();
  };

  // Compute rates
  const successRate = metrics && metrics.total_deliveries > 0
    ? Math.round((metrics.success_count / metrics.total_deliveries) * 100)
    : 0;
  const failRate = metrics && metrics.total_deliveries > 0
    ? Math.round((metrics.failed_count / metrics.total_deliveries) * 100)
    : 0;
  const queueDepth = (metrics?.pending_count || 0) + (metrics?.sending_count || 0);

  return (
    <div className="space-y-4 md:space-y-6" data-testid="webhooks-dashboard-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary/10">
            <Webhook className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold">Webhook Monitor</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Ultime 24h · {currentBrand?.name}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* KPI Cards */}
      <div data-testid="webhooks-dashboard-kpis">
        {loadingMetrics ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px]" />
            ))}
          </div>
        ) : metrics ? (
          <ScrollArea className="w-full">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-6 min-w-[600px] lg:min-w-0 pb-2">
              <MetricCard
                title="Deliveries"
                value={metrics.total_deliveries}
                icon={Activity}
                subtitle="ultime 24h"
              />
              <MetricCard
                title="Success"
                value={`${successRate}%`}
                icon={CheckCircle2}
                variant={successRate >= 95 ? "success" : successRate >= 80 ? "warning" : "danger"}
                subtitle={`${metrics.success_count} ok`}
              />
              <MetricCard
                title="Fail"
                value={`${failRate}%`}
                icon={XCircle}
                variant={failRate <= 5 ? "success" : failRate <= 15 ? "warning" : "danger"}
                subtitle={`${metrics.failed_count} errori`}
              />
              <MetricCard
                title="Latency"
                value={
                  metrics.p50_latency_ms != null
                    ? `P50: ${metrics.p50_latency_ms}ms`
                    : "N/A"
                }
                icon={Timer}
                variant={
                  metrics.p95_latency_ms == null ? "default" :
                  metrics.p95_latency_ms <= 500 ? "success" :
                  metrics.p95_latency_ms <= 2000 ? "warning" : "danger"
                }
                subtitle={metrics.p95_latency_ms != null ? `P95: ${metrics.p95_latency_ms}ms` : ""}
              />
              <MetricCard
                title="Queue"
                value={queueDepth}
                icon={Clock}
                variant={queueDepth > 50 ? "danger" : queueDepth > 10 ? "warning" : "success"}
                subtitle={`${metrics.pending_count} pending`}
              />
              <MetricCard
                title="Tentativi"
                value={metrics.avg_attempts || 1}
                icon={Send}
                variant={metrics.avg_attempts > 2 ? "warning" : "success"}
                subtitle="per delivery"
              />
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        ) : null}
      </div>

      {/* Timeseries Charts */}
      <div data-testid="webhooks-dashboard-timeseries">
        {!loadingTimeseries && timeseries && eventTypes && webhooks && (
          <WebhookMetricsCharts
            timeseries={timeseries}
            topEventTypes={eventTypes}
            topWebhooks={webhooks}
          />
        )}
      </div>

      {/* Errors Section */}
      {!loadingErrors && errors && webhooks && (
        <WebhookErrorsTable errors={errors} webhooks={webhooks} />
      )}

      {/* Latest Deliveries (embedded compact monitor) */}
      <WebhookDeliveriesCompact />
    </div>
  );
}
