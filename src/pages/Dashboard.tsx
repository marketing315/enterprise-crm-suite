import { useBrand, ALL_BRANDS_ID } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, Kanban, Calendar, Ticket, TrendingUp, CheckCircle2, AlertCircle, Clock, Globe } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { useBrandFilter } from '@/hooks/useBrandFilter';

export default function Dashboard() {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected } = useBrand();
  const { user, userRoles } = useAuth();
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  // KPI: Lead oggi
  const { data: leadsToday = 0 } = useQuery({
    queryKey: ['dashboard-leads-today', getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      const today = new Date();
      
      let query = supabase
        .from('lead_events')
        .select('*', { count: 'exact', head: true })
        .gte('received_at', startOfDay(today).toISOString())
        .lte('received_at', endOfDay(today).toISOString());
      
      if (brandIds.length === 1) {
        query = query.eq('brand_id', brandIds[0]);
      } else {
        query = query.in('brand_id', brandIds);
      }
      
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isQueryEnabled(),
    refetchInterval: 30000,
  });

  // KPI: Deal aperti
  const { data: openDeals = 0 } = useQuery({
    queryKey: ['dashboard-open-deals', getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      
      let query = supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open');
      
      if (brandIds.length === 1) {
        query = query.eq('brand_id', brandIds[0]);
      } else {
        query = query.in('brand_id', brandIds);
      }
      
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isQueryEnabled(),
    refetchInterval: 30000,
  });

  // KPI: Ticket aperti
  const { data: openTickets = 0 } = useQuery({
    queryKey: ['dashboard-open-tickets', getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      
      let query = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress', 'reopened']);
      
      if (brandIds.length === 1) {
        query = query.eq('brand_id', brandIds[0]);
      } else {
        query = query.in('brand_id', brandIds);
      }
      
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isQueryEnabled(),
    refetchInterval: 30000,
  });

  // KPI: Ticket con SLA breach
  const { data: slaBreachedTickets = 0 } = useQuery({
    queryKey: ['dashboard-sla-breached', getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      
      let query = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress', 'reopened'])
        .not('sla_breached_at', 'is', null);
      
      if (brandIds.length === 1) {
        query = query.eq('brand_id', brandIds[0]);
      } else {
        query = query.in('brand_id', brandIds);
      }
      
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isQueryEnabled(),
    refetchInterval: 30000,
  });

  // KPI: Contatti totali
  const { data: totalContacts = 0 } = useQuery({
    queryKey: ['dashboard-total-contacts', getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      
      let query = supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true });
      
      if (brandIds.length === 1) {
        query = query.eq('brand_id', brandIds[0]);
      } else {
        query = query.in('brand_id', brandIds);
      }
      
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isQueryEnabled(),
    refetchInterval: 60000,
  });

  // KPI: Lead ultimi 7 giorni
  const { data: leadsWeek = 0 } = useQuery({
    queryKey: ['dashboard-leads-week', getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      const weekAgo = subDays(new Date(), 7);
      
      let query = supabase
        .from('lead_events')
        .select('*', { count: 'exact', head: true })
        .gte('received_at', weekAgo.toISOString());
      
      if (brandIds.length === 1) {
        query = query.eq('brand_id', brandIds[0]);
      } else {
        query = query.in('brand_id', brandIds);
      }
      
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isQueryEnabled(),
    refetchInterval: 60000,
  });

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

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
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
                <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {currentRole.role}
                </span>
              )}
            </>
          )}
        </p>
      </div>

      {/* Main KPIs */}
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Lead Oggi</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{leadsToday}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              {leadsWeek} negli ultimi 7 giorni
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Deal Aperti</CardTitle>
            <Kanban className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{openDeals}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Pipeline attiva
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Contatti</CardTitle>
            <Users className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{totalContacts}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Totale nel database
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Ticket Aperti</CardTitle>
            <Ticket className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold">{openTickets}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Da gestire
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SLA Alert */}
      {slaBreachedTickets > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-base text-destructive">Attenzione SLA</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              <span className="font-bold text-destructive">{slaBreachedTickets}</span> ticket hanno superato il tempo SLA e richiedono attenzione immediata.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Status Summary */}
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stato Sistema</CardTitle>
            <CardDescription>Panoramica servizi attivi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm">Webhook Inbound</span>
              </div>
              <span className="text-xs text-muted-foreground">Attivo</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm">AI Classification</span>
              </div>
              <span className="text-xs text-muted-foreground">Attivo</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm">Outbound Webhooks</span>
              </div>
              <span className="text-xs text-muted-foreground">Attivo</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-sm">SLA Checker</span>
              </div>
              <span className="text-xs text-muted-foreground">Ogni 5 min</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prossimi Passi</CardTitle>
            <CardDescription>Milestone completate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm">M0: Setup Fondamentale</span>
                <span className="text-xs text-green-600 ml-auto">✓</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm">M1: Webhook & Contatti</span>
                <span className="text-xs text-green-600 ml-auto">✓</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm">M2: Deal & Pipeline</span>
                <span className="text-xs text-green-600 ml-auto">✓</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm">M5: Ticketing</span>
                <span className="text-xs text-green-600 ml-auto">✓</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm">M8: Outbound Webhooks</span>
                <span className="text-xs text-green-600 ml-auto">✓</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm">M9: Google Sheets</span>
                <span className="text-xs text-green-600 ml-auto">✓</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
