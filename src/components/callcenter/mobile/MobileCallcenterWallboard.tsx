/**
 * F5.3 — Mobile Wallboard Call Center.
 * Numeri grandi (hero + KpiList), Segmented periodo, refresh auto/manuale, leggibile a distanza.
 * Riusa useOperatorKpis + useTrackingNumberPerformance (zero RPC nuove).
 */
import { useMemo, useState } from "react";
import {
  Activity,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneOff,
  Timer,
  RefreshCw,
  AlertCircle,
  Radio,
  Headphones,
  Inbox,
} from "lucide-react";

import {
  Segmented,
  HeroMetricCard,
  KpiList,
  MetricRow,
  MobileListSkeleton,
  EmptyState,
  ErrorState,
  PullToRefresh,
  type ChipOption,
} from "@/components/mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBrand } from "@/contexts/BrandContext";
import { useOperatorKpis } from "@/hooks/useOperatorKpis";
import { useTrackingNumberPerformance } from "@/hooks/useTrackingNumberPerformance";
import { cn } from "@/lib/utils";

type RangePreset = "today" | "7d" | "30d";

const RANGE_OPTIONS: ChipOption<RangePreset>[] = [
  { value: "today", label: "Oggi" },
  { value: "7d", label: "7g" },
  { value: "30d", label: "30g" },
];

const REFRESH_OPTIONS: { label: string; value: string; ms: number | false }[] = [
  { label: "Off", value: "off", ms: false },
  { label: "15s", value: "15", ms: 15_000 },
  { label: "30s", value: "30", ms: 30_000 },
  { label: "60s", value: "60", ms: 60_000 },
];

