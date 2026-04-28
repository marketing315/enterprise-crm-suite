import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SloDefinition {
  id: string;
  name: string;
  description: string | null;
  service_name: string;
  metric_type: string;
  target_percentage: number;
  window_days: number;
  is_active: boolean;
}

export interface SloMeasurement {
  id: string;
  slo_id: string;
  measured_at: string;
  good_events: number;
  total_events: number;
  current_sli: number | null;
  error_budget_remaining: number | null;
  burn_rate_1h: number | null;
  burn_rate_6h: number | null;
  burn_rate_24h: number | null;
}

export interface DependencyItem {
  id: string;
  package_name: string;
  current_version: string;
  is_dev_dependency: boolean;
  has_vulnerability: boolean;
  vulnerability_severity: string | null;
  last_scanned_at: string;
}

export interface TraceEvent {
  id: string;
  trace_id: string;
  span_id: string;
  service_name: string;
  operation_name: string;
  started_at: string;
  duration_ms: number;
  status_code: string;
  http_status: number | null;
  error_message: string | null;
}

export const useSloDefinitions = () =>
  useQuery({
    queryKey: ["slo-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slo_definitions")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as SloDefinition[];
    },
  });

export const useLatestSloMeasurements = () =>
  useQuery({
    queryKey: ["slo-measurements-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slo_measurements")
        .select("*")
        .order("measured_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      // pick latest per slo_id
      const map = new Map<string, SloMeasurement>();
      for (const m of (data ?? []) as SloMeasurement[]) {
        if (!map.has(m.slo_id)) map.set(m.slo_id, m);
      }
      return Array.from(map.values());
    },
    refetchInterval: 60_000,
  });

export const useDependencyInventory = () =>
  useQuery({
    queryKey: ["dependency-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dependency_inventory")
        .select("*")
        .order("has_vulnerability", { ascending: false })
        .order("package_name")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as DependencyItem[];
    },
  });

export const useRecentTraces = (serviceName?: string) =>
  useQuery({
    queryKey: ["trace-events", serviceName ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("trace_events")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(500);
      if (serviceName) q = q.eq("service_name", serviceName);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TraceEvent[];
    },
    refetchInterval: 30_000,
  });

export interface RedMetrics {
  service: string;
  rate_per_min: number;
  error_pct: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  total: number;
}

export const useRedMetrics = (windowMinutes = 60) =>
  useQuery({
    queryKey: ["red-metrics", windowMinutes],
    queryFn: async (): Promise<RedMetrics[]> => {
      const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
      const { data, error } = await supabase
        .from("trace_events")
        .select("service_name, duration_ms, status_code, started_at")
        .gte("started_at", since)
        .limit(10_000);
      if (error) throw error;

      const groups = new Map<string, { durations: number[]; errors: number }>();
      for (const r of data ?? []) {
        const g = groups.get(r.service_name) ?? { durations: [], errors: 0 };
        g.durations.push(r.duration_ms);
        if (r.status_code === "error" || r.status_code === "timeout") g.errors += 1;
        groups.set(r.service_name, g);
      }

      const pct = (sorted: number[], p: number) => {
        if (!sorted.length) return 0;
        const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
        return sorted[idx];
      };

      return Array.from(groups.entries()).map(([service, g]) => {
        const sorted = [...g.durations].sort((a, b) => a - b);
        const total = g.durations.length;
        return {
          service,
          rate_per_min: total / windowMinutes,
          error_pct: total ? (g.errors / total) * 100 : 0,
          p50_ms: pct(sorted, 50),
          p95_ms: pct(sorted, 95),
          p99_ms: pct(sorted, 99),
          total,
        };
      }).sort((a, b) => b.total - a.total);
    },
    refetchInterval: 30_000,
  });
