import { useBrand } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, Kanban, Calendar, Ticket, TrendingUp, Globe, AlertCircle } from 'lucide-react';
import { DashboardKpiGrid, KpiItem } from '@/components/dashboard/DashboardKpiGrid';
import { DashboardTrendChart } from '@/components/dashboard/DashboardTrendChart';
import { DashboardMilestones } from '@/components/dashboard/DashboardMilestones';
import { DashboardSystemStatus } from '@/components/dashboard/DashboardSystemStatus';
import { TutorialSheet } from '@/components/dashboard/TutorialSheet';
import { useDashboardData } from '@/hooks/useDashboardData';

export default function Dashboard() {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected } = useBrand();
  const { userRoles } = useAuth();
  const {
    leadsToday,
    leadsWeek,
    openDeals,
    openTickets,
    slaBreachedTickets,
    totalContacts,
    appointmentsToday,
    trendData,
    isLoading,
    isTrendLoading,
  } = useDashboardData();

  if (!hasBrandSelected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Seleziona un Brand</h2>
        <p className="text-muted-foreground max-w-md">
          Utilizza il selettore nella sidebar per scegliere il brand con cui vuoi lavorare.
        </p>
      </div>
    );
  }

  const currentRole = !isAllBrandsSelected 
    ? userRoles.find(r => r.brand_id === currentBrand?.id)
    : null;

  // Primary KPIs
  const primaryKpis: KpiItem[] = [
    {
      title: "Lead Oggi",
      value: leadsToday,
      subtitle: `${leadsWeek} ultimi 7 giorni`,
      icon: TrendingUp,
      variant: "default",
    },
    {
      title: "Deal Aperti",
      value: openDeals,
      subtitle: "Pipeline attiva",
      icon: Kanban,
      variant: "default",
    },
    {
      title: "Contatti",
      value: totalContacts,
      subtitle: "Totale database",
      icon: Users,
      variant: "default",
    },
    {
      title: "Appuntamenti Oggi",
      value: appointmentsToday,
      subtitle: "Programmati",
      icon: Calendar,
      variant: "default",
    },
  ];

  // Secondary KPIs
  const secondaryKpis: KpiItem[] = [
    {
      title: "Ticket Aperti",
      value: openTickets,
      subtitle: "Da gestire",
      icon: Ticket,
      variant: openTickets > 10 ? "warning" : "default",
    },
    {
      title: "SLA Breach",
      value: slaBreachedTickets,
      subtitle: "Attenzione richiesta",
      icon: AlertCircle,
      variant: slaBreachedTickets > 0 ? "destructive" : "success",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            {isAllBrandsSelected && <Globe className="h-6 w-6 text-primary" />}
            Dashboard
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {isAllBrandsSelected ? (
              <span>Vista globale di tutti i brand</span>
            ) : (
              <>
                Benvenuto in {currentBrand?.name}
                {currentRole && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {currentRole.role}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <TutorialSheet />
      </div>

      {/* Primary KPIs */}
      <DashboardKpiGrid items={primaryKpis} isLoading={isLoading} />

      {/* Secondary KPIs Row */}
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        {secondaryKpis.map((item, index) => {
          const Icon = item.icon;
          return (
            <Card 
              key={index} 
              className={
                item.variant === "destructive" 
                  ? "border-destructive/50 bg-destructive/5" 
                  : item.variant === "warning"
                  ? "border-amber-500/30 bg-amber-500/5"
                  : ""
              }
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
                <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                  {item.title}
                </CardTitle>
                <div className={
                  item.variant === "destructive" 
                    ? "p-1.5 rounded-lg bg-destructive/10 text-destructive" 
                    : item.variant === "warning"
                    ? "p-1.5 rounded-lg bg-amber-500/10 text-amber-600"
                    : item.variant === "success"
                    ? "p-1.5 rounded-lg bg-green-500/10 text-green-600"
                    : "p-1.5 rounded-lg bg-primary/10 text-primary"
                }>
                  <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                <div className="text-xl md:text-2xl font-bold">{item.value}</div>
                <p className="text-xs text-muted-foreground hidden sm:block">{item.subtitle}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts & Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <DashboardTrendChart data={trendData} isLoading={isTrendLoading} />
        <DashboardSystemStatus />
      </div>

      {/* Milestones */}
      <DashboardMilestones />
    </div>
  );
}
