import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandFilter } from "@/hooks/useBrandFilter";

export interface Ga4DayStat {
  id: string;
  brand_id: string;
  stat_date: string;
  sessions: number;
  pageviews: number;
  users: number;
  new_users: number;
  bounce_rate: number;
  avg_session_duration: number;
  conversions: number;
  conversion_events: Array<{ event: string; count: number }>;
  top_pages: Array<{ page: string; views: number }>;
  top_sources: Array<{ source: string; medium: string; sessions: number }>;
  top_campaigns: Array<{ campaign: string; sessions: number; conversions: number }>;
  imported_at: string;
}

export interface Ga4Summary {
  sessions: number;
  pageviews: number;
  users: number;
  new_users: number;
  bounce_rate: number;
  avg_session_duration: number;
  conversions: number;
}

export function useGa4Stats(fromDate: string, toDate: string) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: ["ga4-stats", getQueryKeyBrand(), fromDate, toDate],
    queryFn: async (): Promise<Ga4DayStat[]> => {
      const brandIds = getBrandIds();
      if (!brandIds.length) return [];

      const { data, error } = await supabase
        .from("ga4_stats")
        .select("*")
        .in("brand_id", brandIds)
        .gte("stat_date", fromDate)
        .lte("stat_date", toDate)
        .order("stat_date", { ascending: true });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        ...row,
        conversion_events: row.conversion_events || [],
        top_pages: row.top_pages || [],
        top_sources: row.top_sources || [],
        top_campaigns: row.top_campaigns || [],
      }));
    },
    enabled: isQueryEnabled(),
  });
}

export function useGa4Summary(fromDate: string, toDate: string) {
  const { data: stats, isLoading } = useGa4Stats(fromDate, toDate);

  const summary: Ga4Summary = {
    sessions: 0,
    pageviews: 0,
    users: 0,
    new_users: 0,
    bounce_rate: 0,
    avg_session_duration: 0,
    conversions: 0,
  };

  if (stats?.length) {
    for (const s of stats) {
      summary.sessions += s.sessions;
      summary.pageviews += s.pageviews;
      summary.users += s.users;
      summary.new_users += s.new_users;
      summary.conversions += s.conversions;
      summary.bounce_rate += s.bounce_rate;
      summary.avg_session_duration += s.avg_session_duration;
    }
    summary.bounce_rate = summary.bounce_rate / stats.length;
    summary.avg_session_duration = summary.avg_session_duration / stats.length;
  }

  return { summary, isLoading };
}

export function useGa4SyncTrigger() {
  const triggerSync = async (brandId: string, from?: string, to?: string) => {
    const { data, error } = await supabase.functions.invoke("ga4-stats-sync", {
      body: { brand_id: brandId, from, to },
    });
    if (error) throw error;
    return data;
  };

  return { triggerSync };
}
