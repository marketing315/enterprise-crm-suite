import type { ComponentType, ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Stato vuoto coerente SPEC §6.
 * - Icona opzionale in chip rotondo `bg-muted`
 * - Titolo + descrizione opzionale
 * - Slot `action` per CTA primaria
 * - Centrato verticalmente nello spazio disponibile
 * Usa solo token semantici, niente colori hard-coded.
 */
export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Componente icona (lucide-react o equivalente). Default: Inbox. */
  icon?: ComponentType<{ className?: string }>;
  /** CTA primaria opzionale (es. <Button>...</Button>). */
  action?: ReactNode;
  className?: string;
  /** Aria-label del wrapper (default "Nessun risultato"). */
  ariaLabel?: string;
  /** Variante compatta: meno padding, icona più piccola. */
  compact?: boolean;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  ariaLabel = 'Nessun risultato',
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4 gap-3' : 'py-14 px-6 gap-4',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground',
          compact ? 'h-12 w-12' : 'h-16 w-16',
        )}
        aria-hidden="true"
      >
        <Icon className={compact ? 'h-5 w-5' : 'h-7 w-7'} />
      </div>
      <div className="space-y-1">
        <h3 className={cn('font-semibold tracking-tight text-foreground', compact ? 'text-base' : 'text-lg')}>
          {title}
        </h3>
        {description ? (
          <p className="text-sm text-muted-foreground max-w-[28ch] mx-auto">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
