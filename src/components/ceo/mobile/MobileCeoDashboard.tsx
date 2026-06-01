import { useState } from 'react';
import { startOfMonth, endOfMonth } from 'date-fns';
import { AlertCircle, ChevronDown, ChevronUp, Sparkles, LayoutGrid, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { useCeoDashboardBundle } from '@/hooks/useCeoDashboardBundle';
import { useRoleDashboard } from '@/hooks/useRoleDashboard';
import { formatCurrency } from '@/lib/formatKpi';
import { cn } from '@/lib/utils';

import { MobileCeoPeriodChips } from './MobileCeoPeriodChips';
import { MobileCeoKpiList } from './MobileCeoKpiList';
import { CeoCalcVersionBanner } from '@/components/ceo/CeoCalcVersionBanner';
import { CeoAlertsPanel } from '@/components/ceo/CeoAlertsPanel';
import { CeoPipelineOverview } from '@/components/ceo/CeoPipelineOverview';
import { CeoExpensesPanel } from '@/components/ceo/CeoExpensesPanel';
import { CeoBudgetPanel } from '@/components/ceo/CeoBudgetPanel';
import { CeoCostBreakdown } from '@/components/ceo/CeoCostBreakdown';
import { BudgetBaselineCard } from '@/components/ceo/BudgetBaselineCard';

import { SectionLabel } from '@/components/mobile/SectionLabel';
import { HeroMetricCard } from '@/components/mobile/HeroMetricCard';
import { HeroMetricSkeleton, KpiListSkeleton } from '@/components/mobile/MobileSkeletons';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';





function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-4 pb-4 border-t border-border/60 pt-3">{children}</div>}
    </div>
  );
}

export function MobileCeoDashboard() {
  const { isAdmin, isCeo } = useAuth();
  const { currentBrand, hasBrandSelected } = useBrand();
  const navigate = useNavigate();
  const location = useLocation();
  const { availableDashboards } = useRoleDashboard();
  const showSwitcher = availableDashboards.length > 1;

  const [from, setFrom] = useState(() => startOfMonth(new Date()));
  const [to, setTo] = useState(() => endOfMonth(new Date()));

  const { data: bundle, isLoading, error: finError } = useCeoDashboardBundle(from, to);
  const finData = bundle?.financial;
  const opsData = bundle?.operational;

  if (!isAdmin && !isCeo) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Accesso riservato a Admin e CEO.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!hasBrandSelected) {
    return (
      <div className="p-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per accedere alla dashboard.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const profit = finData?.estimated_net_profit ?? 0;
  const trend = finData?.revenue_change_percent ?? 0;

  return (
    <PullToRefresh
      invalidateKeys={[['ceo-dashboard-bundle']]}
      className="pb-10"
    >
      {/* Sticky compact header (sotto MobileHeader della shell) */}
      <header
        className={cn(
          'sticky top-0 z-30 px-4 pt-3 pb-3',
          'bg-background/85 backdrop-blur-xl',
          'border-b border-border/40'
        )}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
              CEO Dashboard
            </p>
            <h1 className="text-[17px] font-semibold tracking-tight truncate">
              {currentBrand?.name ?? 'Tutti i brand'}
            </h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {showSwitcher && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 px-2.5 rounded-full gap-1"
                    aria-label="Cambia vista dashboard"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Cambia vista
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableDashboards.map((d) => (
                    <DropdownMenuItem
                      key={d.path}
                      onClick={() => navigate(d.path)}
                      className={location.pathname === d.path ? 'bg-accent font-medium' : ''}
                    >
                      {d.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-2.5 rounded-full"
              onClick={() => navigate('/ai-assistant')}
              aria-label="AI Assistant"
            >
              <Sparkles className="h-4 w-4 text-primary" />
            </Button>
          </div>
        </div>
        <MobileCeoPeriodChips
          from={from}
          to={to}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
        />
      </header>

      <div className="px-4 pt-5 space-y-5">
        {/* Hero card: Utile netto — tap → drill-down su pipeline (origine del fatturato) */}
        {isLoading ? (
          <HeroMetricSkeleton />
        ) : finData ? (
          <button
            type="button"
            onClick={() => navigate('/pipeline')}
            aria-label="Apri pipeline: dettaglio fatturato e deal vinti"
            className="press-scale w-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HeroMetricCard
              label="Utile Netto Stimato"
              value={formatCurrency(profit)}
              variant="primary"
              delta={trend}
              caption="Fatturato vs periodo prec. · Tocca per il dettaglio"
            />
          </button>
        ) : null}

        <CeoCalcVersionBanner calcVersion={finData?.calc_version} />

        {finError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Errore: {(finError as Error).message}</AlertDescription>
          </Alert>
        )}

        {/* KPI list */}
        <section>
          <SectionLabel>Indicatori chiave</SectionLabel>
          {isLoading ? (
            <KpiListSkeleton count={6} />
          ) : (
            <MobileCeoKpiList financial={finData} operational={opsData} />
          )}
        </section>


        {/* Pipeline — header con drill-down esplicito */}
        {opsData && (
          <section>
            <SectionLabel
              trailing={
                <button
                  type="button"
                  onClick={() => navigate('/pipeline')}
                  className="press-scale inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary"
                  aria-label="Apri la pipeline completa"
                >
                  Apri
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                </button>
              }
            >
              Pipeline
            </SectionLabel>
            <div className="rounded-2xl bg-card border border-border/60 p-3">
              <CeoPipelineOverview
                stages={opsData.deals_by_stage || []}
                wonDeals={opsData.won_deals_period}
                wonRevenue={opsData.won_deals_revenue}
              />
            </div>
          </section>
        )}

        {/* Finanza — collassabile + drill-down a /sales */}
        <section>
          <SectionLabel
            trailing={
              <button
                type="button"
                onClick={() => navigate('/sales')}
                className="press-scale inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary"
                aria-label="Apri la sezione vendite"
              >
                Apri
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </button>
            }
          >
            Finanza
          </SectionLabel>
          <div className="space-y-2.5">
            <Collapsible title="Spese del periodo">
              <CeoExpensesPanel from={from} to={to} />
            </Collapsible>
            <Collapsible title="Budget mensile">
              <CeoBudgetPanel from={from} />
            </Collapsible>
            {finData && (
              <>
                <Collapsible title="Costi per centro e categoria">
                  <CeoCostBreakdown
                    costsByCenter={finData.costs_by_center || []}
                    costsByCategory={finData.costs_by_category || []}
                  />
                </Collapsible>
                <Collapsible title="Baseline budget">
                  <BudgetBaselineCard data={finData.budget_baseline} />
                </Collapsible>
              </>
            )}
          </div>
        </section>

        {/* Alerts */}
        {finData && finData.alerts && finData.alerts.length > 0 && (
          <section>
            <SectionLabel>Allerte</SectionLabel>
            <CeoAlertsPanel alerts={finData.alerts || []} />
          </section>
        )}
      </div>
    </PullToRefresh>
  );
}

