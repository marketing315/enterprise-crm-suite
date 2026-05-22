/**
 * F5.5 — hooks per regole di alert performance e storico eventi.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { untypedClient } from "@/integrations/supabase/untypedClient";
import { useBrand } from "@/contexts/BrandContext";

export type AlertMetric =
  | "cpl"
  | "answer_rate"
  | "deliveries_pct"
  | "negative_sentiment_pct";

export type AlertComparator = "gt" | "lt";
export type AlertSeverity = "info" | "warning" | "critical";

export interface PerformanceAlertRule {
  id: string;
  brand_id: string;
  name: string;
  metric: AlertMetric;
  comparator: AlertComparator;
  threshold: number;
  window_days: number;
  source_filter: Record<string, unknown>;
  severity: AlertSeverity;
  is_active: boolean;
  cooldown_minutes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PerformanceAlertEvent {
  id: string;
  rule_id: string;
  brand_id: string;
  metric: AlertMetric;
  observed_value: number;
  threshold: number;
  comparator: AlertComparator;
  severity: AlertSeverity;
  window_start: string;
  window_end: string;
  details: Record<string, unknown>;
  fired_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export function usePerformanceAlertRules() {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  return useQuery({
    queryKey: ["perf-alert-rules", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<PerformanceAlertRule[]> => {
      const { data, error } = await supabase
        .from("performance_alert_rules" as never)
        .select("*")
        .eq("brand_id", brandId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as PerformanceAlertRule[];
    },
    staleTime: 30_000,
  });
}

export function usePerformanceAlertEvents(limit = 100) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  return useQuery({
    queryKey: ["perf-alert-events", brandId, limit],
    enabled: !!brandId,
    queryFn: async (): Promise<PerformanceAlertEvent[]> => {
      const { data, error } = await supabase
        .from("performance_alert_events" as never)
        .select("*")
        .eq("brand_id", brandId!)
        .order("fired_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as PerformanceAlertEvent[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertAlertRule() {
  const qc = useQueryClient();
  const { currentBrand } = useBrand();
  return useMutation({
    mutationFn: async (rule: Partial<PerformanceAlertRule> & { id?: string }) => {
      if (!currentBrand?.id) throw new Error("Nessun brand selezionato");
      const payload = { ...rule, brand_id: currentBrand.id };
      const query = rule.id
        ? untypedClient.from("performance_alert_rules").update(payload).eq("id", rule.id)
        : untypedClient.from("performance_alert_rules").insert(payload);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["perf-alert-rules"] }),
  });
}

export function useDeleteAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("performance_alert_rules" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["perf-alert-rules"] }),
  });
}

export function useAcknowledgeAlertEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("performance_alert_events" as never)
        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user?.id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["perf-alert-events"] }),
  });
}

export const METRIC_LABEL: Record<AlertMetric, string> = {
  cpl: "CPL (€)",
  answer_rate: "% Risposta chiamate",
  deliveries_pct: "% Consegne / ordini",
  negative_sentiment_pct: "% Sentiment negativo",
};

export const METRIC_HINT: Record<AlertMetric, string> = {
  cpl: "Spesa totale / lead nel periodo. Tipico: gt 50",
  answer_rate: "Chiamate risposte / totali ×100. Tipico: lt 70",
  deliveries_pct: "Consegne / ordini firmati ×100. Tipico: lt 80",
  negative_sentiment_pct: "Chiamate con sentiment < -0.3. Tipico: gt 20",
};
