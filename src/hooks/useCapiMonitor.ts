import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useBrandFilter } from "@/hooks/useBrandFilter";

export interface CapiEvent {
  id: string;
  brand_id: string;
  event_name: string;
  event_id: string;
  event_time: string;
  contact_id: string | null;
  deal_id: string | null;
  lead_event_id: string | null;
  consent_snapshot: boolean;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  contact_name: string;
}

export interface CapiSummary {
  total_events: number;
  pending_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  processing_count: number;
  avg_attempts: number;
  lead_events: number;
  purchase_events: number;
}

export function useCapiEventsSummary(from: string, to: string) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();
  const brandIds = getBrandIds();

  return useQuery({
    queryKey: ["capi-summary", getQueryKeyBrand(), from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("capi_events_summary", {
        p_brand_ids: brandIds,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      const row = (data as any)?.[0] ?? data;
      return row as CapiSummary;
    },
    enabled: isQueryEnabled(),
  });
}

export function useCapiEventsList(
  from: string,
  to: string,
  status: string | null,
  eventName: string | null
) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();
  const brandIds = getBrandIds();

  return useQuery({
    queryKey: ["capi-events", getQueryKeyBrand(), from, to, status, eventName],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_capi_events" as any, {
        p_brand_ids: brandIds,
        p_from: from,
        p_to: to,
        p_status: status,
        p_event_name: eventName,
        p_limit: 200,
      });
      if (error) throw error;
      return (data as any as CapiEvent[]) ?? [];
    },
    enabled: isQueryEnabled(),
  });
}
