import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useBoardSloMetrics, type SloMetric } from "@/hooks/useBoardSloMetrics";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Target, Server, Headphones, TrendingUp, ChevronDown, ChevronUp,
  Minus, Info, Shield, Activity, Zap, Clock, BarChart3, Users,
} from "lucide-react";
import { useState, useMemo } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";

// ============= Status helpers =============

type SloStatus = "green" | "yellow" | "red";

function getSloStatus(metric: SloMetric): SloStatus {
  const isLowerBetter = metric.direction === "lower_is_better";
  const val = metric.value;
  const tgt = metric.target;

  if (isLowerBetter) {
    if (val <= tgt) return "green";
    if (val <= tgt * 1.5) return "yellow";
    return "red";
  }
  if (val >= tgt) return "green";
  if (val >= tgt * 0.9) return "yellow";
  return "red";
}

function getStatusColor(status: SloStatus): string {
  switch (status) {
    case "green": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    case "yellow": return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
    case "red": return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
  }
}

function getStatusDot(status: SloStatus): string {
  switch (status) {
    case "green": return "bg-emerald-500";
    case "yellow": return "bg-amber-500";
    case "red": return "bg-red-500";
  }
}

function getStatusLabel(status: SloStatus): string {
  switch (status) {
    case "green": return "On Target";
    case "yellow": return "At Risk";
    case "red": return "Breached";
  }
}

// ============= Section health =============

function getSectionHealth(metrics: SloMetric[]): SloStatus {
  const statuses = metrics.map(getSloStatus);
  if (statuses.some(s => s === "red")) return "red";
  if (statuses.some(s => s === "yellow")) return "yellow";
  return "green";
}

// ============= SLO Card =============

