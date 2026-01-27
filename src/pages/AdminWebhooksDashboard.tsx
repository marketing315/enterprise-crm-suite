import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Webhook className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Seleziona un Brand</h2>
        <p className="text-muted-foreground max-w-md">
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
    <div className="space-y-6" data-testid="webhooks-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Webhook className="h-8 w-8" />
            Webhook Monitoring
          </h1>
          <p className="text-muted-foreground">
            Dashboard metriche webhook per {currentBrand?.name} (ultime 24h)
          </p>
        </div>
        <Button variant="outline" onClick={handleRefreshAll} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Aggiorna tutto
        </Button>
      </div>

      {/* KPI Cards */}
      <div data-testid="webhooks-dashboard-kpis">
        {loadingMetrics ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[120px]" />
            ))}
          </div>
        ) : metrics ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <MetricCard
              title="Total Deliveries"
              value={metrics.total_deliveries}
              icon={Activity}
              subtitle="ultime 24h"
            />
            <MetricCard
              title="Success Rate"
              value={`${successRate}%`}
              icon={CheckCircle2}
              variant={successRate >= 95 ? "success" : successRate >= 80 ? "warning" : "danger"}
              subtitle={`${metrics.success_count} completati`}
            />
            <MetricCard
              title="Fail Rate"
              value={`${failRate}%`}
              icon={XCircle}
              variant={failRate <= 5 ? "success" : failRate <= 15 ? "warning" : "danger"}
              subtitle={`${metrics.failed_count} falliti`}
            />
            <MetricCard
              title="Queue Depth"
              value={queueDepth}
              icon={Clock}
              variant={queueDepth > 50 ? "danger" : queueDepth > 10 ? "warning" : "success"}
              subtitle={`${metrics.pending_count} pending + ${metrics.sending_count} sending`}
            />
            <MetricCard
              title="Avg Attempts"
              value={metrics.avg_attempts || 1}
              icon={Send}
              variant={metrics.avg_attempts > 2 ? "warning" : "success"}
              subtitle="per delivery"
            />
          </div>
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
