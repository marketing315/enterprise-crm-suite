import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, subDays, format } from "date-fns";
import { it } from "date-fns/locale";
import { useBrandFilter } from "@/hooks/useBrandFilter";

export function useDashboardData() {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  // KPI: Lead oggi (contatti unici, non eventi)
  const leadsToday = useQuery({
    queryKey: ["dashboard-leads-today", getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      const today = new Date();

      // Get unique contact_ids from lead_events for today
      let query = supabase
        .from("lead_events")
        .select("contact_id")
        .gte("received_at", startOfDay(today).toISOString())
        .lte("received_at", endOfDay(today).toISOString())
        .not("contact_id", "is", null);

      if (brandIds.length === 1) {
        query = query.eq("brand_id", brandIds[0]);
      } else {
        query = query.in("brand_id", brandIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Count unique contacts
      const uniqueContacts = new Set(data?.map(e => e.contact_id) || []);
      return uniqueContacts.size;
    },
    enabled: isQueryEnabled(),
    refetchInterval: 30000,
  });

  // KPI: Lead ultimi 7 giorni (contatti unici, non eventi)
  const leadsWeek = useQuery({
    queryKey: ["dashboard-leads-week", getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;
      const weekAgo = subDays(new Date(), 7);

      let query = supabase
        .from("lead_events")
        .select("contact_id")
        .gte("received_at", weekAgo.toISOString())
        .not("contact_id", "is", null);

      if (brandIds.length === 1) {
        query = query.eq("brand_id", brandIds[0]);
      } else {
        query = query.in("brand_id", brandIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Count unique contacts
      const uniqueContacts = new Set(data?.map(e => e.contact_id) || []);
      return uniqueContacts.size;
    },
    enabled: isQueryEnabled(),
    refetchInterval: 60000,
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
    refetchInterval: 30000,
  });

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
    refetchInterval: 30000,
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
    refetchInterval: 30000,
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
    refetchInterval: 60000,
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
    refetchInterval: 60000,
  });

  // Trend data (7 giorni)
  const trendData = useQuery({
    queryKey: ["dashboard-trend", getQueryKeyBrand()],
    queryFn: async () => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      const days: { date: string; label: string; leads: number; tickets: number }[] = [];

      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dateStr = format(date, "yyyy-MM-dd");
        const label = format(date, "EEE", { locale: it });

        // Count unique contacts for this day (not events)
        let leadsQuery = supabase
          .from("lead_events")
          .select("contact_id")
          .gte("received_at", startOfDay(date).toISOString())
          .lte("received_at", endOfDay(date).toISOString())
          .not("contact_id", "is", null);

        if (brandIds.length === 1) {
          leadsQuery = leadsQuery.eq("brand_id", brandIds[0]);
        } else {
          leadsQuery = leadsQuery.in("brand_id", brandIds);
        }

        const { data: leadsData } = await leadsQuery;
        const leadsCount = new Set(leadsData?.map(e => e.contact_id) || []).size;

        // Count tickets for this day
        let ticketsQuery = supabase
          .from("tickets")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startOfDay(date).toISOString())
          .lte("created_at", endOfDay(date).toISOString());

        if (brandIds.length === 1) {
          ticketsQuery = ticketsQuery.eq("brand_id", brandIds[0]);
        } else {
          ticketsQuery = ticketsQuery.in("brand_id", brandIds);
        }

        const { count: ticketsCount } = await ticketsQuery;

        days.push({
          date: dateStr,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          leads: leadsCount,
          tickets: ticketsCount || 0,
        });
      }

      return days;
    },
    enabled: isQueryEnabled(),
    refetchInterval: 120000,
  });

  return {
    leadsToday: leadsToday.data ?? 0,
    leadsWeek: leadsWeek.data ?? 0,
    openDeals: openDeals.data ?? 0,
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
