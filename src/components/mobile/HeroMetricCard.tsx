import * as React from 'react';
import { cn } from '@/lib/utils';
import { TrendBadge } from './TrendBadge';

export type HeroVariant = 'neutral' | 'primary' | 'positive' | 'negative';

export interface HeroMetricCardProps {
  /** Label sopra il valore (es. "Fatturato periodo"). */
  label: React.ReactNode;
  /** Valore display (già formattato dal chiamante, es. "€ 124.300"). */
  value: React.ReactNode;
  /** Sottotitolo descrittivo (es. periodo, breakdown). */
  caption?: React.ReactNode;
  /** Delta percentuale opzionale (passa numero, formatta TrendBadge). */
  delta?: number | null;
  /** Inverte semantica del trend (es. costi: down=good). */
  invertTrend?: boolean;
  /** Variante visiva. */
  variant?: HeroVariant;
  /** Slot trailing in alto a destra (icona/badge). */
  trailing?: React.ReactNode;
  /** Slot piede (link, mini-spark, breakdown). */
  footer?: React.ReactNode;
  /** Click su tutta la card (rende `button`). */
  onClick?: () => void;
  /** aria-label override quando interattiva. */
  ariaLabel?: string;
  className?: string;
}

const variantClasses: Record<HeroVariant, string> = {
  neutral: 'bg-card text-foreground border-border/60',
  primary: 'bg-primary text-primary-foreground border-transparent shadow-hero',
  positive: 'bg-success/10 text-foreground border-success/30',
  negative: 'bg-danger/10 text-foreground border-danger/30',
};

/**
 * HeroMetricCard — card "hero" per la metrica principale (mobile).
 * - Numero display 36px, `tabular-nums`, leading-tight, tracking-tight.
 * - Token F0.2 (`bg-card`/`bg-primary`/`success`/`danger`); `shadow-hero` per variante primary.
 * - Nessun fetch: dati via props.
 */
export const HeroMetricCard = React.forwardRef<HTMLElement, HeroMetricCardProps>(
  (
    { label, value, caption, delta, invertTrend, variant = 'neutral', trailing, footer, onClick, ariaLabel, className },
    ref,
  ) => {
    const Tag = onClick ? ('button' as const) : ('div' as const);
    return (
      <Tag
        ref={ref as never}
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        aria-label={onClick ? ariaLabel : undefined}
        className={cn(
          'block w-full text-left rounded-3xl border p-5',
          onClick && 'press-scale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          variantClasses[variant],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              'text-[12px] font-medium uppercase tracking-[0.1em]',
              variant === 'primary' ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            {label}
          </p>
          {trailing && <div className="shrink-0">{trailing}</div>}
        </div>

        <div className="mt-3 flex items-baseline gap-3 flex-wrap">
          <span className="text-[36px] leading-none font-semibold tracking-tight tabular-nums">
            {value}
          </span>
          {delta !== undefined && delta !== null && (
            <TrendBadge value={delta} invert={invertTrend} />
          )}
        </div>

        {caption && (
          <p
            className={cn(
              'mt-2 text-[13px]',
              variant === 'primary' ? 'text-primary-foreground/85' : 'text-muted-foreground',
            )}
          >
            {caption}
          </p>
        )}

        {footer && <div className="mt-4">{footer}</div>}
      </Tag>
    );
  },
);
HeroMetricCard.displayName = 'HeroMetricCard';
