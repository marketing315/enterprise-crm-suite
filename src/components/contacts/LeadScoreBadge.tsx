import { Flame, Snowflake, ThermometerSun, RefreshCw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLeadScore, useCalculateLeadScore } from "@/hooks/useLeadScore";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface LeadScoreBadgeProps {
  contactId: string;
  compact?: boolean;
  showRecalculate?: boolean;
}

const heatConfig = {
  caldo: {
    icon: Flame,
    label: "Caldo",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-700",
  },
  tiepido: {
    icon: ThermometerSun,
    label: "Tiepido",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700",
  },
  freddo: {
    icon: Snowflake,
    label: "Freddo",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-700",
  },
};

export function LeadScoreBadge({
  contactId,
  compact = false,
  showRecalculate = true,
}: LeadScoreBadgeProps) {
  const { data: score, isLoading } = useLeadScore(contactId);
  const calculateScore = useCalculateLeadScore();

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Score...
      </Badge>
    );
  }

  // No score yet — show calculate button
  if (!score) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-7 text-xs"
        onClick={() => calculateScore.mutate({ contactId })}
        disabled={calculateScore.isPending}
      >
        {calculateScore.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
        Calcola Score
      </Button>
    );
  }

  const config = heatConfig[score.heat_class];
  const Icon = config.icon;

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("gap-1 text-xs cursor-help", config.badgeClass)}>
            <Icon className="h-3 w-3" />
            {score.score}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <ScoreTooltipContent score={score} config={config} />
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn("rounded-lg border p-3 space-y-2", config.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-5 w-5", config.color)} />
          <div>
            <span className={cn("text-lg font-bold", config.color)}>
              {score.score}
            </span>
            <span className="text-xs text-muted-foreground ml-1">/ 100</span>
          </div>
          <Badge variant="outline" className={cn("text-xs", config.badgeClass)}>
            {config.label}
          </Badge>
        </div>
        {showRecalculate && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => calculateScore.mutate({ contactId })}
            disabled={calculateScore.isPending}
            title="Ricalcola score"
           aria-label="Caricamento">
            {calculateScore.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>

      {/* Drivers */}
      {score.positive_drivers.length > 0 && (
        <div className="space-y-0.5">
          {score.positive_drivers.map((d, i) => (
            <p key={i} className="text-xs text-green-700 dark:text-green-400">
              ✅ {d}
            </p>
          ))}
        </div>
      )}

      {score.negative_drivers.length > 0 && (
        <div className="space-y-0.5">
          {score.negative_drivers.map((d, i) => (
            <p key={i} className="text-xs text-red-700 dark:text-red-400">
              ⚠️ {d}
            </p>
          ))}
        </div>
      )}

      {/* Next action */}
      {score.next_best_action && (
        <p className="text-xs font-medium text-foreground/80 mt-1">
          💡 {score.next_best_action}
        </p>
      )}

      {/* Timestamp */}
      <p className="text-[10px] text-muted-foreground">
        Aggiornato{" "}
        {formatDistanceToNow(new Date(score.computed_at), {
          addSuffix: true,
          locale: it,
        })}
      </p>
    </div>
  );
}

function ScoreTooltipContent({
  score,
  config,
}: {
  score: NonNullable<ReturnType<typeof useLeadScore>["data"]>;
  config: (typeof heatConfig)[keyof typeof heatConfig];
}) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-1.5 font-semibold">
        <config.icon className={cn("h-3.5 w-3.5", config.color)} />
        Score: {score.score}/100 — {config.label}
      </div>
      {score.positive_drivers.map((d, i) => (
        <p key={`p-${i}`} className="text-green-600 dark:text-green-400">✅ {d}</p>
      ))}
      {score.negative_drivers.map((d, i) => (
        <p key={`n-${i}`} className="text-red-600 dark:text-red-400">⚠️ {d}</p>
      ))}
      {score.next_best_action && (
        <p className="font-medium">💡 {score.next_best_action}</p>
      )}
    </div>
  );
}
