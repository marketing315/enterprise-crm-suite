import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { MetaCapiEvent, MetaCapiStatus } from "@/types/capi";

interface CapiEventSummary {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
}

export function useCapiEvents(status?: MetaCapiStatus, limit = 50) {
  const { currentBrand } = useBrand();

  return useQuery<MetaCapiEvent[]>({
    queryKey: ["capi-events", currentBrand?.id, status, limit],
    queryFn: async () => {
      if (!currentBrand?.id) return [];

      let query = supabase
        .from("meta_capi_event_queue")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as MetaCapiEvent[];
    },
    enabled: !!currentBrand?.id,
  });
}

export function useCapiEventsSummary() {
  const { currentBrand } = useBrand();

  return useQuery<CapiEventSummary>({
    queryKey: ["capi-events-summary", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) {
        return { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0 };
      }

      const { data, error } = await supabase
        .from("meta_capi_event_queue")
        .select("status")
        .eq("brand_id", currentBrand.id);

      if (error) throw error;

      const summary: CapiEventSummary = {
        total: data?.length || 0,
        pending: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
      };

      for (const event of data || []) {
        const status = event.status as MetaCapiStatus;
        if (status === "pending" || status === "processing") summary.pending++;
        else if (status === "sent") summary.sent++;
        else if (status === "failed") summary.failed++;
        else if (status === "skipped") summary.skipped++;
      }

      return summary;
    },
    enabled: !!currentBrand?.id,
  });
}
