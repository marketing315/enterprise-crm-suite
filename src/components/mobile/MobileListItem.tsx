import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export interface MobileListItemAction {
  /** ID univoco (key + analytics). */
  id: string;
  /** Etichetta visibile (italiana). */
  label: string;
  /** Icona (lucide). */
  icon?: React.ReactNode;
  /** Variante visiva. `destructive` triggera conferma se `confirm` presente. */
  variant?: 'neutral' | 'primary' | 'destructive';
  /** Se valorizzato, mostra AlertDialog di conferma prima di eseguire `onSelect`. */
  confirm?: {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  };
  /** Handler invocato dopo eventuale conferma. */
  onSelect: () => void;
  /** aria-label override (default: label). */
  ariaLabel?: string;
}

export interface MobileListItemProps {
  /** Slot leading (avatar, icona, badge). */
  leading?: React.ReactNode;
  /** Titolo principale. */
  title: React.ReactNode;
  /** Sottotitolo opzionale. */
  subtitle?: React.ReactNode;
  /** Slot trailing (badge, prezzo, timestamp). */
  trailing?: React.ReactNode;
  /** Mostra chevron a destra (default: true se onSelect). */
  showChevron?: boolean;
  /** Tap principale. */
  onSelect?: () => void;
  /** aria-label del bottone principale (default: title se string). */
  ariaLabel?: string;
  /** Azioni swipe (max 2). Sempre accessibili da tastiera/SR. */
  actions?: ReadonlyArray<MobileListItemAction>;
  className?: string;
}

/** Larghezza di una action (px). */
const ACTION_W = 80;
/** Soglia in px oltre la quale il gesto è considerato uno swipe (non un tap). */
const SWIPE_THRESHOLD = 8;
/** Soglia di apertura: oltre, snap a aperto al rilascio. */
const OPEN_RATIO = 0.4;

const actionVariantClasses: Record<NonNullable<MobileListItemAction['variant']>, string> = {
  neutral: 'bg-muted text-foreground',
  primary: 'bg-primary text-primary-foreground',
  destructive: 'bg-danger text-danger-foreground',
};

/**
 * MobileListItem — riga lista premium con swipe actions opzionali.
 * - Tap principale ≥44px, chevron auto su `onSelect`.
 * - Azioni: 1–2, montate sempre come `<button>` nascoste a destra; rivelate via swipe orizzontale.
 *   Sono accessibili da tastiera (Tab) e screen reader anche senza gesture: il focus su un'action
 *   apre la riga automaticamente per visibilità.
 * - Distruttivo: se `action.variant === 'destructive'` e `action.confirm` presente → AlertDialog di conferma.
 * - Gesture: pointer events, soglia 8px per distinguere swipe da tap; snap aperto/chiuso al rilascio.
 * - Rispetta `prefers-reduced-motion` via classe utility F0.3 (transizione `transition-screen` ≤ 250ms).
 */
