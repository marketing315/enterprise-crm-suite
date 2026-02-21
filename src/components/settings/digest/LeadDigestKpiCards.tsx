import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, AlertTriangle, Activity, TrendingUp } from "lucide-react";
import { useLeadDigestRuns, type LeadDigestRun } from "@/hooks/useLeadDigest";
import { differenceInMilliseconds, parseISO } from "date-fns";

interface DigestKpis {
  totalRuns: number;
  sentCount: number;
  failedCount: number;
  successRate: number | null;
  medianLatencyMs: number | null;
  consecutiveFailures: number;
  failedRetriesAboveThreshold: number; // runs with attempt_no > 2
  recentWindow: "24h" | "7d" | "30d";
}

function computeKpis(runs: LeadDigestRun[]): DigestKpis {
  const now = Date.now();
  const last7d = runs.filter(
    (r) => now - new Date(r.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
  );

  const totalRuns = last7d.length;
  const sentCount = last7d.filter((r) => r.status === "sent").length;
  const failedCount = last7d.filter((r) => r.status === "failed").length;
  const successRate = totalRuns > 0 ? (sentCount / totalRuns) * 100 : null;

  // Median dispatch latency (from created_at to sent_at for successful runs)
  const latencies = last7d
    .filter((r) => r.status === "sent" && r.sent_at)
    .map((r) => differenceInMilliseconds(parseISO(r.sent_at!), parseISO(r.created_at)))
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b);

  const medianLatencyMs =
    latencies.length > 0
      ? latencies[Math.floor(latencies.length / 2)]
      : null;

  // Consecutive failures (from most recent)
  let consecutiveFailures = 0;
  // Sort by created_at desc (already sorted from hook)
  for (const run of runs) {
    if (run.status === "failed") {
      consecutiveFailures++;
    } else {
      break;
    }
  }

  // Runs that exhausted retries (attempt > 2)
  const failedRetriesAboveThreshold = last7d.filter(
    (r) => r.status === "failed" && r.attempt_no > 2
  ).length;

  return {
    totalRuns,
    sentCount,
    failedCount,
    successRate,
    medianLatencyMs,
    consecutiveFailures,
    failedRetriesAboveThreshold,
    recentWindow: "7d",
  };
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

export function LeadDigestKpiCards() {
  const { data: runs, isLoading } = useLeadDigestRuns(100);

  const kpis = useMemo(() => {
    if (!runs?.length) return null;
    return computeKpis(runs);
  }, [runs]);

  if (isLoading || !kpis) return null;

  const hasAlert = kpis.consecutiveFailures >= 2;
  const hasRetryAlert = kpis.failedRetriesAboveThreshold > 0;

  return (
    <div className="space-y-3">
      {/* Alert for consecutive failures */}
      {hasAlert && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>⚠️ {kpis.consecutiveFailures} fallimenti consecutivi rilevati.</strong>{" "}
            Verificare la connettività webhook e i destinatari configurati.
          </AlertDescription>
        </Alert>
      )}

      {hasRetryAlert && !hasAlert && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {kpis.failedRetriesAboveThreshold} invii hanno superato il limite di retry ({">"} 2 tentativi) negli ultimi 7 giorni.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Success Rate */}
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Success rate (7d)
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold font-mono">
                {kpis.successRate !== null ? `${kpis.successRate.toFixed(0)}%` : "—"}
              </span>
              {kpis.successRate !== null && (
                kpis.successRate >= 95
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : kpis.successRate >= 80
                  ? <Activity className="h-4 w-4 text-yellow-600" />
                  : <XCircle className="h-4 w-4 text-destructive" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.sentCount}/{kpis.totalRuns} invii riusciti
            </p>
          </CardContent>
        </Card>

        {/* Median Latency */}
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" />
              Latenza mediana (7d)
            </div>
            <span className="text-2xl font-bold font-mono">
              {formatLatency(kpis.medianLatencyMs)}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Tempo dispatch → invio
            </p>
          </CardContent>
        </Card>

        {/* Consecutive Failures */}
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <XCircle className="h-3.5 w-3.5" />
              Fallimenti consecutivi
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold font-mono">
                {kpis.consecutiveFailures}
              </span>
              {kpis.consecutiveFailures >= 2 && (
                <Badge variant="destructive" className="text-xs">ALERT</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Dalla sequenza più recente
            </p>
          </CardContent>
        </Card>

        {/* Failed retries > threshold */}
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Retry esauriti (7d)
            </div>
            <span className="text-2xl font-bold font-mono">
              {kpis.failedRetriesAboveThreshold}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Tentativi {">"} 2 falliti
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
