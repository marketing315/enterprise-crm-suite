import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Etichetta sezione mobile in stile "uppercase tracked".
 * Pattern estratto da `MobileCeoDashboard` per riuso nella libreria mobile (SPEC §4).
 * Usa solo token (`text-muted-foreground`) — niente colori hard-coded.
 */
export interface SectionLabelProps {
  children: ReactNode;
  className?: string;
  /** Slot opzionale a destra (es. azione "Vedi tutti"). */
  trailing?: ReactNode;
  /** Override del livello semantico (default h2). */
  as?: 'h2' | 'h3' | 'div';
}

export function SectionLabel({
  children,
  className,
  trailing,
  as: Tag = 'h2',
}: SectionLabelProps) {
  return (
    <div className={cn('flex items-end justify-between px-1 mb-2.5 mt-1', className)}>
      <Tag className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
        {children}
      </Tag>
      {trailing ? <div className="text-[11px] text-muted-foreground">{trailing}</div> : null}
    </div>
  );
}
