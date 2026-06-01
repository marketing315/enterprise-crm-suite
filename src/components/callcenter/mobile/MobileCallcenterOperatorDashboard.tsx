import { useQuery } from '@tanstack/react-query';
import { startOfDay, endOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  Phone,
  PhoneCall,
  Calendar,
  Clock,
  Ticket,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { useBrandFilter } from '@/hooks/useBrandFilter';
import { supabase } from '@/integrations/supabase/client';
import { untypedClient } from '@/integrations/supabase/untypedClient';
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
 * Mobile Dashboard Operatore Call Center (SPEC §6.1, task F3.4).
 *
 * Riusa esattamente gli stessi queryKey del desktop `CallcenterOperatorDashboard`
 * → cache react-query condivisa, zero fetch extra, RPC/RLS invariati.
 *
 * Composizione mobile:
 *  - Hero: ticket assegnati da gestire (drill → /tickets)
 *  - KpiList: chiamate oggi, ticket assegnati, appuntamenti oggi, ricontatti 60min
 *  - Lista ricontatti urgenti dei prossimi 60 minuti
 */
export function MobileCallcenterOperatorDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasBrandSelected } = useBrand();
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  const today = new Date();
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();

  const { data: callsToday = 0, isLoading: callsLoading } = useQuery({
    queryKey: ['operator-calls-today', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return 0;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      let query = supabase
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('started_at', todayStart)
        .lte('started_at', todayEnd);
      if (brandIds.length === 1) query = query.eq('brand_id', brandIds[0]);
      else query = query.in('brand_id', brandIds);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  const { data: myTickets = 0, isLoading: ticketsLoading } = useQuery({
    queryKey: ['operator-my-tickets', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return 0;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      let query = untypedClient
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .in('status', ['open', 'in_progress', 'reopened']);
      if (brandIds.length === 1) query = query.eq('brand_id', brandIds[0]);
      else query = query.in('brand_id', brandIds);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  const { data: appointmentsToday = 0, isLoading: apptLoading } = useQuery({
    queryKey: ['operator-appointments-today', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return 0;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      let query = supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('created_by_user_id', user.id)
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

  const { data: upcomingCallbacks = [], isLoading: cbLoading } = useQuery({
    queryKey: ['operator-callbacks', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return [];
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];
      const now = new Date().toISOString();
      const in60min = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      let query = supabase
        .from('automation_jobs')
        .select('id, run_at, payload, contact_id, status')
        .eq('status', 'pending')
        .eq('job_type', 'callback')
        .contains('payload', { assigned_to: user.id })
        .gte('run_at', now)
        .lte('run_at', in60min)
        .order('run_at', { ascending: true })
        .limit(10);
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
          <AlertDescription>
            Seleziona un brand dal menu per accedere alla dashboard.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isHeroLoading = ticketsLoading;
  const isKpiLoading = callsLoading || ticketsLoading || apptLoading;

  const ticketsTone =
    myTickets > 10 ? 'negative' : myTickets > 5 ? 'warning' : myTickets > 0 ? 'neutral' : 'positive';
  const cbTone =
    upcomingCallbacks.length > 5 ? 'negative' : upcomingCallbacks.length > 0 ? 'warning' : 'positive';

  return (
    <PullToRefresh
      className="pb-10"
      invalidateKeys={[
        ['operator-calls-today'],
        ['operator-my-tickets'],
        ['operator-appointments-today'],
        ['operator-callbacks'],
      ]}
    >
      <header
        className={cn(
          'sticky top-0 z-30 px-4 pt-3 pb-3',
          'bg-background/85 backdrop-blur-xl',
          'border-b border-border/40',
        )}
      >
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          Operatore Call Center
        </p>
        <h1 className="text-[17px] font-semibold tracking-tight truncate">
          Chi chiamare adesso
        </h1>
      </header>

      <div className="px-4 pt-5 space-y-5">
        {/* Hero: ticket da gestire */}
        {isHeroLoading ? (
          <HeroMetricSkeleton />
        ) : (
          <button
            type="button"
            onClick={() => navigate('/tickets')}
            aria-label="Apri i tuoi ticket"
            className="press-scale w-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HeroMetricCard
              label="Ticket assegnati"
              value={String(myTickets)}
              variant={myTickets > 10 ? 'negative' : 'primary'}
              caption={`${callsToday} chiamate oggi · Tocca per la lista`}
            />
          </button>
        )}

        {/* KPI list */}
        <section>
          <SectionLabel>Indicatori chiave</SectionLabel>
          {isKpiLoading ? (
            <KpiListSkeleton count={4} />
          ) : (
            <KpiList>
              <MetricRow
                icon={<Phone className="h-4 w-4" aria-hidden="true" />}
                title="Chiamate oggi"
                value={String(callsToday)}
                subtitle="Le tue chiamate registrate"
                tone={callsToday > 0 ? 'positive' : 'neutral'}
                onClick={() => navigate('/contacts')}
                ariaLabel="Apri contatti"
              />
              <MetricRow
                icon={<Ticket className="h-4 w-4" aria-hidden="true" />}
                title="Ticket assegnati"
                value={String(myTickets)}
                subtitle="Da gestire (aperti / in lavorazione)"
                tone={ticketsTone}
                invertTrend
                onClick={() => navigate('/tickets')}
                ariaLabel="Apri i tuoi ticket"
              />
              <MetricRow
                icon={<Calendar className="h-4 w-4" aria-hidden="true" />}
                title="Appuntamenti oggi"
                value={String(appointmentsToday)}
                subtitle="Programmati da te"
                onClick={() => navigate('/appointments/calendar')}
                ariaLabel="Apri calendario"
              />
              <MetricRow
                icon={<Clock className="h-4 w-4" aria-hidden="true" />}
                title="Ricontatti 60 min"
                value={String(upcomingCallbacks.length)}
                subtitle="In coda nei prossimi 60 minuti"
                tone={cbTone}
                invertTrend
              />
            </KpiList>
          )}
        </section>

        {/* Lista ricontatti urgenti */}
        <section>
          <SectionLabel
            trailing={
              <button
                type="button"
                onClick={() => navigate('/contacts')}
                className="press-scale inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary"
                aria-label="Cerca un contatto da chiamare"
              >
                <PhoneCall className="h-3 w-3" aria-hidden="true" />
                Chiama
              </button>
            }
          >
            Ricontatti in arrivo
          </SectionLabel>
          {cbLoading ? (
            <div className="space-y-2.5">
              <ListItemSkeleton />
              <ListItemSkeleton />
            </div>
          ) : upcomingCallbacks.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Nessun ricontatto in coda"
              description="Non ci sono ricontatti programmati nei prossimi 60 minuti."
            />
          ) : (
            <ul className="space-y-2" role="list" aria-label="Ricontatti nei prossimi 60 minuti">
              {upcomingCallbacks.map((cb: { id: string; run_at: string; contact_id: string | null }) => {
                const runAt = new Date(cb.run_at);
                const minutesAway = Math.max(
                  0,
                  Math.round((runAt.getTime() - Date.now()) / 60000),
                );
                const urgent = minutesAway <= 10;
                const time = runAt.toLocaleTimeString('it-IT', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <li key={cb.id}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(cb.contact_id ? `/contacts/${cb.contact_id}` : '/contacts')
                      }
                      aria-label={`Ricontatto fra ${minutesAway} minuti alle ${time}`}
                      className="press-scale w-full rounded-2xl border border-border/60 bg-card p-3 text-left shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex w-14 shrink-0 flex-col items-center justify-center text-center">
                          <span className="text-[10px] font-medium uppercase text-muted-foreground">
                            ore
                          </span>
                          <span className="text-base font-semibold leading-none tabular-nums">
                            {time}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            Ricontatto #{cb.id.slice(0, 8)}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            Tocca per aprire il contatto
                          </p>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                            urgent
                              ? 'bg-danger/10 text-danger'
                              : 'bg-warning/10 text-warning',
                          )}
                        >
                          {minutesAway} min
                        </span>
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
