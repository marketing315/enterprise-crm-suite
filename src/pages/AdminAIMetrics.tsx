import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useAIMetricsOverview, useAIMetricsErrors, type MetricsPeriod } from "@/hooks/useAIMetrics";
import { MetricCard } from "@/components/admin/MetricCard";
import { AIMetricsCharts } from "@/components/admin/AIMetricsCharts";
import { ErrorsTable } from "@/components/admin/ErrorsTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Ticket,
  Zap,
  Timer,
  Building2,
} from "lucide-react";

const PERIOD_OPTIONS: { value: MetricsPeriod; label: string }[] = [
  { value: "today", label: "Oggi" },
  { value: "7d", label: "7 giorni" },
  { value: "30d", label: "30 giorni" },
];

export default function AdminAIMetrics() {
  const { isAdmin, isCeo } = useAuth();
  const { hasBrandSelected, currentBrand } = useBrand();
  const [period, setPeriod] = useState<MetricsPeriod>("7d");

  const { data: overview, isLoading: loadingOverview } = useAIMetricsOverview(period);
  const { data: errors, isLoading: loadingErrors } = useAIMetricsErrors(period);

  // Access control: only admin and ceo
  if (!isAdmin && !isCeo) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!hasBrandSelected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Seleziona un Brand</h2>
        <p className="text-muted-foreground max-w-md">
          Utilizza il selettore nella sidebar per scegliere il brand.
        </p>
      </div>
    );
  }

  const successRate = overview?.job_counts.total
    ? Math.round((overview.job_counts.completed / overview.job_counts.total) * 100)
    : 0;

  const failRate = overview?.job_counts.total
    ? Math.round((overview.job_counts.failed / overview.job_counts.total) * 100)
    : 0;

  const ticketRate = overview?.ticket_stats.support_count
    ? Math.round(
        (overview.ticket_stats.tickets_created / overview.ticket_stats.support_count) * 100
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Metrics</h1>
          <p className="text-muted-foreground">
            Monitoraggio performance del sistema AI per {currentBrand?.name}
          </p>
        </div>
        <div className="flex gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={period === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      {loadingOverview ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px]" />
          ))}
        </div>
      ) : overview ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Job Totali"
            value={overview.job_counts.total}
            icon={Activity}
            subtitle={`${overview.job_counts.pending} in coda`}
          />
          <MetricCard
            title="Success Rate"
            value={`${successRate}%`}
            icon={CheckCircle2}
            variant={successRate >= 90 ? "success" : successRate >= 70 ? "warning" : "danger"}
            subtitle={`${overview.job_counts.completed} completati`}
          />
          <MetricCard
            title="Fail Rate"
            value={`${failRate}%`}
            icon={XCircle}
            variant={failRate <= 5 ? "success" : failRate <= 15 ? "warning" : "danger"}
            subtitle={`${overview.job_counts.failed} falliti`}
          />
          <MetricCard
            title="Backlog"
            value={overview.job_counts.pending + overview.job_counts.processing}
            icon={Clock}
            variant={
              overview.job_counts.pending > 10
                ? "danger"
                : overview.job_counts.pending > 5
                ? "warning"
                : "success"
            }
            subtitle="pending + processing"
          />
          <MetricCard
            title="Fallback"
            value={overview.fallback_count}
            icon={AlertTriangle}
            variant={overview.fallback_count > 0 ? "warning" : "success"}
            subtitle="AI non disponibile"
          />
          <MetricCard
            title="Latenza Media"
            value={`${Math.round(overview.latency.avg_ms / 1000)}s`}
            icon={Zap}
            subtitle={`P95: ${Math.round(overview.latency.p95_ms / 1000)}s`}
          />
          <MetricCard
            title="Tentativi Medi"
            value={overview.latency.avg_attempts}
            icon={Timer}
            variant={overview.latency.avg_attempts > 2 ? "warning" : "success"}
          />
          <MetricCard
            title="Ticket Creati"
            value={overview.ticket_stats.tickets_created}
            icon={Ticket}
            subtitle={`${ticketRate}% dei support`}
          />
        </div>
      ) : null}

      {/* Charts */}
      {!loadingOverview && overview && (
        <AIMetricsCharts
          dailyTrend={overview.daily_trend || []}
          leadTypeDistribution={overview.lead_type_distribution || []}
          priorityDistribution={overview.priority_distribution || []}
        />
      )}

      {/* Errors Table */}
      {loadingErrors ? (
        <Skeleton className="h-[300px]" />
      ) : (
        <ErrorsTable errors={errors || []} />
      )}
    </div>
  );
}
