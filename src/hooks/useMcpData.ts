import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── Types ──────────────────────────────────────────────
export type McpServerStatus = "active" | "disabled" | "degraded" | "maintenance";
export type McpTransport = "stdio" | "streamable_http" | "sse";
export type McpToolCategory = "read" | "write" | "sensitive_write";
export type McpPolicyAction = "allow" | "deny" | "require_approval";
export type McpExecutionStatus = "pending_approval" | "approved" | "rejected" | "running" | "success" | "failed" | "failed_transient" | "cancelled" | "timeout";
export type McpApprovalDecision = "approved" | "rejected" | "expired";

export interface McpServer {
  id: string;
  name: string;
  version: string;
  transport: McpTransport;
  endpoint: string | null;
  status: McpServerStatus;
  capabilities_json: Record<string, unknown>;
  description: string | null;
  owner_user_id: string | null;
  kill_switch: boolean;
  canary_brand_ids: string[];
  canary_role_whitelist: string[];
  created_at: string;
  updated_at: string;
}

export interface McpTool {
  id: string;
  server_id: string;
  name: string;
  description: string | null;
  category: McpToolCategory;
  input_schema_json: Record<string, unknown>;
  output_schema_json: Record<string, unknown>;
  enabled: boolean;
  requires_approval: boolean;
  rate_limit_per_min: number | null;
  created_at: string;
  updated_at: string;
}

export interface McpResource {
  id: string;
  server_id: string;
  name: string;
  uri_template: string;
  description: string | null;
  schema_json: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface McpPolicy {
  id: string;
  role: string;
  brand_scope: string | null;
  tool_pattern: string;
  action: McpPolicyAction;
  priority: number;
  description: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface McpExecution {
  id: string;
  request_id: string;
  idempotency_key: string | null;
  actor_type: string;
  actor_id: string | null;
  brand_id: string | null;
  server_id: string | null;
  tool_name: string | null;
  resource_uri: string | null;
  decision: McpPolicyAction | null;
  status: McpExecutionStatus;
  latency_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface McpApproval {
  id: string;
  execution_id: string;
  required_by_policy: string | null;
  approver_user_id: string | null;
  decision: McpApprovalDecision | null;
  reason: string | null;
  decided_at: string | null;
  expires_at: string | null;
  created_at: string;
}

// ── Queries ────────────────────────────────────────────
export function useMcpServers() {
  return useQuery({
    queryKey: ["mcp-servers"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("mcp_servers") as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data || []) as McpServer[];
    },
    staleTime: 60_000,
  });
}

export function useMcpTools(serverId?: string) {
  return useQuery({
    queryKey: ["mcp-tools", serverId],
    queryFn: async () => {
      let q = (supabase.from("mcp_tools") as any).select("*").order("name");
      if (serverId) q = q.eq("server_id", serverId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as McpTool[];
    },
    staleTime: 60_000,
  });
}

export function useMcpResources(serverId?: string) {
  return useQuery({
    queryKey: ["mcp-resources", serverId],
    queryFn: async () => {
      let q = (supabase.from("mcp_resources") as any).select("*").order("name");
      if (serverId) q = q.eq("server_id", serverId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as McpResource[];
    },
    staleTime: 60_000,
  });
}

export function useMcpPolicies() {
  return useQuery({
    queryKey: ["mcp-policies"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("mcp_policies") as any)
        .select("*")
        .order("priority", { ascending: false });
      if (error) throw error;
      return (data || []) as McpPolicy[];
    },
    staleTime: 60_000,
  });
}

export function useMcpExecutions(limit = 50) {
  return useQuery({
    queryKey: ["mcp-executions", limit],
    queryFn: async () => {
      const { data, error } = await (supabase.from("mcp_executions") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as McpExecution[];
    },
    staleTime: 30_000,
  });
}

export function useMcpPendingApprovals() {
  return useQuery({
    queryKey: ["mcp-approvals-pending"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("mcp_approvals") as any)
        .select("*, mcp_executions(*)")
        .is("decision", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as (McpApproval & { mcp_executions: McpExecution })[];
    },
    staleTime: 15_000,
  });
}

// ── Mutations ──────────────────────────────────────────
export function useUpsertMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (server: Partial<McpServer> & { name: string }) => {
      if (server.id) {
        const { error } = await (supabase.from("mcp_servers") as any)
          .update({ ...server, updated_at: new Date().toISOString() })
          .eq("id", server.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("mcp_servers") as any).insert(server);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}

export function useToggleMcpServerKillSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, kill_switch }: { id: string; kill_switch: boolean }) => {
      const { error } = await (supabase.from("mcp_servers") as any)
        .update({ kill_switch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}

export function useToggleMcpTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await (supabase.from("mcp_tools") as any)
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-tools"] }),
  });
}

export function useUpsertMcpPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (policy: Partial<McpPolicy> & { role: string; tool_pattern: string; action: McpPolicyAction }) => {
      if (policy.id) {
        const { error } = await (supabase.from("mcp_policies") as any)
          .update({ ...policy, updated_at: new Date().toISOString() })
          .eq("id", policy.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("mcp_policies") as any).insert(policy);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-policies"] }),
  });
}

export function useDecideMcpApproval() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, decision, reason }: { id: string; decision: McpApprovalDecision; reason?: string }) => {
      const { error } = await (supabase.from("mcp_approvals") as any)
        .update({
          decision,
          reason: reason || null,
          approver_user_id: user?.id,
          decided_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mcp-approvals-pending"] });
      qc.invalidateQueries({ queryKey: ["mcp-executions"] });
    },
  });
}
