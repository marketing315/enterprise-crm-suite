import * as React from 'react';
import { cn } from '@/lib/utils';

export interface MobileFabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icona (lucide o custom). Obbligatoria per affordance. */
  icon: React.ReactNode;
  /** Label accessibile (aria-label). */
  label: string;
  /** Etichetta testuale opzionale accanto all'icona (FAB esteso). */
  extendedLabel?: React.ReactNode;
  /** Variante visiva. */
  variant?: 'primary' | 'neutral';
  /** Posizione: default in basso a destra sopra la tab bar, con safe-area. */
  position?: 'bottom-right' | 'bottom-center' | 'inline';
}

const variants: Record<NonNullable<MobileFabProps['variant']>, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  neutral: 'bg-card text-foreground border border-border/60 hover:bg-muted',
};

const positions: Record<NonNullable<MobileFabProps['position']>, string> = {
  // 64px ≈ MobileTabBar height + margine; mb-safe per safe-area home indicator
  'bottom-right': 'fixed right-4 bottom-[calc(64px+env(safe-area-inset-bottom,0px)+12px)] z-40',
  'bottom-center': 'fixed left-1/2 -translate-x-1/2 bottom-[calc(64px+env(safe-area-inset-bottom,0px)+12px)] z-40',
  inline: '',
};

/**
 * MobileFab — Floating Action Button in thumb zone.
 * - Min target 44×44 (AC F1.3).
 * - press-scale (F0.3) + shadow-fab (F0.3).
 * - Safe-area aware (home indicator iOS).
 */
export const MobileFab = React.forwardRef<HTMLButtonElement, MobileFabProps>(
  (
    {
      icon,
      label,
      extendedLabel,
      variant = 'primary',
      position = 'bottom-right',
      className,
      type = 'button',
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          'press-scale inline-flex items-center justify-center gap-2 rounded-full shadow-fab transition-colors',
          'min-h-[44px] min-w-[44px]',
          extendedLabel ? 'px-5 py-3 text-sm font-semibold' : 'h-14 w-14',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          positions[position],
          className,
        )}
        {...rest}
      >
        <span aria-hidden className="inline-flex items-center justify-center">
          {icon}
        </span>
        {extendedLabel && <span>{extendedLabel}</span>}
      </button>
    );
  },
);

MobileFab.displayName = 'MobileFab';
