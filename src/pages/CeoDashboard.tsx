import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { LayoutDashboard, Calendar, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { useCeoDashboard } from '@/hooks/useCeoDashboard';
import { TaxDisclaimer } from '@/components/ceo/TaxDisclaimer';
import { CeoKpiCards } from '@/components/ceo/CeoKpiCards';
import { CeoAlertsPanel } from '@/components/ceo/CeoAlertsPanel';
import { BudgetBaselineCard } from '@/components/ceo/BudgetBaselineCard';
import { CeoCostBreakdown } from '@/components/ceo/CeoCostBreakdown';

export default function CeoDashboard() {
  const { isAdmin, isCeo } = useAuth();
  const { currentBrand, hasBrandSelected } = useBrand();
  
  // Period state - default to current month
  const [periodOffset, setPeriodOffset] = useState(0);
  
  const { from, to, periodLabel } = useMemo(() => {
    const baseDate = subMonths(new Date(), periodOffset);
    return {
      from: startOfMonth(baseDate),
      to: endOfMonth(baseDate),
      periodLabel: format(baseDate, 'MMMM yyyy', { locale: it }),
    };
  }, [periodOffset]);
  
  const { data, isLoading, error } = useCeoDashboard(from, to);
  
  // Access control
  if (!isAdmin && !isCeo) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Accesso riservato a Admin e CEO.
          </AlertDescription>
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
        
        {/* Period selector */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPeriodOffset(prev => prev + 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md min-w-[160px] justify-center">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium capitalize">{periodLabel}</span>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPeriodOffset(prev => Math.max(0, prev - 1))}
            disabled={periodOffset === 0}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Tax Disclaimer */}
      <TaxDisclaimer />
      
      {/* Loading state */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-[350px]" />
            <Skeleton className="h-[350px]" />
          </div>
        </div>
      )}
      
      {/* Error state */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Errore nel caricamento dei dati: {(error as Error).message}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Data loaded */}
      {data && (
        <>
          {/* KPI Cards */}
          <CeoKpiCards data={data} />
          
          {/* Main content grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Cost breakdown */}
            <CeoCostBreakdown 
              costsByCenter={data.costs_by_center || []}
              costsByCategory={data.costs_by_category || []}
            />
            
            {/* Budget baseline */}
            <BudgetBaselineCard data={data.budget_baseline} />
          </div>
          
          {/* Alerts panel */}
          <CeoAlertsPanel alerts={data.alerts || []} />
        </>
      )}
    </div>
  );
}
