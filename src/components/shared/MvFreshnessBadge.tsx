/**
 * F5: badge "Aggiornato Xm fa" per dashboards basate su MV.
 */
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, AlertTriangle } from "lucide-react";
import { usePerformanceMvFreshness } from "@/hooks/usePerformanceMvFreshness";

function fmtAge(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}g`;
}

export function MvFreshnessBadge({ mvName }: { mvName: string }) {
  const { data, isLoading } = usePerformanceMvFreshness();
  if (isLoading || !data) return null;
  const row = data.find((r) => r.mv_name === mvName);
  if (!row) return null;

  const stale = row.age_seconds > 30 * 60; // >30min
  const err = !!row.last_error;
  const variant = err ? "destructive" : stale ? "outline" : "secondary";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={variant} className="gap-1 font-normal">
          {err ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          Aggiornato {fmtAge(row.age_seconds)} fa
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs space-y-0.5">
          <div>MV: <code>{row.mv_name}</code></div>
          <div>Refresh: {new Date(row.last_refreshed_at).toLocaleString("it-IT")}</div>
          {row.last_duration_ms != null && <div>Durata: {row.last_duration_ms}ms</div>}
          {row.last_rows != null && <div>Righe: {row.last_rows.toLocaleString("it-IT")}</div>}
          {err && <div className="text-destructive">Errore: {row.last_error}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
