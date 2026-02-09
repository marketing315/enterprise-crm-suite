import { useState } from 'react';
import { startOfMonth, endOfMonth } from 'date-fns';
import { LayoutDashboard, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
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

export default function CeoDashboard() {
  const { isAdmin, isCeo } = useAuth();
  const { currentBrand, hasBrandSelected } = useBrand();

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <LayoutDashboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Dashboard CEO</h1>
            <p className="text-sm text-muted-foreground">
              {currentBrand?.name} — Controllo di Gestione
            </p>
          </div>
        </div>
      </div>

      {/* Period selector */}
      <CeoPeriodSelector from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />

      <TaxDisclaimer />

      {/* Loading */}
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

      {/* Error */}
      {finError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Errore: {(finError as Error).message}</AlertDescription>
        </Alert>
      )}

      {/* Operational KPIs */}
      {opsData && <CeoOperationalCards data={opsData} />}

      {/* Financial KPIs */}
      {finData && <CeoKpiCards data={finData} />}

      {/* Pipeline overview */}
      {opsData && (
        <CeoPipelineOverview
          stages={opsData.deals_by_stage || []}
          wonDeals={opsData.won_deals_period}
          wonRevenue={opsData.won_deals_revenue}
        />
      )}

      {/* Expenses & Budget inline */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CeoExpensesPanel from={from} to={to} />
        <CeoBudgetPanel from={from} />
      </div>

      {/* Existing sections */}
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
    </div>
  );
}
