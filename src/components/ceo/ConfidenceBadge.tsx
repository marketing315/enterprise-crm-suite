import { HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ConfidenceLevel } from '@/types/company';

interface ConfidenceBadgeProps {
  value: number;
  showDetails?: boolean;
  factors?: ConfidenceLevel['factors'];
}

export function ConfidenceBadge({ value, showDetails = false, factors }: ConfidenceBadgeProps) {
  const percentage = Math.round(value * 100);
  
  const getVariant = () => {
    if (percentage >= 80) return 'success';
    if (percentage >= 50) return 'warning';
    return 'low';
  };
  
  const getLabel = () => {
    if (percentage >= 80) return 'Alta affidabilità';
    if (percentage >= 50) return 'Media affidabilità';
    return 'Bassa affidabilità';
  };
  
  const variant = getVariant();
  
  const colorClasses = {
    success: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
    low: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  };

  const badge = (
    <Badge 
      variant="outline" 
      className={`${colorClasses[variant]} text-xs font-medium`}
    >
      {percentage}% {showDetails && `- ${getLabel()}`}
    </Badge>
  );

  if (!factors || factors.length === 0) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-help">
          {badge}
          <HelpCircle className="h-3 w-3 text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-2">
          <p className="font-medium text-sm">{getLabel()}</p>
          <ul className="text-xs space-y-1">
            {factors.map((factor, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{factor.detail}</span>
                <span className="font-medium">{Math.round(factor.value * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
