import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TrendBadge } from './TrendBadge';

export type MetricTone = 'neutral' | 'positive' | 'negative' | 'warning';

export interface MetricRowProps {
  /** Titolo della metrica (es. "Margine Lordo"). */
  title: React.ReactNode;
  /** Valore già formattato (es. "€ 12.300", "24%"). */
  value: React.ReactNode;
  /** Sottotitolo opzionale (breakdown/contesto). */
  subtitle?: React.ReactNode;
  /** Delta % opzionale. */
  delta?: number | null;
  /** Inverte semantica del trend (es. costi: down=good). */
  invertTrend?: boolean;
  /** Icona leading (lucide). */
  icon?: React.ReactNode;
  /** Tono valore (colora il numero). */
  tone?: MetricTone;
  /** Click → trasforma in button con chevron. */
  onClick?: () => void;
  /** aria-label override quando interattiva. */
  ariaLabel?: string;
  className?: string;
}

const toneClasses: Record<MetricTone, string> = {
  neutral: 'text-foreground',
  positive: 'text-success',
  negative: 'text-danger',
  warning: 'text-warning',
};

/**
 * MetricRow — riga KPI secondaria (card compatta).
 * Token F0.2 (card/border/muted), tabular-nums, press-scale quando interattiva.
 */
export const MetricRow = React.forwardRef<HTMLElement, MetricRowProps>(
  ({ title, value, subtitle, delta, invertTrend, icon, tone = 'neutral', onClick, ariaLabel, className }, ref) => {
    const Tag = onClick ? ('button' as const) : ('div' as const);
    return (
      <Tag
        ref={ref as never}
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        aria-label={onClick ? ariaLabel : undefined}
        className={cn(
          'w-full text-left rounded-2xl border border-border/60 bg-card p-4 shadow-card',
          onClick &&
            'press-scale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                {icon}
              </div>
            )}
            <p className="truncate text-[13px] font-medium text-muted-foreground">{title}</p>
          </div>
          {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />}
        </div>

        <div className="mt-3 flex items-baseline gap-2 flex-wrap">
          <span className={cn('text-[24px] leading-none font-semibold tracking-tight tabular-nums', toneClasses[tone])}>
            {value}
          </span>
          {delta !== undefined && delta !== null && <TrendBadge deltaPct={delta} intent={invertTrend ? 'inverse' : 'default'} compact />}
        </div>

        {subtitle && <p className="mt-1.5 text-[12px] text-muted-foreground">{subtitle}</p>}
      </Tag>
    );
  },
);
MetricRow.displayName = 'MetricRow';

export interface KpiListProps {
  children: React.ReactNode;
  /** Spaziatura tra righe (default `gap-2.5`). */
  gap?: 'tight' | 'normal' | 'loose';
  className?: string;
  /** aria-label per il container (default "Indicatori"). */
  ariaLabel?: string;
}

const gapMap: Record<NonNullable<KpiListProps['gap']>, string> = {
  tight: 'space-y-2',
  normal: 'space-y-2.5',
  loose: 'space-y-3',
};

/** KpiList — contenitore verticale standard per `MetricRow`. */
export const KpiList = ({ children, gap = 'normal', className, ariaLabel = 'Indicatori' }: KpiListProps) => (
  <div role="list" aria-label={ariaLabel} className={cn(gapMap[gap], className)}>
    {React.Children.map(children, (child, i) =>
      React.isValidElement(child) ? <div role="listitem" key={i}>{child}</div> : child,
    )}
  </div>
);
KpiList.displayName = 'KpiList';