function computeRange(preset: RangePreset) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  if (preset === "today") start.setDate(end.getDate() - 1);
  else if (preset === "7d") start.setDate(end.getDate() - 7);
  else start.setDate(end.getDate() - 30);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("it-IT");
}
function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function MobileCallcenterWallboard() {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected } = useBrand();

  const [preset, setPreset] = useState<RangePreset>("today");
  const [refreshKey, setRefreshKey] = useState("30");

  const refreshMs = useMemo(
    () => REFRESH_OPTIONS.find((o) => o.value === refreshKey)?.ms ?? false,
    [refreshKey],
  );
  const { fromIso, toIso } = useMemo(() => computeRange(preset), [preset]);

  const opsQ = useOperatorKpis(fromIso, toIso, refreshMs);
  const chQ = useTrackingNumberPerformance(fromIso, toIso, refreshMs);

  const totals = useMemo(() => {
    const list = opsQ.data ?? [];
    const sum = (k: keyof typeof list[number]) =>
      list.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const total = sum("calls_total");
    const answered = sum("calls_answered");
    const talk = sum("talk_time_seconds");
    return {
      total,
      inbound: sum("calls_inbound"),
      outbound: sum("calls_outbound"),
      answered,
      missed: sum("calls_missed"),
      talk,
      aht: answered > 0 ? Math.round(talk / answered) : null,
      answerRate: total > 0 ? (answered / total) * 100 : null,
    };
  }, [opsQ.data]);

  const byChannel = useMemo(() => {
    const map = new Map<string, { calls_in: number; answered: number; talk: number }>();
    for (const c of chQ.data ?? []) {
      const key = c.channel_name || "(senza canale)";
      const prev = map.get(key) ?? { calls_in: 0, answered: 0, talk: 0 };
      prev.calls_in += Number(c.calls_in ?? 0);
      prev.answered += Number(c.calls_answered ?? 0);
      prev.talk += Number(c.talk_time_seconds ?? 0);
      map.set(key, prev);
    }
    return Array.from(map.entries())
      .map(([channel, v]) => ({
        channel,
        ...v,
        answer_rate: v.calls_in > 0 ? v.answered / v.calls_in : null,
      }))
      .sort((a, b) => b.calls_in - a.calls_in)
      .slice(0, 6);
  }, [chQ.data]);

  const operators = useMemo(
    () =>
      [...(opsQ.data ?? [])].sort(
        (a, b) => Number(b.calls_total ?? 0) - Number(a.calls_total ?? 0),
      ),
    [opsQ.data],
  );

  const handleRefresh = async () => {
    await Promise.all([opsQ.refetch(), chQ.refetch()]);
  };

  if (!hasBrandSelected || isAllBrandsSelected) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          icon={AlertCircle}
          title="Brand non selezionato"
          description="Seleziona un brand specifico (non Azienda Intera) per vedere il wallboard."
        />
      </div>
    );
  }

  const isLoading = opsQ.isLoading || chQ.isLoading;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="flex flex-col gap-4 pb-24">
        {/* Header */}
        <header className="sticky top-0 z-20 -mt-3 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">Wallboard</h1>
              <p className="truncate text-xs text-muted-foreground">
                {currentBrand?.name} ·{" "}
                {refreshMs === false ? "manuale" : `live ${(refreshMs as number) / 1000}s`}
              </p>
            </div>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Activity
                className={cn(
                  "h-3 w-3",
                  refreshMs === false ? "text-muted-foreground" : "text-success",
                )}
              />
              {refreshMs === false ? "Paused" : "Live"}
            </Badge>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Segmented<RangePreset>
                options={RANGE_OPTIONS}
                value={preset}
                onChange={setPreset}
                ariaLabel="Periodo"
                asTabs
                size="sm"
              />
            </div>
            <Select value={refreshKey} onValueChange={setRefreshKey}>
              <SelectTrigger className="h-9 w-[88px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={() => {
                void handleRefresh();
              }}
              disabled={opsQ.isFetching || chQ.isFetching}
              aria-label="Aggiorna ora"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (opsQ.isFetching || chQ.isFetching) && "animate-spin",
                )}
              />
            </Button>
          </div>
        </header>

        {/* KPI hero + lista */}
        <section className="space-y-3 px-4" aria-label="KPI chiamate">
          {opsQ.isError ? (
            <ErrorState
              title="Errore caricamento KPI"
              description={
                opsQ.error instanceof Error ? opsQ.error.message : undefined
              }
              onRetry={() => {
                void opsQ.refetch();
              }}
            />
          ) : isLoading ? (
            <MobileListSkeleton count={4} />
          ) : (
            <>
              <HeroMetricCard
                label="Chiamate nel periodo"
                value={fmtNum(totals.total)}
                caption={
                  totals.answerRate != null
                    ? `Answer rate ${totals.answerRate.toFixed(1)}% · AHT ${fmtDuration(totals.aht)}`
                    : `AHT ${fmtDuration(totals.aht)}`
                }
                variant={
                  totals.answerRate != null && totals.answerRate < 70
                    ? "negative"
                    : "primary"
                }
              />
              <KpiList ariaLabel="Dettaglio chiamate">
                <MetricRow
                  title="In entrata"
                  value={fmtNum(totals.inbound)}
                  icon={<PhoneIncoming className="h-4 w-4" />}
                />
                <MetricRow
                  title="In uscita"
                  value={fmtNum(totals.outbound)}
                  icon={<PhoneOutgoing className="h-4 w-4" />}
                />
                <MetricRow
                  title="Risposte"
                  value={fmtNum(totals.answered)}
                  icon={<PhoneCall className="h-4 w-4" />}
                />
                <MetricRow
                  title="Perse"
                  value={fmtNum(totals.missed)}
                  icon={<PhoneOff className="h-4 w-4" />}
                  tone={totals.missed > 0 ? "warning" : undefined}
                />
                <MetricRow
                  title="Talk time"
                  value={fmtDuration(totals.talk)}
                  icon={<Timer className="h-4 w-4" />}
                />
              </KpiList>
            </>
          )}
        </section>

        {/* Canali inbound */}
        <section className="space-y-2 px-4" aria-label="Canali inbound">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Top canali inbound
          </h2>
          {chQ.isLoading ? (
            <MobileListSkeleton count={3} />
          ) : byChannel.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nessuna inbound nel periodo"
              description="Cambia periodo o verifica i tracking number."
            />
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Canali">
              {byChannel.map((row) => (
                <li key={row.channel}>
                  <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-card">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Radio className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.channel}</p>
                      <p className="truncate text-[11px] tabular-nums text-muted-foreground">
                        {fmtNum(row.answered)} risposte · talk {fmtDuration(row.talk)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {fmtNum(row.calls_in)}
                      </p>
                      <p
                        className={cn(
                          "text-[11px] tabular-nums",
                          row.answer_rate != null && row.answer_rate < 0.7
                            ? "text-warning"
                            : "text-muted-foreground",
                        )}
                      >
                        {row.answer_rate != null
                          ? `${(row.answer_rate * 100).toFixed(0)}% risp`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Operatori */}
        <section className="space-y-2 px-4" aria-label="Operatori">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Operatori
          </h2>
          {opsQ.isError ? null : opsQ.isLoading ? (
            <MobileListSkeleton count={4} />
          ) : operators.length === 0 ? (
            <EmptyState
              icon={Headphones}
              title="Nessun operatore attivo"
              description="Nessuna attività nel periodo selezionato."
            />
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Lista operatori">
              {operators.map((op) => {
                const initials = (op.full_name || "?")
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase())
                  .join("");
                const ansRate =
                  op.calls_total > 0
                    ? (Number(op.calls_answered ?? 0) / Number(op.calls_total)) * 100
                    : null;
                return (
                  <li key={op.user_id}>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-card">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {initials || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{op.full_name}</p>
                        <p className="truncate text-[11px] tabular-nums text-muted-foreground">
                          <PhoneIncoming className="mr-0.5 inline h-3 w-3 align-text-bottom" />
                          {fmtNum(op.calls_inbound)} ·{" "}
                          <PhoneOutgoing className="mr-0.5 inline h-3 w-3 align-text-bottom" />
                          {fmtNum(op.calls_outbound)} · talk {fmtDuration(op.talk_time_seconds)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          {fmtNum(op.calls_total)}
                        </p>
                        <p
                          className={cn(
                            "text-[11px] tabular-nums",
                            ansRate != null && ansRate < 70
                              ? "text-warning"
                              : "text-muted-foreground",
                          )}
                        >
                          {ansRate != null ? `${ansRate.toFixed(0)}% risp` : "—"}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </PullToRefresh>
  );
}

export default MobileCallcenterWallboard;
export { MobileCallcenterWallboard };
