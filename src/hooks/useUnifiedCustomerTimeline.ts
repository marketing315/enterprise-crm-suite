import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UnifiedTimelineEvent {
  source: string;
  event_id: string;
  occurred_at: string;
  actor_display_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string | null;
  metadata: Record<string, unknown> | null;
}

export function useUnifiedCustomerTimeline(contactId: string | null, limit = 200) {
  return useQuery({
    queryKey: ["unified-customer-timeline", contactId, limit],
    queryFn: async (): Promise<UnifiedTimelineEvent[]> => {
      if (!contactId) return [];
      const { data, error } = await supabase.rpc("get_unified_customer_timeline", {
        p_contact_id: contactId,
        p_limit: limit,
      });
      if (error) throw error;
      return (data || []) as unknown as UnifiedTimelineEvent[];
    },
    enabled: !!contactId,
    staleTime: 1000 * 30,
  });
}
