import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, TrendingDown, Megaphone, Users, CalendarCheck, Trophy, Banknote } from "lucide-react";
import type { FunnelOverviewStage } from "@/hooks/useFunnelOverview";

interface Props {
  stages: FunnelOverviewStage[] | undefined;
  isLoading: boolean;
}

const STAGE_VISUAL: Record<string, { icon: typeof Megaphone; color: string; bg: string }> = {
  spend:       { icon: Banknote,      color: "text-violet-600 dark:text-violet-400",   bg: "bg-violet-100/60 dark:bg-violet-900/30" },
  lead:        { icon: Users,         color: "text-cyan-600 dark:text-cyan-400",       bg: "bg-cyan-100/60 dark:bg-cyan-900/30" },
  appointment: { icon: CalendarCheck, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100/60 dark:bg-emerald-900/30" },
  deal_won:    { icon: Trophy,        color: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-100/60 dark:bg-amber-900/30" },
  revenue:     { icon: Banknote,      color: "text-green-600 dark:text-green-400",     bg: "bg-green-100/60 dark:bg-green-900/30" },
};

function fmtNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toLocaleString("it-IT");
}
function fmtMoney(v: number): string {
  return `€${fmtNum(v)}`;
}

export function FunnelCrossStage({ stages, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funnel End-to-End</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-32 flex-1 rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stages || stages.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funnel End-to-End</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            Nessun dato per il periodo selezionato.
          </p>
        </CardContent>
      </Card>
    );
  }

  const ordered = [...stages].sort((a, b) => a.stage_order - b.stage_order);
  // For relative bar height we use a normalized scale: spend & revenue (money) vs counts.
  // Use independent scales: max within count stages and max within money stages.
  const moneyMax = Math.max(...ordered.filter(s => s.stage_id === "spend" || s.stage_id === "revenue").map(s => s.metric_value), 1);
  const countMax = Math.max(...ordered.filter(s => s.stage_id !== "spend" && s.stage_id !== "revenue").map(s => Number(s.metric_count)), 1);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Funnel End-to-End</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Desktop: horizontal */}
        <div className="hidden md:flex items-end justify-between gap-2">
          {ordered.map((stage, i) => {
            const v = STAGE_VISUAL[stage.stage_id] ?? STAGE_VISUAL.lead;
            const Icon = v.icon;
            const isMoney = stage.stage_id === "spend" || stage.stage_id === "revenue";
            const denom = isMoney ? moneyMax : countMax;
            const numeric = isMoney ? Number(stage.metric_value) : Number(stage.metric_count);
            const h = Math.max(28, (numeric / denom) * 140);
            const display = isMoney ? fmtMoney(numeric) : fmtNum(numeric);
            const conv = stage.conversion_from_prev;
            const drop = stage.drop_off_pct;

            return (
              <div key={stage.stage_id} className="flex items-end gap-2 flex-1">
                {i > 0 && (
                  <div className="flex flex-col items-center gap-0.5 pb-12">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    {conv != null && (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        {conv.toFixed(1)}%
                      </span>
                    )}
                    {drop != null && drop > 0 && (
                      <span className="text-[10px] text-rose-500 dark:text-rose-400 flex items-center gap-0.5">
                        <TrendingDown className="h-3 w-3" />
                        {drop.toFixed(1)}%
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-col items-center gap-1.5 flex-1 min-w-[88px]">
                  <div className={`w-full rounded-t-lg ${v.bg} transition-all duration-500`} style={{ height: `${h}px` }} />
                  <span className={`text-base font-bold ${v.color}`}>{display}</span>
                  <div className="flex items-center gap-1">
                    <Icon className={`h-3.5 w-3.5 ${v.color}`} />
                    <span className="text-xs text-muted-foreground">{stage.stage_label}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile: vertical */}
        <div className="md:hidden space-y-3">
          {ordered.map((stage, i) => {
            const v = STAGE_VISUAL[stage.stage_id] ?? STAGE_VISUAL.lead;
            const Icon = v.icon;
            const isMoney = stage.stage_id === "spend" || stage.stage_id === "revenue";
            const denom = isMoney ? moneyMax : countMax;
            const numeric = isMoney ? Number(stage.metric_value) : Number(stage.metric_count);
            const w = Math.max(8, (numeric / denom) * 100);
            const display = isMoney ? fmtMoney(numeric) : fmtNum(numeric);
            const conv = stage.conversion_from_prev;
            return (
              <div key={stage.stage_id}>
                {i > 0 && conv != null && (
                  <div className="ml-7 mb-1 flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 text-muted-foreground rotate-90" />
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      {conv.toFixed(1)}%
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${v.bg}`}>
                    <Icon className={`h-4 w-4 ${v.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-muted-foreground">{stage.stage_label}</span>
                      <span className={`text-sm font-bold ${v.color}`}>{display}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${v.bg} transition-all duration-500`} style={{ width: `${w}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
