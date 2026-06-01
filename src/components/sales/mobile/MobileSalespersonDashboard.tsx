import { useQuery } from '@tanstack/react-query';
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  subDays,
  format,
} from 'date-fns';
import { it } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import {
  Kanban,
  Euro,
  Target,
  Calendar,
  TrendingDown,
  AlertTriangle,
  Flame,
  CalendarClock,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { useBrandFilter } from '@/hooks/useBrandFilter';
import { supabase } from '@/integrations/supabase/client';
import { untypedClient } from '@/integrations/supabase/untypedClient';
import { formatCurrency } from '@/lib/formatKpi';
import { cn } from '@/lib/utils';

import { SectionLabel } from '@/components/mobile/SectionLabel';
import { HeroMetricCard } from '@/components/mobile/HeroMetricCard';
import { MetricRow, KpiList } from '@/components/mobile/MetricRow';
import {
  HeroMetricSkeleton,
  KpiListSkeleton,
  ListItemSkeleton,
} from '@/components/mobile/MobileSkeletons';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import { EmptyState } from '@/components/mobile/EmptyState';

/**
 * Mobile Dashboard Venditore (SPEC §6.1, task F3.2).
 *
 * Riusa esattamente le stesse query-key del desktop `SalespersonDashboard`,
 * così react-query deduplica le richieste (cache condivisa). Nessuna modifica
 * a hook esistenti, RPC o RLS.
 *
 * Composizione mobile:
 *  - Hero: Vendite mese in valuta (segnale di outcome) con delta n/d
 *  - KpiList: 6 metriche (deal attivi, pipeline, vendite, appt oggi/settimana,
 *    no-show, follow-up)
 *  - Prossimi appuntamenti (massimo 8 nei prossimi 7gg) con tap → dettaglio
 *  - Deal caldi mini con drill-down su /pipeline
 */
export function MobileSalespersonDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasBrandSelected } = useBrand();
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  const today = new Date();
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();
  const monthStart = startOfMonth(today).toISOString();
  const monthEnd = endOfMonth(today).toISOString();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }).toISOString();
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 }).toISOString();
  const last30Start = startOfDay(subDays(today, 30)).toISOString();
  const next7End = endOfDay(addDays(today, 7)).toISOString();

  // Stessi queryKey del desktop → cache condivisa, niente fetch extra.
  const { data: myDeals = [], isLoading: dealsLoading } = useQuery({
    queryKey: ['salesperson-my-deals', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return [];
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];
      let query = untypedClient
        .from('deals')
        .select(
          `id, value, status, updated_at, deal_score, deal_risk_level, current_stage_id,
           contact:contacts(id, first_name, last_name, email)`,
        )
        .eq('assigned_user_id', user.id)
        .eq('status', 'open')
        .order('updated_at', { ascending: false });
      if (brandIds.length === 1) query = query.eq('brand_id', brandIds[0]);
      else query = query.in('brand_id', brandIds);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  const { data: salesMonth = 0, isLoading: salesLoading } = useQuery({
    queryKey: ['salesperson-sales-month', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return 0;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      let query = supabase
        .from('deals')
        .select('value')
        .eq('assigned_user_id', user.id)
        .eq('status', 'won')
        .gte('closed_at', monthStart)
        .lte('closed_at', monthEnd);
      if (brandIds.length === 1) query = query.eq('brand_id', brandIds[0]);
      else query = query.in('brand_id', brandIds);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).reduce((sum: number, d: { value: number | null }) => sum + (d.value ?? 0), 0);
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  const { data: appointmentsToday = 0, isLoading: apptLoading } = useQuery({
    queryKey: ['salesperson-appointments-today', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return 0;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      let query = supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_sales_user_id', user.id)
        .gte('scheduled_at', todayStart)
        .lte('scheduled_at', todayEnd);
      if (brandIds.length === 1) query = query.eq('brand_id', brandIds[0]);
      else query = query.in('brand_id', brandIds);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  const { data: apptStats, isLoading: apptStatsLoading } = useQuery({
    queryKey: ['salesperson-appt-stats', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return null;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return null;
      const baseFilter = (q: ReturnType<typeof supabase.from>) =>
        brandIds.length === 1 ? q.eq('brand_id', brandIds[0]) : q.in('brand_id', brandIds);

      const weekQ = baseFilter(
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_sales_user_id', user.id)
          .gte('scheduled_at', weekStart)
          .lte('scheduled_at', weekEnd),
      );
      const closedQ = baseFilter(
        supabase
          .from('appointments')
          .select('status')
          .eq('assigned_sales_user_id', user.id)
          .gte('scheduled_at', last30Start)
          .lte('scheduled_at', todayEnd)
          .in('status', ['completed', 'visited', 'no_show', 'cancelled'])
          .limit(500),
      );
      const followUpQ = baseFilter(
        supabase
          .from('appointment_outcomes')
          .select('id, appointments!inner(assigned_sales_user_id, brand_id)', {
            count: 'exact',
            head: true,
          })
          .eq('appointments.assigned_sales_user_id', user.id)
          .not('next_action_at', 'is', null)
          .lte('next_action_at', todayEnd),
      );

      const [weekRes, closedRes, followUpRes] = await Promise.all([weekQ, closedQ, followUpQ]);
      if (weekRes.error) throw weekRes.error;
      if (closedRes.error) throw closedRes.error;
      const closed = (closedRes.data ?? []) as { status: string }[];
      const noShows = closed.filter((a) => a.status === 'no_show').length;
      const noShowRate = closed.length > 0 ? (noShows / closed.length) * 100 : 0;
      return {
        weekCount: weekRes.count ?? 0,
        noShowRate,
        closedSample: closed.length,
        pendingFollowUp: followUpRes.count ?? 0,
      };
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  const { data: upcomingAppts = [], isLoading: upcomingLoading } = useQuery({
    queryKey: ['salesperson-upcoming-appts', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return [];
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];
      let query = supabase
        .from('appointments')
        .select(
          `id, scheduled_at, status, risk_score, address, city,
           contact:contacts(id, first_name, last_name)`,
        )
        .eq('assigned_sales_user_id', user.id)
        .gte('scheduled_at', todayStart)
        .lte('scheduled_at', next7End)
        .not('status', 'in', '(cancelled,no_show,completed,visited)')
        .order('scheduled_at', { ascending: true })
        .limit(8);
      if (brandIds.length === 1) query = query.eq('brand_id', brandIds[0]);
      else query = query.in('brand_id', brandIds);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  if (!hasBrandSelected) {
    return (
      <div className="p-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Seleziona un brand dal menu per accedere alla dashboard.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const pipelineValue = myDeals.reduce(
    (sum: number, d: { value: number | null }) => sum + (d.value ?? 0),
    0,
  );
  const hotDeals = myDeals.filter(
    (d: { deal_score: number | null }) => (d.deal_score ?? 0) >= 60,
  );

  const isHeroLoading = salesLoading;
  const isKpiLoading = dealsLoading || salesLoading || apptLoading || apptStatsLoading;
  const noShowRate = apptStats?.noShowRate ?? 0;
  const noShowTone =
    noShowRate > 15 ? 'negative' : noShowRate > 8 ? 'warning' : noShowRate > 0 ? 'positive' : 'neutral';
  const followUpCount = apptStats?.pendingFollowUp ?? 0;

  return (
    <PullToRefresh
      className="pb-10"
      invalidateKeys={[
        ['salesperson-my-deals'],
        ['salesperson-sales-month'],
        ['salesperson-appointments-today'],
        ['salesperson-appt-stats'],
        ['salesperson-upcoming-appts'],
        ['my-action-suggestions'],
      ]}
    >
      {/* Sticky compact header */}
      <header
        className={cn(
          'sticky top-0 z-30 px-4 pt-3 pb-3',
          'bg-background/85 backdrop-blur-xl',
          'border-b border-border/40',
        )}
      >
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          Dashboard Venditore
        </p>
        <h1 className="text-[17px] font-semibold tracking-tight truncate">
          Chiudere: follow-up, deal caldi, agenda
        </h1>
      </header>

      <div className="px-4 pt-5 space-y-5">
        {/* Hero: vendite del mese, drill-down su pipeline */}
        {isHeroLoading ? (
          <HeroMetricSkeleton />
        ) : (
          <button
            type="button"
            onClick={() => navigate('/pipeline')}
            aria-label="Apri pipeline: dettaglio vendite del mese"
            className="press-scale w-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HeroMetricCard
              label="Vendite del mese"
              value={formatCurrency(salesMonth)}
              variant="primary"
              caption={`${myDeals.length} deal aperti · Tocca per la pipeline`}
            />
          </button>
        )}

        {/* KPI list */}
        <section>
          <SectionLabel>Indicatori chiave</SectionLabel>
          {isKpiLoading ? (
            <KpiListSkeleton count={6} />
          ) : (
            <KpiList>
              <MetricRow
                icon={<Kanban className="h-4 w-4" aria-hidden="true" />}
                title="Deal attivi"
                value={String(myDeals.length)}
                subtitle={`${hotDeals.length} caldi (score ≥ 60)`}
                onClick={() => navigate('/pipeline')}
                ariaLabel="Apri pipeline"
              />
              <MetricRow
                icon={<Euro className="h-4 w-4" aria-hidden="true" />}
                title="Pipeline personale"
                value={formatCurrency(pipelineValue)}
                subtitle="Valore deal aperti"
                onClick={() => navigate('/pipeline')}
                ariaLabel="Apri pipeline"
              />
              <MetricRow
                icon={<Target className="h-4 w-4" aria-hidden="true" />}
                title="Vendite mese"
                value={formatCurrency(salesMonth)}
                subtitle="Deal vinti nel mese in corso"
                tone={salesMonth > 0 ? 'positive' : 'neutral'}
              />
              <MetricRow
                icon={<Calendar className="h-4 w-4" aria-hidden="true" />}
                title="Appuntamenti oggi"
                value={String(appointmentsToday)}
                subtitle={`${apptStats?.weekCount ?? 0} questa settimana`}
                onClick={() => navigate('/appointments/calendar')}
                ariaLabel="Apri calendario"
              />
              <MetricRow
                icon={<TrendingDown className="h-4 w-4" aria-hidden="true" />}
                title="No-show rate"
                value={`${noShowRate.toFixed(0)}%`}
                subtitle={`Ultimi 30 giorni (${apptStats?.closedSample ?? 0} esiti)`}
                tone={noShowTone}
                invertTrend
              />
              <MetricRow
                icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                title="Follow-up pendenti"
                value={String(followUpCount)}
                subtitle="Azioni in scadenza"
                tone={followUpCount > 0 ? 'warning' : 'neutral'}
                onClick={() => navigate('/appointments')}
                ariaLabel="Apri appuntamenti"
              />
            </KpiList>
          )}
        </section>

        {/* Prossimi appuntamenti */}
        <section>
          <SectionLabel
            trailing={
              <button
                type="button"
                onClick={() => navigate('/appointments/calendar')}
                className="press-scale inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary"
                aria-label="Apri il calendario completo"
              >
                Apri
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </button>
            }
          >
            Prossimi 7 giorni
          </SectionLabel>
          {upcomingLoading ? (
            <div className="space-y-2.5">
              <ListItemSkeleton />
              <ListItemSkeleton />
              <ListItemSkeleton />
            </div>
          ) : upcomingAppts.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nessun appuntamento"
              description="Non hai impegni pianificati nei prossimi 7 giorni."
            />
          ) : (
            <ul className="space-y-2" role="list" aria-label="Appuntamenti dei prossimi 7 giorni">
              {upcomingAppts.map((appt: {
                id: string;
                scheduled_at: string;
                status: string;
                address: string | null;
                city: string | null;
                contact: { first_name: string | null; last_name: string | null } | null;
              }) => {
                const dt = new Date(appt.scheduled_at);
                const contactName = [appt.contact?.first_name, appt.contact?.last_name]
                  .filter(Boolean)
                  .join(' ') || 'Contatto';
                const location = [appt.city, appt.address].filter(Boolean).join(' · ');
                return (
                  <li key={appt.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/appointments/${appt.id}`)}
                      aria-label={`Apri appuntamento con ${contactName} del ${format(dt, 'EEEE d MMMM', { locale: it })}`}
                      className="press-scale w-full text-left rounded-2xl border border-border/60 bg-card p-3 shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex w-12 shrink-0 flex-col items-center justify-center text-center">
                          <span className="text-[10px] font-medium uppercase text-muted-foreground">
                            {format(dt, 'EEE', { locale: it })}
                          </span>
                          <span className="text-lg font-semibold leading-none tabular-nums">
                            {format(dt, 'd')}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {format(dt, 'HH:mm')}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{contactName}</p>
                          {location && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{location}</p>
                          )}
                        </div>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Deal caldi mini */}
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
            Deal caldi
          </SectionLabel>
          {dealsLoading ? (
            <div className="space-y-2.5">
              <ListItemSkeleton />
              <ListItemSkeleton />
            </div>
          ) : hotDeals.length === 0 ? (
            <EmptyState
              icon={Flame}
              title="Nessun deal caldo"
              description="Niente di urgente in pipeline. Concentrati sui follow-up."
            />
          ) : (
            <ul className="space-y-2" role="list" aria-label="Deal caldi (score ≥ 60)">
              {hotDeals.slice(0, 4).map((deal: {
                id: string;
                value: number | null;
                deal_score: number | null;
                contact: { first_name: string | null; last_name: string | null } | null;
              }) => {
                const contactName = [deal.contact?.first_name, deal.contact?.last_name]
                  .filter(Boolean)
                  .join(' ') || 'Contatto';
                return (
                  <li key={deal.id}>
                    <button
                      type="button"
                      onClick={() => navigate('/pipeline')}
                      aria-label={`Apri pipeline su deal di ${contactName}`}
                      className="press-scale w-full text-left rounded-2xl border border-border/60 bg-card p-3 shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                          <Flame className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{contactName}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {deal.value ? formatCurrency(deal.value) : 'Senza valore'} · Score{' '}
                            {deal.deal_score ?? '—'}
                          </p>
                        </div>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </PullToRefresh>
  );
}

export default MobileSalespersonDashboard;
