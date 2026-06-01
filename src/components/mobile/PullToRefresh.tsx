import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { RefreshCw } from 'lucide-react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

/**
 * Pull-to-refresh mobile (SPEC §6).
 * - Si attiva SOLO quando lo scroll interno è in cima (`scrollTop <= 0`).
 * - Trascina giù finché si supera la soglia (`threshold`, default 64px) per attivare il refresh.
 * - Al rilascio: invalida le `invalidateKeys` react-query e/o invoca `onRefresh`.
 * - Animazione disattivata se `prefers-reduced-motion: reduce`.
 * - `touch-pan-y` preservato fuori dal gesto verticale di pull.
 */
export interface PullToRefreshProps {
  children: ReactNode;
  /** Chiavi react-query da invalidare al refresh. */
  invalidateKeys?: QueryKey[];
  /** Callback custom (eseguita dopo l'invalidate). */
  onRefresh?: () => void | Promise<void>;
  /** Soglia in pixel per attivare il refresh (default 64). */
  threshold?: number;
  /** Distanza massima trascinabile (default 96). */
  maxPull?: number;
  /** Disabilita il gesto. */
  disabled?: boolean;
  className?: string;
}

type Phase = 'idle' | 'pulling' | 'refreshing';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PullToRefresh({
  children,
  invalidateKeys,
  onRefresh,
  threshold = 64,
  maxPull = 96,
  disabled = false,
  className,
}: PullToRefreshProps) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const pointerId = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const reduced = useRef<boolean>(false);

  useEffect(() => {
    reduced.current = prefersReducedMotion();
  }, []);

  const runRefresh = useCallback(async () => {
    setPhase('refreshing');
    try {
      if (invalidateKeys?.length) {
        await Promise.all(
          invalidateKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        );
      }
      if (onRefresh) await onRefresh();
    } finally {
      setPhase('idle');
      setPull(0);
    }
  }, [queryClient, invalidateKeys, onRefresh]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || phase === 'refreshing') return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    if (e.pointerType === 'mouse') return; // gesto solo touch/pen
    startY.current = e.clientY;
    pointerId.current = e.pointerId;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (startY.current == null || pointerId.current !== e.pointerId) return;
    const dy = e.clientY - startY.current;
    if (dy <= 0) {
      if (phase === 'pulling') {
        setPhase('idle');
        setPull(0);
      }
      return;
    }
    // resistance curve
    const eased = Math.min(maxPull, dy * 0.55);
    setPull(eased);
    if (phase !== 'pulling') setPhase('pulling');
  };

  const endGesture = () => {
    startY.current = null;
    pointerId.current = null;
    if (phase === 'pulling') {
      if (pull >= threshold) {
        void runRefresh();
      } else {
        setPhase('idle');
        setPull(0);
      }
    }
  };

  const indicatorSize = Math.min(pull, maxPull);
  const ready = pull >= threshold;
  const showIndicator = phase !== 'idle' || pull > 0;
  const translate = phase === 'refreshing' ? threshold : indicatorSize;
  const useTransition = phase !== 'pulling' && !reduced.current;

  return (
    <div className={cn('relative h-full', className)}>
      {showIndicator ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center"
          style={{ height: Math.max(translate, 0) }}
          aria-hidden="true"
        >
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-card',
              ready || phase === 'refreshing' ? 'text-primary' : '',
            )}
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                phase === 'refreshing' && 'motion-safe:animate-spin',
              )}
              style={
                phase === 'pulling' && !reduced.current
                  ? { transform: `rotate(${Math.min(360, (pull / threshold) * 180)}deg)` }
                  : undefined
              }
            />
          </div>
        </div>
      ) : null}
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        className="h-full overflow-y-auto touch-pan-y"
        style={{
          transform: `translateY(${translate}px)`,
          transition: useTransition ? 'transform 200ms ease-out' : 'none',
          WebkitOverflowScrolling: 'touch',
        }}
        aria-busy={phase === 'refreshing'}
      >
        {children}
      </div>
    </div>
  );
}
