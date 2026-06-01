import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Badge di trend (delta %) con freccia, colore semantico e `tabular-nums`.
 * Convenzioni SPEC §2.4 / §7: il segno è veicolato da freccia + colore + label numerica,
 * mai dal solo colore.
 *
 * - `up`      → semantica success
 * - `down`    → semantica danger
 * - `neutral` → semantica muted
 *
 * `intent` opzionale inverte la semantica quando "down" è positivo
 * (es. CPL in calo è buono): passare `intent="inverse"`.
 */
export interface TrendBadgeProps {
  /** Variazione percentuale (es. 12.4 → "+12.4%"; -3 → "−3.0%"). */
  deltaPct: number | null | undefined;
  /** Forza la direzione; se assente è derivata dal segno di `deltaPct`. */
  direction?: 'up' | 'down' | 'neutral';
  /** "default" (su=positivo) o "inverse" (giù=positivo). */
  intent?: 'default' | 'inverse';
  /** Numero di decimali (default 1). */
  fractionDigits?: number;
  /** Label aggiuntiva, es. "vs mese scorso". */
  suffix?: string;
  /** Compact: solo freccia + numero, senza pill background. */
  compact?: boolean;
  className?: string;
  'aria-label'?: string;
}

function pickDirection(delta: number | null | undefined, override?: TrendBadgeProps['direction']) {
  if (override) return override;
  if (delta == null || Number.isNaN(delta) || delta === 0) return 'neutral' as const;
  return delta > 0 ? ('up' as const) : ('down' as const);
}

export function TrendBadge({
  deltaPct,
  direction,
  intent = 'default',
  fractionDigits = 1,
  suffix,
  compact = false,
  className,
  'aria-label': ariaLabel,
}: TrendBadgeProps) {
  const dir = pickDirection(deltaPct, direction);

  // Polarità rispetto all'intento: "good" = colore success, "bad" = danger, altrimenti muted.
  const polarity: 'good' | 'bad' | 'neutral' =
    dir === 'neutral'
      ? 'neutral'
      : intent === 'inverse'
        ? dir === 'down' ? 'good' : 'bad'
        : dir === 'up' ? 'good' : 'bad';

  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;

  const tone =
    polarity === 'good'
      ? 'text-success'
      : polarity === 'bad'
        ? 'text-danger'
        : 'text-muted-foreground';

  const pillBg =
    polarity === 'good'
      ? 'bg-success/10'
      : polarity === 'bad'
        ? 'bg-danger/10'
        : 'bg-muted';

  const formatted =
    deltaPct == null || Number.isNaN(deltaPct)
      ? '—'
      : `${deltaPct > 0 ? '+' : deltaPct < 0 ? '−' : ''}${Math.abs(deltaPct).toFixed(fractionDigits)}%`;

  const label = ariaLabel ?? (deltaPct == null ? 'Nessun dato' : `Variazione ${formatted}${suffix ? ` ${suffix}` : ''}`);

  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1 font-medium tabular-nums',
        compact ? 'text-xs' : 'rounded-full px-2 py-0.5 text-xs',
        compact ? tone : cn(tone, pillBg),
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{formatted}</span>
      {suffix ? <span className="text-muted-foreground font-normal">{suffix}</span> : null}
    </span>
  );
}
