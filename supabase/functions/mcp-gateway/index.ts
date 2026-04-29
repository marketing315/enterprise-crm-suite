import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Types ──────────────────────────────────────────
interface ExecuteToolRequest {
  request_id: string;
  agent_id?: string;
  user_id?: string;
  brand_id?: string;
  tool: string;          // "server_name.tool_name" or just "tool_name"
  input: Record<string, unknown>;
  idempotency_key?: string;
}

interface FetchResourceRequest {
  request_id: string;
  user_id?: string;
  brand_id?: string;
  uri: string;
  params?: Record<string, unknown>;
}

interface PolicyRule {
  id: string;
  role: string;
  brand_scope: string | null;
  tool_pattern: string;
  action: "allow" | "deny" | "require_approval";
  priority: number;
  enabled: boolean;
}

// ── Policy Engine ──────────────────────────────────
function matchGlob(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  // Convert glob to regex: "crm.*" → /^crm\..*$/
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function evaluatePolicy(
  policies: PolicyRule[],
  userRoles: string[],
  brandId: string | null,
  toolName: string
): { decision: "allow" | "deny" | "require_approval"; policyId: string | null } {
  // Sort by priority descending (already sorted from DB, but ensure)
  const sorted = [...policies]
    .filter((p) => p.enabled)
    .sort((a, b) => b.priority - a.priority);

  // Deny-first: collect all matching policies, deny wins
  let bestMatch: { action: "allow" | "deny" | "require_approval"; id: string } | null = null;
  let hasDeny = false;

  for (const policy of sorted) {
    // Check role match
    if (!userRoles.includes(policy.role) && policy.role !== "*") continue;
    // Check brand scope
    if (policy.brand_scope && policy.brand_scope !== brandId) continue;
    // Check tool pattern
    if (!matchGlob(policy.tool_pattern, toolName)) continue;

    // Match found
    if (policy.action === "deny") {
      return { decision: "deny", policyId: policy.id };
    }
    if (!bestMatch || policy.priority > (sorted.find(p => p.id === bestMatch!.id)?.priority ?? -1)) {
      bestMatch = { action: policy.action, id: policy.id };
    }
  }

  if (bestMatch) {
    return { decision: bestMatch.action, policyId: bestMatch.id };
  }

  // Default deny if no policy matches
  return { decision: "deny", policyId: null };
}

// ── Idempotency Check ──────────────────────────────
async function checkIdempotency(supabase: any, key: string): Promise<{ isDuplicate: boolean; existingId?: string }> {
  if (!key) return { isDuplicate: false };
  const { data } = await supabase
    .from("mcp_executions")
    .select("id, status")
    .eq("idempotency_key", key)
    .in("status", ["success", "running", "pending_approval"])
    .limit(1)
    .maybeSingle();
  if (data) return { isDuplicate: true, existingId: data.id };
  return { isDuplicate: false };
}

// ── Rate Limit Check (simple in-DB) ────────────────
async function checkRateLimit(supabase: any, toolName: string, serverId: string, limitPerMin: number): Promise<boolean> {
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("mcp_executions")
    .select("id", { count: "exact", head: true })
    .eq("tool_name", toolName)
    .eq("server_id", serverId)
    .gte("created_at", oneMinAgo);
  return (count ?? 0) < limitPerMin;
}

// ── Audit Logger ───────────────────────────────────
async function logExecution(supabase: any, exec: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.from("mcp_executions").insert(exec).select("id").single();
  if (error) console.error("[MCP] audit log error:", error.message);
  return data?.id ?? "unknown";
}

async function updateExecution(supabase: any, id: string, updates: Record<string, unknown>) {
  await supabase.from("mcp_executions").update(updates).eq("id", id);
}

// ── PII Redaction ──────────────────────────────────
function redactPII(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) return obj;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (["password", "secret", "token", "api_key", "apikey", "credit_card", "ssn"].some(s => lower.includes(s))) {
      result[key] = "[REDACTED]";
    } else if (typeof val === "string" && /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(val)) {
      result[key] = val.replace(/(.{2}).*(@.*)/, "$1***$2");
    } else if (typeof val === "object") {
      result[key] = redactPII(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ── CRM Adapter ────────────────────────────────────
async function executeCrmTool(supabase: any, toolName: string, input: Record<string, unknown>, brandId: string | null) {
  const shortName = toolName.replace(/^crm\./, "");

  switch (shortName) {
    case "get_contacts": {
      let q = supabase.from("contacts").select("id, first_name, last_name, email, phone, status, created_at");
      if (brandId) q = q.eq("brand_id", brandId);
      if (input.limit) q = q.limit(Number(input.limit));
      if (input.status) q = q.eq("status", input.status);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw new Error(`CRM error: ${error.message}`);
      return { contacts: data, count: data?.length ?? 0 };
    }
    case "get_deals": {
      let q = supabase.from("deals").select("id, title, value, stage_id, contact_id, created_at");
      if (brandId) q = q.eq("brand_id", brandId);
      if (input.limit) q = q.limit(Number(input.limit));
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw new Error(`CRM error: ${error.message}`);
      return { deals: data, count: data?.length ?? 0 };
    }
    case "get_tickets": {
      let q = supabase.from("tickets").select("id, title, status, priority, assigned_user_id, created_at");
      if (brandId) q = q.eq("brand_id", brandId);
      if (input.status) q = q.eq("status", input.status);
      if (input.limit) q = q.limit(Number(input.limit));
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw new Error(`CRM error: ${error.message}`);
      return { tickets: data, count: data?.length ?? 0 };
    }
    case "get_appointments": {
      let q = supabase.from("appointments").select("id, contact_id, scheduled_at, status, notes");
      if (brandId) q = q.eq("brand_id", brandId);
      if (input.limit) q = q.limit(Number(input.limit));
      const { data, error } = await q.order("scheduled_at", { ascending: false });
      if (error) throw new Error(`CRM error: ${error.message}`);
      return { appointments: data, count: data?.length ?? 0 };
    }
    case "update_ticket_status": {
      if (!input.ticket_id || !input.status) throw new Error("ticket_id and status required");
      const { error } = await supabase
        .from("tickets")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", input.ticket_id);
      if (error) throw new Error(`CRM error: ${error.message}`);
      return { success: true, ticket_id: input.ticket_id, new_status: input.status };
    }
    case "update_deal_stage": {
      if (!input.deal_id || !input.stage_id) throw new Error("deal_id and stage_id required");
      const { error } = await supabase
        .from("deals")
        .update({ stage_id: input.stage_id, updated_at: new Date().toISOString() })
        .eq("id", input.deal_id);
      if (error) throw new Error(`CRM error: ${error.message}`);
      return { success: true, deal_id: input.deal_id, new_stage_id: input.stage_id };
    }
    default:
      throw new Error(`Unknown CRM tool: ${shortName}`);
  }
}

// ── Keplero Adapter ────────────────────────────────
async function executeKepleroTool(toolName: string, input: Record<string, unknown>) {
  const kepleroSecret = Deno.env.get("KEPLERO_API_KEY") || Deno.env.get("KEPLERO_SECRET");
  if (!kepleroSecret) throw new Error("KEPLERO_API_KEY not configured");

  const shortName = toolName.replace(/^keplero\./, "");
  switch (shortName) {
    case "lookup": {
      if (!input.phone && !input.email) throw new Error("phone or email required for lookup");
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const params = new URLSearchParams();
      if (input.phone) params.set("phone", String(input.phone));
      if (input.email) params.set("email", String(input.email));

      const response = await fetch(`${supabaseUrl}/functions/v1/keplero-contact-lookup?${params}`, {
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          "x-keplero-secret": kepleroSecret,
        },
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Keplero lookup failed [${response.status}]: ${err}`);
      }
      return await response.json();
    }
    default:
      throw new Error(`Unknown Keplero tool: ${shortName}`);
  }
}

// ── n8n Adapter ────────────────────────────────────
async function executeN8nTool(toolName: string, input: Record<string, unknown>, brandId: string | null) {
  const shortName = toolName.replace(/^n8n\./, "");
  // n8n tools call the send-n8n-webhook function
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const response = await fetch(`${supabaseUrl}/functions/v1/send-n8n-webhook`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow: shortName,
      brand_id: brandId,
      payload: input,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`n8n workflow failed [${response.status}]: ${err}`);
  }
  return await response.json();
}

// ── Generic HTTP Adapter ───────────────────────────
async function executeHttpTool(endpoint: string, input: Record<string, unknown>, method = "POST") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method !== "GET" ? JSON.stringify(input) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HTTP tool failed [${response.status}]: ${err.slice(0, 500)}`);
    }
    return await response.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("HTTP tool timeout after 30s");
    }
    throw e;
  }
}

// ── Tool Router ────────────────────────────────────
async function routeToolExecution(
  supabase: any,
  toolName: string,
  input: Record<string, unknown>,
  brandId: string | null,
  server: { endpoint: string | null } | null
) {
  // Route by prefix
  if (toolName.startsWith("crm.")) {
    return await executeCrmTool(supabase, toolName, input, brandId);
  }
  if (toolName.startsWith("keplero.")) {
    return await executeKepleroTool(toolName, input);
  }
  if (toolName.startsWith("n8n.")) {
    return await executeN8nTool(toolName, input, brandId);
  }
  // Generic HTTP — requires server endpoint
  if (server?.endpoint) {
    return await executeHttpTool(server.endpoint, { tool: toolName, ...input });
  }
  throw new Error(`No adapter found for tool: ${toolName}`);
}

// ── Main Handler ───────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").filter(Boolean).pop() ?? "";

  // Service client for admin operations (audit, policy reads)
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: support two modes
  //   1) End-user JWT (Authorization: Bearer <supabase-jwt>) → resolve user + roles
  //   2) Service-to-service from mcp-server (x-mcp-internal: <INTERNAL_SERVICE_TOKEN>
  //      + x-mcp-on-behalf-user-id) → trust the upstream caller (mcp-server already
  //      validated the MCP token and resolved identity)
  const internalHeader = req.headers.get("x-mcp-internal") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_SERVICE_TOKEN") ?? "";
  const isInternalCall = !!internalSecret && internalHeader === internalSecret;

  let internalUserId: string;
  let uniqueRoles: string[];
  let userClient: any;

  if (isInternalCall) {
    const onBehalfId = req.headers.get("x-mcp-on-behalf-user-id") ?? "";
    if (!onBehalfId) {
      return json({ error: "Internal call missing x-mcp-on-behalf-user-id" }, 400);
    }
    const { data: userRow } = await serviceClient.from("users").select("id").eq("id", onBehalfId).maybeSingle();
    if (!userRow) return json({ error: "On-behalf user not found" }, 403);
    internalUserId = userRow.id;
    const { data: rolesData } = await serviceClient.from("user_roles").select("role").eq("user_id", internalUserId);
    uniqueRoles = [...new Set((rolesData ?? []).map((r: any) => r.role as string))];
    // For DB queries we can use the service client (RLS bypass) — mcp-server already
    // enforced scope + the gateway will enforce policy below.
    userClient = serviceClient;
  } else {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized: missing token" }, 401);
    }

    userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return json({ error: "Unauthorized: invalid token" }, 401);
    }
    const authUserId = claims.claims.sub as string;

    const { data: userRow } = await serviceClient.from("users").select("id").eq("supabase_auth_id", authUserId).maybeSingle();
    if (!userRow) return json({ error: "User not found" }, 403);
    internalUserId = userRow.id;

    const { data: rolesData } = await serviceClient.from("user_roles").select("role, brand_id").eq("user_id", internalUserId);
    const userRoles = (rolesData ?? []).map((r: any) => r.role as string);
    uniqueRoles = [...new Set(userRoles)];
  }
  // ── GET /catalog (auth-gated) ──────────────────────
  if (req.method === "GET" && path === "catalog") {
    const { data: servers } = await serviceClient.from("mcp_servers").select("*").eq("kill_switch", false).order("name");
    const { data: tools } = await serviceClient.from("mcp_tools").select("*").eq("enabled", true).order("name");
    const { data: resources } = await serviceClient.from("mcp_resources").select("*").eq("enabled", true).order("name");
    return json({ servers: servers ?? [], tools: tools ?? [], resources: resources ?? [] });
  }

  // ── POST /execute-tool ───────────────────────────
  if (req.method === "POST" && path === "execute-tool") {
    let body: ExecuteToolRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.request_id || !body.tool) {
      return json({ error: "request_id and tool are required" }, 400);
    }

    // Brand scope validation
    if (!body.brand_id && !uniqueRoles.includes("admin")) {
      return json({ error: "brand_id required for non-admin users" }, 400);
    }

    // Resolve tool + server from registry
    const toolParts = body.tool.split(".");
    const { data: toolRow } = await serviceClient
      .from("mcp_tools")
      .select("*, mcp_servers(*)")
      .eq("name", toolParts.length > 1 ? toolParts.slice(1).join(".") : body.tool)
      .limit(1)
      .maybeSingle();

    // Check server kill switch
    const server = toolRow?.mcp_servers;
    if (server?.kill_switch) {
      return json({ error: "Server is disabled via kill switch", tool: body.tool }, 503);
    }

    // Canary rollout enforcement
    if (server) {
      const canaryBrands = server.canary_brand_ids ?? [];
      const canaryRoles = server.canary_role_whitelist ?? [];
      if (canaryBrands.length > 0 && (!body.brand_id || !canaryBrands.includes(body.brand_id))) {
        return json({ error: "Server not available for this brand (canary rollout)", tool: body.tool }, 403);
      }
      if (canaryRoles.length > 0 && !canaryRoles.some((r: string) => uniqueRoles.includes(r))) {
        return json({ error: "Server not available for your role (canary rollout)", tool: body.tool }, 403);
      }
    }

    // Idempotency check
    if (body.idempotency_key) {
      const { isDuplicate, existingId } = await checkIdempotency(serviceClient, body.idempotency_key);
      if (isDuplicate) {
        return json({ status: "duplicate", existing_execution_id: existingId });
      }
    }

    // Load policies
    const { data: policies } = await serviceClient
      .from("mcp_policies")
      .select("*")
      .eq("enabled", true)
      .order("priority", { ascending: false });

    // Evaluate policy
    const { decision, policyId } = evaluatePolicy(
      (policies ?? []) as PolicyRule[],
      uniqueRoles,
      body.brand_id ?? null,
      body.tool
    );

    // Create execution log
    const startTime = Date.now();
    const execId = await logExecution(serviceClient, {
      request_id: body.request_id,
      idempotency_key: body.idempotency_key ?? null,
      actor_type: body.agent_id ? "agent" : "user",
      actor_id: internalUserId,
      brand_id: body.brand_id ?? null,
      server_id: server?.id ?? null,
      tool_name: body.tool,
      input_redacted: redactPII(body.input),
      decision,
      policy_id: policyId,
      status: decision === "deny" ? "rejected" : decision === "require_approval" ? "pending_approval" : "running",
    });

    // Deny → return immediately
    if (decision === "deny") {
      return json({ status: "denied", execution_id: execId, policy_id: policyId }, 403);
    }

    // Require approval → create approval record and return
    if (decision === "require_approval") {
      await serviceClient.from("mcp_approvals").insert({
        execution_id: execId,
        required_by_policy: policyId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
      });
      return json({ status: "pending_approval", execution_id: execId, message: "Awaiting human approval" }, 202);
    }

    // Rate limit check
    if (toolRow?.rate_limit_per_min && server?.id) {
      const allowed = await checkRateLimit(serviceClient, body.tool, server.id, toolRow.rate_limit_per_min);
      if (!allowed) {
        await updateExecution(serviceClient, execId, { status: "failed", error_code: "RATE_LIMIT", error_message: "Rate limit exceeded", completed_at: new Date().toISOString(), latency_ms: Date.now() - startTime });
        return json({ error: "Rate limit exceeded", execution_id: execId }, 429);
      }
    }

    // Execute tool
    try {
      const result = await routeToolExecution(userClient, body.tool, body.input, body.brand_id ?? null, server);
      const latency = Date.now() - startTime;
      await updateExecution(serviceClient, execId, {
        status: "success",
        output_redacted: redactPII(result),
        latency_ms: latency,
        completed_at: new Date().toISOString(),
      });
      return json({ status: "success", execution_id: execId, result, latency_ms: latency });
    } catch (err) {
      const latency = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      await updateExecution(serviceClient, execId, {
        status: errMsg.includes("timeout") ? "timeout" : "failed",
        error_code: errMsg.includes("timeout") ? "TIMEOUT" : "EXECUTION_ERROR",
        error_message: errMsg.slice(0, 1000),
        latency_ms: latency,
        completed_at: new Date().toISOString(),
      });
      return json({ status: "failed", execution_id: execId, error: errMsg, latency_ms: latency }, 500);
    }
  }

  // ── POST /fetch-resource ─────────────────────────
  if (req.method === "POST" && path === "fetch-resource") {
    let body: FetchResourceRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.request_id || !body.uri) {
      return json({ error: "request_id and uri are required" }, 400);
    }

    // Load and evaluate policies (same as execute-tool)
    const { data: policies } = await serviceClient
      .from("mcp_policies")
      .select("*")
      .eq("enabled", true)
      .order("priority", { ascending: false });

    const { decision, policyId } = evaluatePolicy(
      (policies ?? []) as PolicyRule[],
      uniqueRoles,
      body.brand_id ?? null,
      `resource:${body.uri}`
    );

    const startTime = Date.now();
    const execId = await logExecution(serviceClient, {
      request_id: body.request_id,
      actor_type: "agent",
      actor_id: internalUserId,
      brand_id: body.brand_id ?? null,
      resource_uri: body.uri,
      decision,
      policy_id: policyId,
      status: decision === "deny" ? "rejected" : decision === "require_approval" ? "pending_approval" : "running",
    });

    // Deny → return immediately
    if (decision === "deny") {
      return json({ status: "denied", execution_id: execId, policy_id: policyId }, 403);
    }

    // Require approval → create approval record and return
    if (decision === "require_approval") {
      await serviceClient.from("mcp_approvals").insert({
        execution_id: execId,
        required_by_policy: policyId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      return json({ status: "pending_approval", execution_id: execId, message: "Awaiting human approval" }, 202);
    }

    try {
      // Resource fetching uses CRM data via userClient (RLS-enforced)
      // Simple URI-based routing
      const uriParts = body.uri.split("://");
      const scheme = uriParts[0];
      const path = uriParts[1] ?? "";

      let result: unknown;
      if (scheme === "crm") {
        const [table, ...rest] = path.split("/");
        let q = userClient.from(table).select("*");
        if (body.brand_id) q = q.eq("brand_id", body.brand_id);
        if (rest[0]) q = q.eq("id", rest[0]);
        else q = q.limit(20);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        result = data;
      } else {
        throw new Error(`Unsupported resource scheme: ${scheme}`);
      }

      const latency = Date.now() - startTime;
      await updateExecution(serviceClient, execId, {
        status: "success",
        output_redacted: { type: "resource", record_count: Array.isArray(result) ? result.length : 1 },
        latency_ms: latency,
        completed_at: new Date().toISOString(),
      });

      return json({ status: "success", execution_id: execId, data: result, latency_ms: latency });
    } catch (err) {
      const latency = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      await updateExecution(serviceClient, execId, {
        status: "failed",
        error_code: "RESOURCE_ERROR",
        error_message: errMsg.slice(0, 1000),
        latency_ms: latency,
        completed_at: new Date().toISOString(),
      });
      return json({ status: "failed", execution_id: execId, error: errMsg }, 500);
    }
  }

  // ── POST /approve ────────────────────────────────
  if (req.method === "POST" && path === "approve") {
    // Only admins can approve
    if (!uniqueRoles.includes("admin")) {
      return json({ error: "Only admins can approve executions" }, 403);
    }

    let body: { approval_id: string; decision: "approved" | "rejected"; reason?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { error } = await serviceClient
      .from("mcp_approvals")
      .update({
        decision: body.decision,
        reason: body.reason || null,
        approver_user_id: internalUserId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", body.approval_id);

    if (error) return json({ error: error.message }, 500);

    // If approved, update execution status to approved (actual execution is deferred)
    const { data: approval } = await serviceClient.from("mcp_approvals").select("execution_id").eq("id", body.approval_id).single();
    if (approval) {
      await serviceClient
        .from("mcp_executions")
        .update({ status: body.decision === "approved" ? "approved" : "rejected" })
        .eq("id", approval.execution_id);
    }

    return json({ status: "ok", decision: body.decision });
  }

  return json({ error: `Unknown endpoint: ${path}` }, 404);
});
