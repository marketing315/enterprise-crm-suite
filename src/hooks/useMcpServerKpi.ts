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
