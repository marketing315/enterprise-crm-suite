import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShieldAlert, ShieldCheck, Shield } from "lucide-react";

interface RiskScoreBadgeProps {
  score: number | null | undefined;
  size?: "sm" | "md";
  showLabel?: boolean;
}

/**
 * Visual badge for appointment risk score (0-100).
 * Thresholds:
 *  - 0-29 → low (green)
 *  - 30-59 → medium (amber)
 *  - 60-100 → high (red)
 */
export function RiskScoreBadge({ score, size = "sm", showLabel = false }: RiskScoreBadgeProps) {
  if (score === null || score === undefined) return null;

  const numScore = Number(score);
  let level: "low" | "medium" | "high";
  let className: string;
  let Icon = Shield;
  let label = "Basso";

  if (numScore >= 60) {
    level = "high";
    className = "bg-destructive/10 text-destructive border-destructive/30";
    Icon = ShieldAlert;
    label = "Alto";
  } else if (numScore >= 30) {
    level = "medium";
    className = "bg-amber-500/10 text-amber-600 border-amber-500/30";
    Icon = Shield;
    label = "Medio";
  } else {
    level = "low";
    className = "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    Icon = ShieldCheck;
    label = "Basso";
  }

  const sizeClasses = size === "sm" ? "text-[10px] px-1.5 py-0 h-4" : "text-xs px-2 py-0.5 h-5";
  const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${sizeClasses} font-medium border ${className} gap-1`}>
            <Icon className={iconSize} />
            {showLabel ? `${label} · ${Math.round(numScore)}` : Math.round(numScore)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium mb-1">Risk score: {Math.round(numScore)}/100 ({label})</p>
          <p className="text-muted-foreground">
            Calcolato da: stato draft, storico no-show, riprogrammazioni, dati di contatto mancanti, assegnazione venditore.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
