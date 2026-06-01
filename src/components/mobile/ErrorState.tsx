import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Stato errore coerente SPEC §6.
 * - Icona warning in chip `bg-danger/10`
 * - Titolo + descrizione (es. errore tecnico)
 * - Pulsante "Riprova" che invalida le query react-query passate (opzionale)
 * - In alternativa, callback custom `onRetry`
 *
 * Se viene passato `invalidateKeys`, il retry usa `queryClient.invalidateQueries({ queryKey })`
 * per ognuna delle chiavi indicate.
 */
export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  /** Chiavi react-query da invalidare al click su "Riprova". */
  invalidateKeys?: QueryKey[];
  /** Callback custom di retry (eseguita dopo l'invalidate, se entrambi presenti). */
  onRetry?: () => void | Promise<void>;
  /** Label del bottone retry (default "Riprova"). */
  retryLabel?: string;
  /** Nasconde il bottone retry. */
  hideRetry?: boolean;
  className?: string;
  /** Variante compatta. */
  compact?: boolean;
  /** Slot extra (es. link supporto). */
  footer?: ReactNode;
}

export function ErrorState({
  title = 'Qualcosa è andato storto',
  description = 'Non siamo riusciti a caricare i dati. Riprova tra qualche istante.',
  invalidateKeys,
  onRetry,
  retryLabel = 'Riprova',
  hideRetry = false,
  className,
  compact = false,
  footer,
}: ErrorStateProps) {
  const queryClient = useQueryClient();

  const handleRetry = useCallback(async () => {
    if (invalidateKeys?.length) {
      await Promise.all(
        invalidateKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    }
    if (onRetry) await onRetry();
  }, [queryClient, invalidateKeys, onRetry]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4 gap-3' : 'py-14 px-6 gap-4',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-danger/10 text-danger',
          compact ? 'h-12 w-12' : 'h-16 w-16',
        )}
        aria-hidden="true"
      >
        <AlertTriangle className={compact ? 'h-5 w-5' : 'h-7 w-7'} />
      </div>
      <div className="space-y-1">
        <h3 className={cn('font-semibold tracking-tight text-foreground', compact ? 'text-base' : 'text-lg')}>
          {title}
        </h3>
        {description ? (
          <p className="text-sm text-muted-foreground max-w-[32ch] mx-auto">{description}</p>
        ) : null}
      </div>
      {!hideRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRetry}
          className="press-scale gap-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {retryLabel}
        </Button>
      ) : null}
      {footer ? <div className="pt-1 text-xs text-muted-foreground">{footer}</div> : null}
    </div>
  );
}
