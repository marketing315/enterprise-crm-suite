import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
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
import type { CeoKpi, ConfidenceFactor } from '@/types/company';
import type { CeoOperationalData } from '@/hooks/useCeoOperationalKpis';
import { KpiList, MetricRow, type MetricTone } from '@/components/mobile/MetricRow';

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
  factors?: ConfidenceFactor[];
  tone?: MetricTone;
}

export function MobileCeoKpiList({ financial, operational }: Props) {
  const navigate = useNavigate();
  const rows: MobileKpiRow[] = [];

  if (financial) {
    rows.push(
      {
        title: 'Margine Lordo',
        value: formatPercent(financial.gross_margin_percent),
        subtitle: formatCurrency(financial.gross_margin),
        icon: Percent,
        confidence: financial.confidence.overall,
        tone: financial.gross_margin_percent >= 20 ? 'positive' : 'warning',
      },
      {
        title: 'ROI Marketing',
        value: formatPercent(financial.marketing_roi),
        subtitle: `Spesa: ${formatCurrency(financial.marketing_spend)}`,
        icon: Target,
        confidence: financial.confidence.marketing_roi,
        tone: financial.marketing_roi >= 100 ? 'positive' : 'negative',
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
        tone: financial.budget_baseline.variance >= 0 ? 'positive' : 'negative',
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
    <KpiList>
      {rows.map((r, i) => {
        const Icon = r.icon;
        const valueNode =
          r.confidence !== undefined ? (
            <span className="inline-flex items-baseline gap-2">
              <span>{r.value}</span>
              <ConfidenceBadge value={r.confidence} factors={r.factors} />
            </span>
          ) : (
            r.value
          );
        return (
          <MetricRow
            key={i}
            title={r.title}
            value={valueNode}
            subtitle={r.subtitle}
            delta={r.trend}
            invertTrend={r.invertTrend}
            icon={<Icon className="h-4 w-4" />}
            tone={r.tone}
            onClick={r.href ? () => navigate(r.href!) : undefined}
            ariaLabel={r.href ? `${r.title}: ${r.value}` : undefined}
          />
        );
      })}
    </KpiList>
  );
}
