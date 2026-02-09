import { useState } from 'react';
import { startOfMonth, endOfMonth } from 'date-fns';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { useCeoDashboard } from '@/hooks/useCeoDashboard';
import { useCeoOperationalKpis } from '@/hooks/useCeoOperationalKpis';
import { TaxDisclaimer } from '@/components/ceo/TaxDisclaimer';
import { CeoPeriodSelector } from '@/components/ceo/CeoPeriodSelector';
import { CeoOperationalCards } from '@/components/ceo/CeoOperationalCards';
import { CeoKpiCards } from '@/components/ceo/CeoKpiCards';
import { CeoPipelineOverview } from '@/components/ceo/CeoPipelineOverview';
import { CeoExpensesPanel } from '@/components/ceo/CeoExpensesPanel';
import { CeoBudgetPanel } from '@/components/ceo/CeoBudgetPanel';
import { CeoAlertsPanel } from '@/components/ceo/CeoAlertsPanel';
import { BudgetBaselineCard } from '@/components/ceo/BudgetBaselineCard';
import { CeoCostBreakdown } from '@/components/ceo/CeoCostBreakdown';

export default function CeoDashboardView() {
  const { isAdmin, isCeo } = useAuth();
  const { hasBrandSelected } = useBrand();

  const [from, setFrom] = useState(() => startOfMonth(new Date()));
  const [to, setTo] = useState(() => endOfMonth(new Date()));

  const { data: finData, isLoading: finLoading, error: finError } = useCeoDashboard(from, to);
  const { data: opsData, isLoading: opsLoading } = useCeoOperationalKpis(from, to);

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
          <AlertDescription>Seleziona un brand dalla sidebar per accedere alla dashboard.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isLoading = finLoading || opsLoading;

  return (
    <DashboardShell
      title="CEO Dashboard"
      subtitle="Visione strategica: ricavi, costi, utile, forecast"
      icon={<TrendingUp className="h-6 w-6 text-primary" />}
      queryKeys={[['ceo-dashboard-kpis'], ['ceo-operational-kpis']]}
    >
      <CeoPeriodSelector from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />

      <TaxDisclaimer />

      {isLoading && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      )}

      {finError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Errore: {(finError as Error).message}</AlertDescription>
        </Alert>
      )}

      {opsData && <CeoOperationalCards data={opsData} />}

      {finData && <CeoKpiCards data={finData} />}

      {opsData && (
        <CeoPipelineOverview
          stages={opsData.deals_by_stage || []}
          wonDeals={opsData.won_deals_period}
          wonRevenue={opsData.won_deals_revenue}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <CeoExpensesPanel from={from} to={to} />
        <CeoBudgetPanel from={from} />
      </div>

      {finData && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <CeoCostBreakdown
              costsByCenter={finData.costs_by_center || []}
              costsByCategory={finData.costs_by_category || []}
            />
            <BudgetBaselineCard data={finData.budget_baseline} />
          </div>
          <CeoAlertsPanel alerts={finData.alerts || []} />
        </>
      )}
    </DashboardShell>
  );
}