function SloCard({
  label,
  metric,
  icon: Icon,
  detail,
}: {
  label: string;
  metric: SloMetric;
  icon: React.ElementType;
  detail?: string;
}) {
  const status = getSloStatus(metric);
  const isLowerBetter = metric.direction === "lower_is_better";
  const TrendIcon = isLowerBetter
    ? metric.value <= metric.target ? ChevronDown : ChevronUp
    : metric.value >= metric.target ? ChevronUp : ChevronDown;
  const trendOk = isLowerBetter
    ? metric.value <= metric.target
    : metric.value >= metric.target;

  return (
    <TooltipProvider>
      <div className={`rounded-xl border p-4 transition-colors ${getStatusColor(status)}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 opacity-70" />
            <span className="text-sm font-medium">{label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${getStatusDot(status)}`} />
            <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
              {getStatusLabel(status)}
            </span>
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{metric.value}</span>
          <span className="text-sm opacity-60">{metric.unit}</span>
          <TrendIcon className={`h-4 w-4 ml-auto ${trendOk ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs opacity-60">
          <span>Target: {isLowerBetter ? "≤" : "≥"} {metric.target}{metric.unit}</span>
          {detail && (
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {detail}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ============= Section =============

function OwnerSection({
  title,
  owner,
  icon: Icon,
  metrics,
  children,
}: {
  title: string;
  owner: string;
  icon: React.ElementType;
  metrics: SloMetric[];
  children: React.ReactNode;
}) {
  const health = getSectionHealth(metrics);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${getStatusColor(health)}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs">{owner}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={getStatusColor(health)}>
            {getStatusLabel(health)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

// ============= Month selector =============

function MonthSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = startOfMonth(subMonths(now, i));
      return {
        value: d.toISOString(),
        label: format(d, "MMMM yyyy", { locale: it }),
      };
    });
  }, []);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {months.map(m => (
          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============= Executive summary =============

function ExecutiveSummary({ data }: { data: NonNullable<ReturnType<typeof useBoardSloMetrics>["data"]> }) {
  const allMetrics: SloMetric[] = [
    data.engineering.ingest_availability,
    data.engineering.ai_success_rate,
    data.engineering.webhook_delivery_rate,
    data.cx_ops.sla_compliance,
    data.cx_ops.mttr_hours,
    data.cx_ops.ai_override_rate,
    data.sales_ops.lead_conversion,
    data.sales_ops.deal_velocity,
  ];

  const greenCount = allMetrics.filter(m => getSloStatus(m) === "green").length;
  const yellowCount = allMetrics.filter(m => getSloStatus(m) === "yellow").length;
  const redCount = allMetrics.filter(m => getSloStatus(m) === "red").length;
  const overallHealth = getSectionHealth(allMetrics);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${getStatusColor(overallHealth)}`}>
              <Target className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold">Stato complessivo SLO</p>
              <p className="text-sm text-muted-foreground">{allMetrics.length} obiettivi monitorati</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-full ${getStatusDot("green")}`} />
              <span className="text-sm font-medium">{greenCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-full ${getStatusDot("yellow")}`} />
              <span className="text-sm font-medium">{yellowCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-full ${getStatusDot("red")}`} />
              <span className="text-sm font-medium">{redCount}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= Loading skeleton =============

function SloSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full rounded-xl" />
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(j => <Skeleton key={j} className="h-28 rounded-xl" />)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============= Main Page =============

export default function AdminSloBoard() {
  const { isAdmin } = useAuth();
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()).toISOString());
  const { data, isLoading } = useBoardSloMetrics(monthStart);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardShell
      title="SLO Board"
      subtitle="Service Level Objectives — Vista mensile per funzione"
      icon={<Target className="h-6 w-6 text-primary" />}
      queryKeys={[["board-slo-metrics"]]}
    >
      <div className="flex justify-end mb-2">
        <MonthSelector value={monthStart} onChange={setMonthStart} />
      </div>

      {isLoading || !data ? (
        <SloSkeleton />
      ) : (
        <div className="space-y-6">
          <ExecutiveSummary data={data} />

          {/* Engineering */}
          <OwnerSection
            title="Engineering"
            owner="Platform & Reliability"
            icon={Server}
            metrics={[
              data.engineering.ingest_availability,
              data.engineering.ai_success_rate,
              data.engineering.webhook_delivery_rate,
            ]}
          >
            <SloCard
              label="Ingest Availability"
              metric={data.engineering.ingest_availability}
              icon={Activity}
              detail={`${data.engineering.ingest_availability.total?.toLocaleString()} richieste totali, ${data.engineering.ingest_availability.success?.toLocaleString()} successi`}
            />
            <SloCard
              label="AI Success Rate"
              metric={data.engineering.ai_success_rate}
              icon={Zap}
              detail={`${data.engineering.ai_success_rate.completed} completati su ${data.engineering.ai_success_rate.total} job`}
            />
            <SloCard
              label="Webhook Delivery"
              metric={data.engineering.webhook_delivery_rate}
              icon={Shield}
              detail={`DLQ rate: ${data.engineering.webhook_delivery_rate.dlq_rate}% (${data.engineering.webhook_delivery_rate.dlq} in coda)`}
            />
          </OwnerSection>

          {/* CX Ops */}
          <OwnerSection
            title="CX Ops"
            owner="Customer Experience & Support"
            icon={Headphones}
            metrics={[
              data.cx_ops.sla_compliance,
              data.cx_ops.mttr_hours,
              data.cx_ops.ai_override_rate,
            ]}
          >
            <SloCard
              label="SLA Compliance"
              metric={data.cx_ops.sla_compliance}
              icon={Target}
              detail={`${data.cx_ops.sla_compliance.within_sla} su ${data.cx_ops.sla_compliance.total} ticket entro SLA`}
            />
            <SloCard
              label="MTTR"
              metric={data.cx_ops.mttr_hours}
              icon={Clock}
              detail="Tempo medio di risoluzione ticket (ore)"
            />
            <SloCard
              label="AI Override Rate"
              metric={data.cx_ops.ai_override_rate}
              icon={BarChart3}
              detail={`${data.cx_ops.ai_override_rate.overrides} override su ${data.cx_ops.ai_override_rate.total} decisioni AI`}
            />
          </OwnerSection>

          {/* Sales Ops */}
          <OwnerSection
            title="Sales Ops"
            owner="Pipeline & Revenue"
            icon={TrendingUp}
            metrics={[
              data.sales_ops.lead_conversion,
              data.sales_ops.deal_velocity,
            ]}
          >
            <SloCard
              label="Lead → Deal Conversion"
              metric={data.sales_ops.lead_conversion}
              icon={Users}
              detail={`${data.sales_ops.lead_conversion.converted} deal da ${data.sales_ops.lead_conversion.total_leads} lead`}
            />
            <SloCard
              label="Deal Velocity"
              metric={data.sales_ops.deal_velocity}
              icon={Clock}
              detail={`Mediana: ${data.sales_ops.deal_velocity.median}gg · ${data.sales_ops.deal_velocity.closed} deal chiusi`}
            />
          </OwnerSection>
        </div>
      )}
    </DashboardShell>
  );
}
