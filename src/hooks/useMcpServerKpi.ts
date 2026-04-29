import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface McpServerKpi {
  window_hours: number;
  total_requests: number;
  error_count: number;
  auth_failures: number;
  error_rate: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  top_tools: Array<{ name: string; calls: number; p95_ms: number; errors: number }>;
  top_errors: Array<{ code: string; occurrences: number }>;
  active_tokens: number;
  kill_switch_active: boolean;
}

export interface McpActiveToken {
  id: string;
  name: string;
  kind: string;
  user_id: string | null;
  scopes: string[];
  rate_limit_per_min: number;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  requests_24h: number;
  errors_24h: number;
  avg_latency_ms: number;
}

export function useMcpServerKpi(windowHours = 24) {
  return useQuery({
    queryKey: ["mcp-server-kpi", windowHours],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mcp_server_kpi", { p_window_hours: windowHours });
      if (error) throw error;
      return data as unknown as McpServerKpi;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useMcpActiveTokens() {
  return useQuery({
    queryKey: ["mcp-active-tokens"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mcp_active_tokens");
      if (error) throw error;
      return (data ?? []) as McpActiveToken[];
    },
    staleTime: 30_000,
  });
}

export function useMcpRequestLog(limit = 100) {
  return useQuery({
    queryKey: ["mcp-request-log", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcp_request_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });
}

export interface McpSloAlert {
  id: string;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  window_start: string;
  window_end: string;
  metric_value: number | null;
  threshold: number | null;
  details: Record<string, unknown>;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

export function useMcpSloAlerts(limit = 50) {
  return useQuery({
    queryKey: ["mcp-slo-alerts", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mcp_recent_alerts", { p_limit: limit });
      if (error) throw error;
      return (data ?? []) as McpSloAlert[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useAcknowledgeMcpAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase.rpc("mcp_acknowledge_alert", { p_alert_id: alertId });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-slo-alerts"] }),
  });
}

export function useToggleMcpKillSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase.rpc("mcp_toggle_server_kill_switch", { p_enabled: enabled });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mcp-server-kpi"] });
    },
  });
}

// ---------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------
export interface McpSubscription {
  id: string;
  token_id: string;
  token_name: string;
  uri: string;
  resource_type: string | null;
  created_at: string;
  last_notified_at: string | null;
}

export interface McpResourceChange {
  uri: string;
  resource_type: string;
  change_type: string;
  occurred_at: string;
}

export interface McpSubscriptionsKpi {
  active_subscriptions: number;
  unique_tokens: number;
  changes_24h: number;
  by_resource_type: Array<{ resource_type: string; subs: number; changes_24h: number }>;
}

export function useMcpSubscriptions() {
  return useQuery({
    queryKey: ["mcp-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcp_subscriptions")
        .select("id, token_id, uri, resource_type, created_at, last_notified_at, mcp_access_tokens(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        token_id: r.token_id,
        token_name: r.mcp_access_tokens?.name ?? "—",
        uri: r.uri,
        resource_type: r.resource_type,
        created_at: r.created_at,
        last_notified_at: r.last_notified_at,
      })) as McpSubscription[];
    },
    staleTime: 30_000,
  });
}

export function useMcpRecentChanges(limit = 50) {
  return useQuery({
    queryKey: ["mcp-resource-changes", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcp_resource_changes")
        .select("uri, resource_type, change_type, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as McpResourceChange[];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useMcpSubscriptionsKpi() {
  return useQuery({
    queryKey: ["mcp-subscriptions-kpi"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ data: subs }, { data: changes }] = await Promise.all([
        supabase.from("mcp_subscriptions").select("token_id, resource_type").limit(1000),
        supabase
          .from("mcp_resource_changes")
          .select("resource_type")
          .gte("occurred_at", since)
          .limit(1000),
      ]);
      const subsArr = subs ?? [];
      const changesArr = changes ?? [];
      const byType = new Map<string, { subs: number; changes_24h: number }>();
      for (const s of subsArr) {
        const k = s.resource_type ?? "unknown";
        if (!byType.has(k)) byType.set(k, { subs: 0, changes_24h: 0 });
        byType.get(k)!.subs += 1;
      }
      for (const c of changesArr) {
        const k = c.resource_type ?? "unknown";
        if (!byType.has(k)) byType.set(k, { subs: 0, changes_24h: 0 });
        byType.get(k)!.changes_24h += 1;
      }
      return {
        active_subscriptions: subsArr.length,
        unique_tokens: new Set(subsArr.map((s: any) => s.token_id)).size,
        changes_24h: changesArr.length,
        by_resource_type: Array.from(byType.entries())
          .map(([resource_type, v]) => ({ resource_type, ...v }))
          .sort((a, b) => b.subs - a.subs),
      } as McpSubscriptionsKpi;
    },
    staleTime: 30_000,
  });
}

