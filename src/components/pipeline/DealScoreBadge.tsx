import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import type { DealRiskLevel, DealScoreFactor } from "@/types/predictive";

interface DealScoreBadgeProps {
  score: number | null;
  riskLevel: DealRiskLevel | null;
  factors?: DealScoreFactor[];
  size?: "sm" | "md" | "lg";
  showFactors?: boolean;
}

const riskConfig: Record<DealRiskLevel, { 
  color: string; 
  bg: string; 
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = {
  low: { 
    color: "text-green-700", 
    bg: "bg-green-100", 
    icon: CheckCircle,
    label: "Basso rischio"
  },
  medium: { 
    color: "text-yellow-700", 
    bg: "bg-yellow-100", 
    icon: Minus,
    label: "Rischio medio"
  },
  high: { 
    color: "text-orange-700", 
    bg: "bg-orange-100", 
    icon: AlertCircle,
    label: "Alto rischio"
  },
  critical: { 
    color: "text-red-700", 
    bg: "bg-red-100", 
    icon: XCircle,
    label: "Rischio critico"
  },
};

const sizeConfig = {
  sm: "text-xs px-1.5 py-0.5",
  md: "text-sm px-2 py-1",
  lg: "text-base px-3 py-1.5",
};

export function DealScoreBadge({ 
  score, 
  riskLevel, 
  factors = [],
  size = "sm",
  showFactors = true,
}: DealScoreBadgeProps) {
  if (score === null || riskLevel === null) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        "bg-muted text-muted-foreground",
        sizeConfig[size]
      )}>
        <Minus className="h-3 w-3" />
        <span>--</span>
      </span>
    );
  }

  const config = riskConfig[riskLevel];
  const Icon = config.icon;

  const badge = (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full font-medium",
      config.bg,
      config.color,
      sizeConfig[size]
    )}>
      <Icon className={cn("h-3 w-3", size === "lg" && "h-4 w-4")} />
      <span>{score}</span>
    </span>
  );

  if (!showFactors || factors.length === 0) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-2">
            <div className="font-medium flex items-center gap-2">
              <Icon className={cn("h-4 w-4", config.color)} />
              {config.label} (Score: {score})
            </div>
            <div className="space-y-1">
              {factors.map((factor, idx) => (
                <div key={idx} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{factor.detail}</span>
                  <span className={cn(
                    "font-medium",
                    factor.impact > 0 ? "text-green-600" : factor.impact < 0 ? "text-red-600" : "text-muted-foreground"
                  )}>
                    {factor.impact > 0 ? "+" : ""}{factor.impact}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Compact version for Kanban cards
export function DealScoreIndicator({ 
  score, 
  riskLevel 
}: { 
  score: number | null; 
  riskLevel: DealRiskLevel | null;
}) {
  if (score === null || riskLevel === null) return null;

  const config = riskConfig[riskLevel];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "w-5 h-5 rounded-full flex items-center justify-center",
            config.bg
          )}>
            <Icon className={cn("h-3 w-3", config.color)} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <span>Score: {score} - {config.label}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
