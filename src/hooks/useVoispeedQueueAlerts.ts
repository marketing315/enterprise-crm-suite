/**
 * F6 Step #7 — Hook regole/eventi alert code VoiSpeed.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type VqarMetric =
  | "calls_waiting"
  | "longest_wait_seconds"
  | "service_level_pct"
  | "abandoned_15m"
  | "agents_available";
export type VqarComparator = "gt" | "lt";
export type VqarSeverity = "info" | "warning" | "critical";

export interface VoispeedQueueAlertRule {
  id: string;
  brand_id: string;
  name: string;
  queue_name: string | null;
  metric: VqarMetric;
  comparator: VqarComparator;
  threshold: number;
  severity: VqarSeverity;
  cooldown_minutes: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoispeedQueueAlertEvent {
  id: string;
  rule_id: string;
  brand_id: string;
  queue_name: string;
  metric: VqarMetric;
  comparator: VqarComparator;
  observed_value: number;
  threshold: number;
  severity: VqarSeverity;
  fired_at: string;
  snapshot_ts: string | null;
}

export function useVoispeedQueueAlertRules(brandId: string | null) {
  return useQuery({
    queryKey: ["vqar-rules", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<VoispeedQueueAlertRule[]> => {
      const { data, error } = await supabase
        .from("voispeed_queue_alert_rules")
        .select("*")
        .eq("brand_id", brandId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VoispeedQueueAlertRule[];
    },
  });
}

export function useVoispeedQueueAlertEvents(brandId: string | null, limit = 100) {
  return useQuery({
    queryKey: ["vqae-events", brandId, limit],
    enabled: !!brandId,
    queryFn: async (): Promise<VoispeedQueueAlertEvent[]> => {
      const { data, error } = await supabase
        .from("voispeed_queue_alert_events")
        .select("*")
        .eq("brand_id", brandId!)
        .order("fired_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as VoispeedQueueAlertEvent[];
    },
    refetchInterval: 60_000,
  });
}

export function useUpsertVoispeedQueueAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      rule: Partial<VoispeedQueueAlertRule> & { brand_id: string; name: string; metric: VqarMetric; threshold: number },
    ) => {
      const payload = { ...rule };
      if (payload.id) {
        const { error } = await supabase
          .from("voispeed_queue_alert_rules")
          .update(payload)
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("voispeed_queue_alert_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["vqar-rules", vars.brand_id] }),
  });
}

export function useDeleteVoispeedQueueAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; brand_id: string }) => {
      const { error } = await supabase.from("voispeed_queue_alert_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["vqar-rules", vars.brand_id] }),
  });
}
