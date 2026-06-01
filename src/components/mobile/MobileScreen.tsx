import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Scaffold schermo mobile (SPEC §3.1).
 * - `header` slot: tipicamente `<MobileHeader />`, sticky in alto
 * - `children`: area scroll verticale, padding orizzontale standard 16px (`px-4`)
 * - `footer` slot: contenuto fisso in basso (es. bottom action bar), safe-area
 * - Animazione d'ingresso `slide-up-fade` (rispetta `prefers-reduced-motion`)
 *
 * Non monta provider né router: è puro layout.
 * Usato SOLO sotto `useIsMobile()` — il desktop continua a usare `MainLayout`.
 */
export interface MobileScreenProps {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Padding orizzontale del contenuto (default `px-4`). Passa `''` per disattivarlo. */
  contentPadding?: string;
  /** Spazio verticale tra le sezioni nel body (default `space-y-5`). */
  contentSpacing?: string;
  /** Disattiva l'animazione d'ingresso. */
  noEntryAnimation?: boolean;
  /** Tag semantico del wrapper (default `div`). */
  as?: 'div' | 'section' | 'main';
}

export function MobileScreen({
  header,
  footer,
  children,
  className,
  contentPadding = 'px-4',
  contentSpacing = 'space-y-5',
  noEntryAnimation = false,
  as: Tag = 'div',
}: MobileScreenProps) {
  return (
    <Tag
      className={cn(
        'flex min-h-[100dvh] flex-col bg-background text-foreground',
        className,
      )}
    >
      {header}
      <main
        className={cn(
          'flex-1 overflow-y-auto',
          contentPadding,
          'py-4',
          contentSpacing,
          !noEntryAnimation && 'animate-slide-up-fade',
        )}
        // Evita "rubber band" che mostra il bg dietro su iOS quando il body scrolla
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </main>
      {footer ? (
        <div className="pb-safe sticky bottom-0 bg-background/85 backdrop-blur-xl border-t border-border/40">
          {footer}
        </div>
      ) : null}
    </Tag>
  );
}
