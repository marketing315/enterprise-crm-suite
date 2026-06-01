import { cn } from '@/lib/utils';

/**
 * Skeleton mobili coerenti con la libreria SPEC §6.
 * Tutte le superfici usano `bg-muted/60` + `animate-pulse` (disattivato da
 * `prefers-reduced-motion`). Le dimensioni rispecchiano quelle dei componenti
 * reali (HeroMetricCard, MetricRow, MobileListItem) per evitare layout shift.
 */

function Bone({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-md bg-muted/60 motion-safe:animate-pulse', className)}
    />
  );
}

export interface SkeletonContainerProps {
  className?: string;
  /** Etichetta per screen reader (default "Caricamento in corso"). */
  ariaLabel?: string;
}

/** Skeleton per `HeroMetricCard`. */
export function HeroMetricSkeleton({ className, ariaLabel = 'Caricamento metrica' }: SkeletonContainerProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      className={cn('rounded-3xl bg-card border border-border/60 p-5 space-y-4 shadow-card', className)}
    >
      <div className="flex items-start justify-between">
        <Bone className="h-3 w-24" />
        <Bone className="h-6 w-16 rounded-full" />
      </div>
      <Bone className="h-9 w-40" />
      <Bone className="h-3 w-32" />
    </div>
  );
}

/** Skeleton per `MetricRow`. */
export function MetricRowSkeleton({ className, ariaLabel = 'Caricamento indicatore' }: SkeletonContainerProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      className={cn('rounded-2xl bg-card border border-border/60 p-4 flex items-center gap-3 shadow-card', className)}
    >
      <Bone className="h-8 w-8 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Bone className="h-3 w-24" />
        <Bone className="h-5 w-16" />
      </div>
      <Bone className="h-5 w-12 rounded-full" />
    </div>
  );
}

export interface KpiListSkeletonProps extends SkeletonContainerProps {
  /** Numero di righe (default 3). */
  count?: number;
}

/** Skeleton per `KpiList` (n righe MetricRow). */
export function KpiListSkeleton({ count = 3, className, ariaLabel = 'Caricamento indicatori' }: KpiListSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      className={cn('space-y-2.5', className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <MetricRowSkeleton key={i} ariaLabel="" />
      ))}
    </div>
  );
}

/** Skeleton per riga di `MobileListItem`. */
export function ListItemSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', className)} aria-hidden="true">
      <Bone className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Bone className="h-4 w-3/5" />
        <Bone className="h-3 w-2/5" />
      </div>
      <Bone className="h-4 w-12" />
    </div>
  );
}

export interface ListSkeletonProps extends SkeletonContainerProps {
  count?: number;
}

/** Skeleton per lista di `MobileListItem`. */
export function MobileListSkeleton({ count = 5, className, ariaLabel = 'Caricamento elenco' }: ListSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      className={cn('divide-y divide-border/40 rounded-2xl bg-card border border-border/60 overflow-hidden', className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
  );
}
