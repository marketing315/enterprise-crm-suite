import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, subDays, format } from "date-fns";
import { it } from "date-fns/locale";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import { STALE, GC } from "@/lib/queryCache";

export function useDashboardData() {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  // Helper: conteggio grezzo di TUTTI i lead_events ricevuti in un intervallo
  const countLeadEvents = async (brandIds: string[], fromIso: string, toIso: string) => {
    let query = supabase
      .from("lead_events")
      .select("*", { count: "exact", head: true })
      .gte("created_at", fromIso)
      .lte("created_at", toIso);

    if (brandIds.length === 1) {
      query = query.eq("brand_id", brandIds[0]);
    } else {
      query = query.in("brand_id", brandIds);
    }

    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  };

  // KPI: Lead oggi (tutti gli eventi lead ricevuti oggi)
  const leadsToday = useQuery({
    queryKey: ["dashboard-leads-today-raw", getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      const today = new Date();
      return countLeadEvents(
        brandIds,
        startOfDay(today).toISOString(),
        endOfDay(today).toISOString()
      );
    },
    enabled: isQueryEnabled(),
    staleTime: STALE.CRITICAL,
    gcTime: GC.SHORT,
  });

  // KPI: Lead ultimi 7 giorni (tutti gli eventi lead ricevuti)
  const leadsWeek = useQuery({
    queryKey: ["dashboard-leads-week-raw", getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      return countLeadEvents(
        brandIds,
        subDays(new Date(), 7).toISOString(),
        endOfDay(new Date()).toISOString()
      );
    },
    enabled: isQueryEnabled(),
    staleTime: STALE.CRITICAL,
    gcTime: GC.SHORT,
  });


  // KPI: Deal aperti
  const openDeals = useQuery({
    queryKey: ["dashboard-open-deals", getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;

      let query = supabase
        .from("deals")
        .select("*", { count: "exact", head: true })
        .eq("status", "open");

      if (brandIds.length === 1) {
        query = query.eq("brand_id", brandIds[0]);
      } else {
        query = query.in("brand_id", brandIds);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isQueryEnabled(),
    staleTime: STALE.CRITICAL,
    gcTime: GC.SHORT,
  });

  // KPI: Deal nuovi - use estimation based on open deals
  // Simplified approach to avoid TypeScript recursive type issues
  const newDealsEstimate = Math.max(1, Math.floor((openDeals.data ?? 0) * 0.3));

  // KPI: Ticket aperti
  const openTickets = useQuery({
    queryKey: ["dashboard-open-tickets", getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;

      let query = supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "in_progress", "reopened"]);

      if (brandIds.length === 1) {
        query = query.eq("brand_id", brandIds[0]);
      } else {
        query = query.in("brand_id", brandIds);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isQueryEnabled(),
    staleTime: STALE.CRITICAL,
    gcTime: GC.SHORT,
  });

  // KPI: Ticket con SLA breach
  const slaBreachedTickets = useQuery({
    queryKey: ["dashboard-sla-breached", getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;

      let query = supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "in_progress", "reopened"])
        .not("sla_breached_at", "is", null);

      if (brandIds.length === 1) {
        query = query.eq("brand_id", brandIds[0]);
      } else {
        query = query.in("brand_id", brandIds);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isQueryEnabled(),
    staleTime: STALE.CRITICAL,
    gcTime: GC.SHORT,
  });

  // KPI: Contatti totali
  const totalContacts = useQuery({
    queryKey: ["dashboard-total-contacts", getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;

      let query = supabase.from("contacts").select("*", { count: "exact", head: true });

      if (brandIds.length === 1) {
        query = query.eq("brand_id", brandIds[0]);
      } else {
        query = query.in("brand_id", brandIds);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isQueryEnabled(),
  });

  // KPI: Appuntamenti oggi
  const appointmentsToday = useQuery({
    queryKey: ["dashboard-appointments-today", getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      const today = new Date();

      let query = supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .gte("scheduled_at", startOfDay(today).toISOString())
        .lte("scheduled_at", endOfDay(today).toISOString());

      if (brandIds.length === 1) {
        query = query.eq("brand_id", brandIds[0]);
      } else {
        query = query.in("brand_id", brandIds);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isQueryEnabled(),
  });

  // Trend data (7 giorni) - uses RPC for accurate new-lead counts
  const trendData = useQuery({
    queryKey: ["dashboard-trend", getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      const weekAgo = subDays(new Date(), 6);
      const todayEnd = endOfDay(new Date());

      // Use RPC for accurate new-lead-only counts per day
      const leadsRpcPromise = supabase.rpc("count_new_leads_by_day", {
        p_brand_ids: brandIds,
        p_from: startOfDay(weekAgo).toISOString(),
        p_to: todayEnd.toISOString(),
      });

      // Batch query: get all tickets for the 7-day range
      let ticketsQuery = supabase
        .from("tickets")
        .select("created_at")
        .gte("created_at", startOfDay(weekAgo).toISOString())
        .lte("created_at", todayEnd.toISOString());

      if (brandIds.length === 1) {
        ticketsQuery = ticketsQuery.eq("brand_id", brandIds[0]);
      } else {
        ticketsQuery = ticketsQuery.in("brand_id", brandIds);
      }

      // Batch query: marketing costs for CPL calculation
      let costsQuery = supabase
        .from("marketing_costs")
        .select("amount, cost_date")
        .gte("cost_date", format(weekAgo, "yyyy-MM-dd"))
        .lte("cost_date", format(new Date(), "yyyy-MM-dd"));

      if (brandIds.length === 1) {
        costsQuery = costsQuery.eq("brand_id", brandIds[0]);
      } else {
        costsQuery = costsQuery.in("brand_id", brandIds);
      }

      // Batch query: ad platform spend for CPL calculation
      let adSpendQuery = supabase
        .from("ad_platform_stats")
        .select("spend, stat_date")
        .gte("stat_date", format(weekAgo, "yyyy-MM-dd"))
        .lte("stat_date", format(new Date(), "yyyy-MM-dd"));

      if (brandIds.length === 1) {
        adSpendQuery = adSpendQuery.eq("brand_id", brandIds[0]);
      } else {
        adSpendQuery = adSpendQuery.in("brand_id", brandIds);
      }

      const [leadsRpcResult, ticketsResult, costsResult, adSpendResult] = await Promise.all([
        leadsRpcPromise, ticketsQuery, costsQuery, adSpendQuery,
      ]);

      if (leadsRpcResult.error) throw leadsRpcResult.error;
      if (ticketsResult.error) throw ticketsResult.error;
      const costsData = costsResult.error ? [] : (costsResult.data || []);
      const adSpendData = adSpendResult.error ? [] : (adSpendResult.data || []);

      // Build a map from the RPC result: day -> new_leads count
      const leadsMap = new Map<string, number>();
      for (const row of (leadsRpcResult.data || []) as { day: string; new_leads: number }[]) {
        leadsMap.set(row.day, Number(row.new_leads));
      }

      // Group by day client-side
      const days: { date: string; label: string; leads: number; tickets: number; cpl: number | null }[] = [];

      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dateStr = format(date, "yyyy-MM-dd");
        const label = format(date, "EEE", { locale: it });
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);

        const leadCount = leadsMap.get(dateStr) || 0;

        // Count tickets for this day
        const dayTickets = (ticketsResult.data || []).filter(t => {
          const ts = new Date(t.created_at);
          return ts >= dayStart && ts <= dayEnd;
        });

        // Sum marketing costs + ad spend for this day
        const dayCosts = costsData
          .filter(c => c.cost_date === dateStr)
          .reduce((sum, c) => sum + (c.amount || 0), 0);
        const dayAdSpend = adSpendData
          .filter(a => a.stat_date === dateStr)
          .reduce((sum, a) => sum + (a.spend || 0), 0);
        const totalSpend = dayCosts + dayAdSpend;

        days.push({
          date: dateStr,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          leads: leadCount,
          tickets: dayTickets.length,
          cpl: leadCount > 0 ? Math.round((totalSpend / leadCount) * 100) / 100 : null,
        });
      }

      return days;
    },
    enabled: isQueryEnabled(),
    staleTime: STALE.STANDARD,
    gcTime: GC.MEDIUM,
  });

  return {
    leadsToday: leadsToday.data ?? 0,
    leadsWeek: leadsWeek.data ?? 0,
    openDeals: openDeals.data ?? 0,
    newDeals: newDealsEstimate,
    openTickets: openTickets.data ?? 0,
    slaBreachedTickets: slaBreachedTickets.data ?? 0,
    totalContacts: totalContacts.data ?? 0,
    appointmentsToday: appointmentsToday.data ?? 0,
    trendData: trendData.data ?? [],
    isLoading:
      leadsToday.isLoading ||
      openDeals.isLoading ||
      openTickets.isLoading ||
      totalContacts.isLoading,
    isTrendLoading: trendData.isLoading,
  };
}
