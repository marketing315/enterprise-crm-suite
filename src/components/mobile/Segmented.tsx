import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ChipOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  /** Conteggio opzionale visualizzato come badge a destra. */
  count?: number;
  /** Disabilita la singola chip. */
  disabled?: boolean;
  /** aria-label override (default: label se è stringa). */
  ariaLabel?: string;
}

export interface SegmentedProps<V extends string = string> {
  options: ReadonlyArray<ChipOption<V>>;
  value: V;
  onChange: (value: V) => void;
  /** Etichetta accessibile del gruppo. */
  ariaLabel: string;
  /** Dimensione visiva. */
  size?: 'sm' | 'md';
  /** Densità: `comfortable` (default) o `compact`. */
  className?: string;
  /** Mostra come tablist (role=tablist) anziché radiogroup. */
  asTabs?: boolean;
}

/**
 * Segmented / ChipGroup — selettore a pillole scrollabile orizzontale.
 * - `no-scrollbar` per scroll fluido senza scrollbar visibile.
 * - role=radiogroup (default) o tablist quando `asTabs`.
 * - Selezione controllata, accessibile (aria-checked / aria-selected), tastiera ←/→/Home/End.
 * - Conteggi opzionali tabular-nums.
 * - Nessun colore hard-coded: usa token F0.2 (`bg-foreground`/`bg-muted/60`/`text-foreground/70`).
 */
export function Segmented<V extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  className,
  asTabs = false,
}: SegmentedProps<V>) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const focusByValue = React.useCallback((val: string) => {
    const container = containerRef.current;
    if (!container) return;
    const btn = container.querySelector<HTMLButtonElement>(`button[data-value="${val}"]`);
    btn?.focus();
  }, []);

  const handleKey = (e: React.KeyboardEvent, currentIdx: number) => {
    const findNextEnabled = (start: number, dir: 1 | -1) => {
      const n = options.length;
      for (let step = 1; step <= n; step++) {
        const i = ((start + dir * step) % n + n) % n;
        if (!options[i].disabled) return i;
      }
      return -1;
    };
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = findNextEnabled(currentIdx, 1);
      if (next >= 0) focusByValue(options[next].value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = findNextEnabled(currentIdx, -1);
      if (prev >= 0) focusByValue(options[prev].value);
    } else if (e.key === 'Home') {
      e.preventDefault();
      const first = options.findIndex((o) => !o.disabled);
      if (first >= 0) focusByValue(options[first].value);
    } else if (e.key === 'End') {
      e.preventDefault();
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i].disabled) {
          focusByValue(options[i].value);
          break;
        }
      }
    }
  };

  const heightCls = size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm';

  return (
    <div
      ref={containerRef}
      role={asTabs ? 'tablist' : 'radiogroup'}
      aria-label={ariaLabel}
      className={cn(
        'flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1 scroll-smooth',
        className,
      )}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        const labelText = opt.ariaLabel ?? (typeof opt.label === 'string' ? opt.label : opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            data-chip="1"
            data-value={opt.value}
            role={asTabs ? 'tab' : 'radio'}
            aria-label={labelText}
            {...(asTabs
              ? { 'aria-selected': selected, tabIndex: selected ? 0 : -1 }
              : { 'aria-checked': selected, tabIndex: selected ? 0 : -1 })}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            onKeyDown={(e) => handleKey(e, i)}
            className={cn(
              'press-scale shrink-0 inline-flex items-center gap-1.5 rounded-full font-medium transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:opacity-50 disabled:pointer-events-none',
              heightCls,
              selected
                ? 'bg-foreground text-background shadow-sm'
                : 'bg-muted/60 text-foreground/70 hover:bg-muted',
            )}
          >
            <span>{opt.label}</span>
            {typeof opt.count === 'number' && (
              <span
                className={cn(
                  'ml-0.5 inline-flex min-w-[18px] justify-center rounded-full px-1.5 text-[11px] tabular-nums leading-[18px]',
                  selected ? 'bg-background/20 text-background' : 'bg-foreground/10 text-foreground/70',
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Alias semantico: stesso componente, naming "ChipGroup" per cataloghi/filtri. */
export const ChipGroup = Segmented;
