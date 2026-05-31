import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Euro,
  Percent,
  Target,
  Wallet,
  Users,
  TicketCheck,
  CalendarCheck,
  Briefcase,
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/formatKpi';
import { ConfidenceBadge } from '@/components/ceo/ConfidenceBadge';
import { cn } from '@/lib/utils';
import type { CeoKpi } from '@/types/company';
import type { CeoOperationalData } from '@/hooks/useCeoOperationalKpis';

interface Props {
  financial?: CeoKpi;
  operational?: CeoOperationalData;
}

interface MobileKpiRow {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number;
  invertTrend?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  confidence?: number;
  factors?: string[];
  tone?: 'pos' | 'neg' | 'warn' | 'neutral';
}

function Trend({ value, invert }: { value: number; invert?: boolean }) {
  const good = invert ? value <= 0 : value >= 0;
  const Icon = good ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium',
        good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
      )}
    >
      <Icon className="h-3 w-3" />
      {value >= 0 ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
}

function KpiRow({ kpi }: { kpi: MobileKpiRow }) {
  const navigate = useNavigate();
  const Clickable = kpi.href ? 'button' : 'div';
  const toneClass =
    kpi.tone === 'pos'
      ? 'text-emerald-600 dark:text-emerald-400'
      : kpi.tone === 'neg'
        ? 'text-rose-600 dark:text-rose-400'
        : kpi.tone === 'warn'
          ? 'text-amber-600 dark:text-amber-400'
          : '';

  return (
    <Clickable
      onClick={kpi.href ? () => navigate(kpi.href!) : undefined}
      className={cn(
        'w-full text-left rounded-2xl p-4 bg-card border border-border/60',
        'shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        'transition-all active:scale-[0.98]',
        kpi.href && 'hover:border-border hover:shadow-md'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-muted/70 flex items-center justify-center shrink-0">
            <kpi.icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-[13px] font-medium text-muted-foreground truncate">{kpi.title}</p>
        </div>
        {kpi.href && <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />}
      </div>

      <div className="mt-3 flex items-baseline gap-2 flex-wrap">
        <span className={cn('text-[28px] leading-none font-semibold tracking-tight', toneClass)}>
          {kpi.value}
        </span>
        {kpi.confidence !== undefined && (
          <ConfidenceBadge value={kpi.confidence} factors={kpi.factors} />
        )}
      </div>

      {(kpi.subtitle || kpi.trend !== undefined) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {kpi.trend !== undefined && <Trend value={kpi.trend} invert={kpi.invertTrend} />}
          {kpi.subtitle && (
            <span className="text-[11px] text-muted-foreground">{kpi.subtitle}</span>
          )}
        </div>
      )}
    </Clickable>
  );
}

export function MobileCeoKpiList({ financial, operational }: Props) {
  const rows: MobileKpiRow[] = [];

  if (financial) {
    rows.push(
      {
        title: 'Margine Lordo',
        value: formatPercent(financial.gross_margin_percent),
        subtitle: formatCurrency(financial.gross_margin),
        icon: Percent,
        confidence: financial.confidence.overall,
        tone: financial.gross_margin_percent >= 20 ? 'pos' : 'warn',
      },
      {
        title: 'ROI Marketing',
        value: formatPercent(financial.marketing_roi),
        subtitle: `Spesa: ${formatCurrency(financial.marketing_spend)}`,
        icon: Target,
        confidence: financial.confidence.marketing_roi,
        tone: financial.marketing_roi >= 100 ? 'pos' : 'neg',
      },
      {
        title: 'Fatturato',
        value: formatCurrency(financial.revenue_total),
        icon: TrendingUp,
        trend: financial.revenue_change_percent,
        href: '/azienda',
      },
      {
        title: 'Costi Totali',
        value: formatCurrency(financial.costs_total),
        icon: Wallet,
        trend: financial.costs_change_percent,
        invertTrend: true,
        href: '/azienda/costi',
      },
      {
        title: 'Budget Disponibile',
        value: formatCurrency(financial.budget_baseline.remaining_allocable),
        subtitle: `${formatPercent(financial.budget_baseline.variance_percent)} del budget`,
        icon: Euro,
        href: '/azienda/budget',
        tone: financial.budget_baseline.variance >= 0 ? 'pos' : 'neg',
      },
    );
  }

  if (operational) {
    rows.push(
      {
        title: 'Contatti',
        value: formatNumber(operational.total_contacts),
        subtitle: `+${formatNumber(operational.new_contacts_period)} nel periodo`,
        icon: Users,
        href: '/contacts',
      },
      {
        title: 'Ticket Aperti',
        value: formatNumber(operational.open_tickets),
        subtitle: `${formatNumber(operational.tickets_created)} creati`,
        icon: TicketCheck,
        href: '/tickets',
      },
      {
        title: 'Appuntamenti',
        value: formatNumber(operational.appointments_period),
        subtitle: 'nel periodo',
        icon: CalendarCheck,
        href: '/appointments',
      },
      {
        title: 'Deal Aperti',
        value: formatNumber(operational.total_open_deals),
        subtitle: `${formatNumber(operational.won_deals_period)} chiusi`,
        icon: Briefcase,
        href: '/pipeline',
      },
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <KpiRow kpi={r} key={i} />
      ))}
    </div>
  );
}
