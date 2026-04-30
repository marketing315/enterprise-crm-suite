import { useAIOverrideSummary, useAIOverrideRateDaily } from "@/hooks/useAIOverrideRate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Brain, AlertCircle, CheckCircle2, XCircle, Edit3 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

/**
 * AI Override Rate widget — shows what % of AI decisions humans overrode
 * over the last 30 days, plus call-action proposal outcomes.
 *
 * Lives inside AdminAIMetrics page. Admin/CEO/responsabili only (RPC enforces).
 */
export function AIOverrideRateWidget() {
  const { data: summary, isLoading } = useAIOverrideSummary(30);
  const { data: daily } = useAIOverrideRateDaily(30);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" /> Override umani su decisioni AI (30g)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const overrideRate = summary.decisions.override_rate_pct ?? 0;
  const overrideTone =
    overrideRate >= 30 ? "destructive" : overrideRate >= 15 ? "secondary" : "default";

  const chartData = (daily ?? []).map((d) => ({
    day: new Date(d.day).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }),
    rate: Number(d.override_rate_pct ?? 0),
    total: d.total_decisions,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Brain className="h-4 w-4" /> Override umani su decisioni AI
          </span>
          <Badge variant={overrideTone as never}>{overrideRate.toFixed(1)}%</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Decisioni AI"
            value={summary.decisions.total.toLocaleString("it-IT")}
          />
          <Stat
            label="Overridden"
            value={summary.decisions.overridden.toLocaleString("it-IT")}
            icon={<AlertCircle className="h-3 w-3 text-destructive" />}
          />
          <Stat
            label="Conf. media"
            value={
              summary.decisions.avg_confidence != null
                ? `${(Number(summary.decisions.avg_confidence) * 100).toFixed(0)}%`
                : "—"
            }
          />
          <Stat
            label="Conf. quando override"
            value={
              summary.decisions.avg_confidence_when_overridden != null
                ? `${(Number(summary.decisions.avg_confidence_when_overridden) * 100).toFixed(0)}%`
                : "—"
            }
          />
        </div>

        {/* Trend chart */}
        {chartData.length > 0 && (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  domain={[0, "auto"]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === "rate" ? [`${v.toFixed(1)}%`, "Override"] : [v, name]
                  }
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top override categories */}
        {summary.decisions.top_override_categories.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Top motivi di override</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.decisions.top_override_categories.slice(0, 6).map((c) => (
                <Badge key={c.category} variant="outline" className="text-xs">
                  {c.category} · {c.cnt}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Call-action proposals */}
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground mb-2">
            Esiti proposte azioni AI (ultimi 30g) · {summary.proposals.total} totali
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <ProposalStat
              icon={<CheckCircle2 className="h-3 w-3 text-green-600" />}
              label="Approvate"
              value={summary.proposals.approved}
            />
            <ProposalStat
              icon={<Edit3 className="h-3 w-3 text-yellow-600" />}
              label="Modificate"
              value={summary.proposals.edited}
            />
            <ProposalStat
              icon={<XCircle className="h-3 w-3 text-destructive" />}
              label="Rifiutate"
              value={summary.proposals.rejected}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ProposalStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border bg-card/50 px-2 py-1.5">
      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground uppercase">
        {icon} {label}
      </div>
      <p className="text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}