export const MobileListItem = React.forwardRef<HTMLDivElement, MobileListItemProps>(
  ({ leading, title, subtitle, trailing, showChevron, onSelect, ariaLabel, actions, className }, ref) => {
    const safeActions = (actions ?? []).slice(0, 2);
    const actionsWidth = safeActions.length * ACTION_W;

    const [open, setOpen] = React.useState(false);
    const [dragging, setDragging] = React.useState(false);
    const [dx, setDx] = React.useState(0);
    const startX = React.useRef<number | null>(null);
    const movedRef = React.useRef(false);
    const startTime = React.useRef<number>(0);

    // Conferma distruttiva
    const [pendingConfirm, setPendingConfirm] = React.useState<MobileListItemAction | null>(null);

    const reset = React.useCallback(() => {
      setDx(0);
      setOpen(false);
      setDragging(false);
      startX.current = null;
      movedRef.current = false;
    }, []);

    const onPointerDown = (e: React.PointerEvent) => {
      if (!safeActions.length) return;
      startX.current = e.clientX;
      startTime.current = Date.now();
      movedRef.current = false;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
      if (startX.current == null || !safeActions.length) return;
      const delta = e.clientX - startX.current;
      // Solo swipe a sinistra (azioni a destra)
      const next = Math.max(-actionsWidth - 16, Math.min(0, open ? -actionsWidth + delta : delta));
      if (Math.abs(delta) > SWIPE_THRESHOLD) movedRef.current = true;
      setDx(next);
    };

    const onPointerUp = () => {
      if (!safeActions.length) {
        setDragging(false);
        return;
      }
      const shouldOpen = Math.abs(dx) > actionsWidth * OPEN_RATIO;
      setOpen(shouldOpen);
      setDx(shouldOpen ? -actionsWidth : 0);
      setDragging(false);
      startX.current = null;
    };

    const handleMainTap = () => {
      if (movedRef.current) {
        movedRef.current = false;
        return;
      }
      if (open) {
        setOpen(false);
        setDx(0);
        return;
      }
      onSelect?.();
    };

    const handleActionClick = (a: MobileListItemAction) => {
      if (a.variant === 'destructive' && a.confirm) {
        setPendingConfirm(a);
        return;
      }
      a.onSelect();
      reset();
    };

    const titleAria = ariaLabel ?? (typeof title === 'string' ? title : undefined);
    const interactive = !!onSelect;
    const chev = showChevron ?? interactive;

    return (
      <div
        ref={ref}
        className={cn('relative overflow-hidden rounded-2xl bg-card', className)}
      >
        {/* Action layer (sotto, sempre montato per a11y) */}
        {safeActions.length > 0 && (
          <div
            className="absolute inset-y-0 right-0 flex items-stretch"
            aria-hidden={!open && dx === 0 ? 'true' : 'false'}
            style={{ width: actionsWidth }}
          >
            {safeActions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => handleActionClick(a)}
                onFocus={() => {
                  // Apri al focus tastiera per visibilità
                  setOpen(true);
                  setDx(-actionsWidth);
                }}
                aria-label={a.ariaLabel ?? a.label}
                className={cn(
                  'flex h-full flex-1 flex-col items-center justify-center gap-1 text-[12px] font-medium',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  actionVariantClasses[a.variant ?? 'neutral'],
                )}
                style={{ width: ACTION_W }}
              >
                {a.icon && (
                  <span aria-hidden className="inline-flex">
                    {a.icon}
                  </span>
                )}
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Riga principale (sopra) */}
        <div
          role={interactive ? 'button' : undefined}
          tabIndex={interactive ? 0 : undefined}
          aria-label={interactive ? titleAria : undefined}
          onClick={interactive || safeActions.length > 0 ? handleMainTap : undefined}
          onKeyDown={(e) => {
            if (!interactive) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleMainTap();
            } else if (e.key === 'Escape' && open) {
              reset();
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn(
            'relative flex min-h-[64px] items-center gap-3 bg-card px-4 py-3 touch-pan-y select-none',
            'border border-border/60 rounded-2xl shadow-card',
            interactive &&
              'press-scale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            !dragging && 'transition-transform duration-screen ease-out-soft',
          )}
          style={{ transform: `translate3d(${dx}px,0,0)` }}
        >
          {leading && <div className="shrink-0">{leading}</div>}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-foreground">{title}</div>
            {subtitle && (
              <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{subtitle}</div>
            )}
          </div>
          {trailing && <div className="shrink-0">{trailing}</div>}
          {chev && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />}
        </div>

        {/* Conferma distruttiva */}
        {pendingConfirm && (
          <AlertDialog
            open
            onOpenChange={(o) => {
              if (!o) setPendingConfirm(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{pendingConfirm.confirm!.title}</AlertDialogTitle>
                {pendingConfirm.confirm!.description && (
                  <AlertDialogDescription>{pendingConfirm.confirm!.description}</AlertDialogDescription>
                )}
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {pendingConfirm.confirm!.cancelLabel ?? 'Annulla'}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-danger text-danger-foreground hover:bg-danger/90"
                  onClick={() => {
                    const a = pendingConfirm;
                    setPendingConfirm(null);
                    a.onSelect();
                    reset();
                  }}
                >
                  {pendingConfirm.confirm!.confirmLabel ?? 'Conferma'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    );
  },
);
MobileListItem.displayName = 'MobileListItem';
