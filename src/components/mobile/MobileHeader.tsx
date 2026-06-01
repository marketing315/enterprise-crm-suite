import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Header mobile sticky compatto (SPEC §3.3).
 * - Titolo + sottotitolo (es. brand) a sinistra
 * - UNA sola azione contestuale a destra (filtri, periodo, AI…)
 * - `backdrop-blur` + safe-area top
 *
 * Riusabile su qualsiasi schermo mobile. Nessun colore hard-coded.
 */
export interface MobileHeaderProps {
  title: ReactNode;
  /** Sottotitolo: spesso il brand corrente o un contesto. */
  subtitle?: ReactNode;
  /** Singola azione contestuale (icon-button consigliato). */
  action?: ReactNode;
  /** Tap sul sottotitolo (es. apre brand selector). */
  onSubtitleClick?: () => void;
  className?: string;
  /** Disattiva sticky (per casi rari). */
  nonSticky?: boolean;
}

export function MobileHeader({
  title,
  subtitle,
  action,
  onSubtitleClick,
  className,
  nonSticky = false,
}: MobileHeaderProps) {
  return (
    <header
      className={cn(
        'z-40 bg-background/85 backdrop-blur-xl border-b border-border/40',
        'pt-safe px-4',
        !nonSticky && 'sticky top-0',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 py-3 min-h-[44px]">
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-semibold tracking-tight text-foreground truncate">
            {title}
          </h1>
          {subtitle ? (
            onSubtitleClick ? (
              <button
                type="button"
                onClick={onSubtitleClick}
                className="text-xs text-muted-foreground truncate max-w-full text-left hover:text-foreground transition-colors press-scale"
                data-touch-target="primary"
              >
                {subtitle}
              </button>
            ) : (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )
          ) : null}
        </div>
        {action ? <div className="flex-shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
