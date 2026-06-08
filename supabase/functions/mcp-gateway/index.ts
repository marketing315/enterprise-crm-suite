import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-mcp-internal, x-mcp-on-behalf-user-id, x-mcp-request-id, x-mcp-scopes, traceparent, tracestate",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "traceparent, x-trace-id",
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

// ── OpenTelemetry trace context (W3C) helpers ─────
const SERVICE_NAME = "mcp-gateway";
const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
function randHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
function newTraceId(): string { return randHex(16); }
function newSpanId(): string { return randHex(8); }
function parseTraceparent(value: string | null): { traceId: string; parentSpanId: string } | null {
  if (!value) return null;
  const m = TRACEPARENT_RE.exec(value.trim());
  if (!m) return null;
  if (/^0+$/.test(m[1]) || /^0+$/.test(m[2])) return null;
  return { traceId: m[1].toLowerCase(), parentSpanId: m[2].toLowerCase() };
}
function buildTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`;
}
type SpanRecord = {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  service_name: string;
  operation_name: string;
  started_at: string;
  duration_ms: number;
  status_code?: "ok" | "error" | "timeout";
  http_status?: number;
  error_message?: string;
  attributes?: Record<string, unknown>;
};
function recordSpan(span: SpanRecord) {
  const internalToken = Deno.env.get("INTERNAL_SERVICE_TOKEN");
  if (!internalToken) return;
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/trace-ingest`;
  const body = JSON.stringify({ events: [span] });
  // C5 — HMAC-signed mutual auth (replaces shared-token header).
  (async () => {
    try {
      const { signInternalRequest } = await import("../_shared/internal-mtls.ts");
      const headers = await signInternalRequest({
        caller: "mcp-gateway",
        method: "POST",
        url,
        body,
      });
      await fetch(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body,
      });
    } catch {
      /* swallow */
    }
  })();
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

// ── PII Redaction (scope-aware) ────────────────────
// Mirror of docs/mcp-server-redaction-policy.md.
// Strategy: full | partial | none.
type MaskStrategy = "full" | "partial" | "none";

interface FieldRule {
  patterns: string[];        // case-insensitive substring match on field name
  strategy: MaskStrategy;    // default strategy
  unlockScopes: string[];    // any of these scopes disables masking
  alwaysMask?: boolean;      // never unlockable (auth secrets)
}

const FIELD_RULES: FieldRule[] = [
  // auth secrets — never unlockable
  { patterns: ["password", "secret", "api_key", "apikey", "token"], strategy: "full", unlockScopes: [], alwaysMask: true },
  // payment data — only with explicit full scope
  { patterns: ["iban", "card_number", "card_pan", "credit_card", "cvv"], strategy: "full", unlockScopes: ["payments.read.full", "*"] },
  // fiscal
  { patterns: ["fiscal_code", "codice_fiscale", "vat_number", "partita_iva", "ssn"], strategy: "full", unlockScopes: ["pii.read.full", "*"] },
  // sanitario
  { patterns: ["patient_id", "medical_", "clinical_topic"], strategy: "full", unlockScopes: ["health.read", "*"] },
  // anagrafica
  { patterns: ["birth_date", "data_nascita"], strategy: "full", unlockScopes: ["pii.read", "pii.read.full", "*"] },
  // contatto / identità
  { patterns: ["email", "email_address"], strategy: "partial", unlockScopes: ["pii.read", "pii.read.full", "*"] },
  { patterns: ["phone", "mobile", "whatsapp"], strategy: "partial", unlockScopes: ["pii.read", "pii.read.full", "*"] },
  // indirizzo
  { patterns: ["address", "street", "via", "cap", "zip", "postal_code"], strategy: "partial", unlockScopes: ["address.read", "pii.read.full", "*"] },
];

function resolveStrategyForField(fieldName: string, scopes: string[]): MaskStrategy {
  const lc = fieldName.toLowerCase();
  for (const r of FIELD_RULES) {
    if (!r.patterns.some((p) => lc.includes(p))) continue;
    if (r.alwaysMask) return r.strategy;
    if (r.unlockScopes.some((s) => scopes.includes(s))) return "none";
    return r.strategy;
  }
  return "none";
}

function partialMask(str: string): string {
  if (!str) return "—";
  if (str.includes("@")) {
    const [local, domain] = str.split("@");
    const visible = local.slice(0, 1);
    return `${visible}${"•".repeat(Math.max(local.length - 1, 3))}@${domain}`;
  }
  const digits = str.replace(/\D/g, "");
  if (digits.length >= 6 && digits.length / Math.max(str.length, 1) > 0.6) {
    return `••• ••• ${digits.slice(-4)}`;
  }
  if (str.length <= 4) return `${str.charAt(0)}•••`;
  return `${str.slice(0, 3)}${"•".repeat(Math.min(Math.max(str.length - 5, 3), 6))}${str.slice(-2)}`;
}

function applyMask(value: unknown, strategy: MaskStrategy): unknown {
  if (value === null || value === undefined) return value;
  if (strategy === "none") return value;
  if (strategy === "full") return "••••••••";
  if (strategy === "partial") {
    const str = typeof value === "string" ? value : String(value);
    return partialMask(str);
  }
  return value;
}

/**
 * Recursively walks any JSON value and masks fields according to FIELD_RULES.
 * `redactionsCount` is mutated in place for telemetry.
 */
function redactDeep(
  obj: unknown,
  scopes: string[],
  redactionsCount: { n: number },
  depth = 0,
): unknown {
  if (depth > 20) return obj; // safety against pathological structures
  if (Array.isArray(obj)) return obj.map((o) => redactDeep(o, scopes, redactionsCount, depth + 1));
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const strategy = resolveStrategyForField(k, scopes);
      if (strategy === "none") {
        out[k] = (v && typeof v === "object") ? redactDeep(v, scopes, redactionsCount, depth + 1) : v;
      } else {
        out[k] = applyMask(v, strategy);
        if (v !== null && v !== undefined && out[k] !== v) redactionsCount.n += 1;
      }
    }
    return out;
  }
  return obj;
}

// Backwards-compat alias for audit storage (always uses empty scope set =
// most aggressive masking, suitable for long-term audit log).
function redactPII(obj: unknown): unknown {
  const counter = { n: 0 };
  return redactDeep(obj, [], counter);
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

  // ── Trace context (W3C) ──
  // Honour incoming traceparent (mcp-server forwards it on internal calls;
  // direct UI/control-plane callers may also set it). Otherwise start a
  // fresh trace. The span_id is always fresh — this is OUR span.
  const incomingTrace = parseTraceparent(req.headers.get("traceparent"));
  const traceId = incomingTrace?.traceId ?? newTraceId();
  const spanId = newSpanId();
  const parentSpanId = incomingTrace?.parentSpanId;
  const traceparentOut = buildTraceparent(traceId, spanId);
  const traceHeaders = { "traceparent": traceparentOut, "x-trace-id": traceId };
  const spanStartedAt = Date.now();
  const spanStartedAtIso = new Date(spanStartedAt).toISOString();

  // Local helper: same as json() but always propagates trace headers.
  const tjson = (body: unknown, status = 200) => json(body, status, traceHeaders);

  // Emit a span for THIS gateway request when the handler concludes.
  // Called explicitly at every terminal point in execute-tool/fetch-resource;
  // for other endpoints the trace is still propagated via headers.
  const emitSpan = (
    operation: string,
    httpStatus: number,
    extra: Record<string, unknown> = {},
    errorMessage?: string,
  ) => {
    recordSpan({
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: parentSpanId,
      service_name: SERVICE_NAME,
      operation_name: operation,
      started_at: spanStartedAtIso,
      duration_ms: Date.now() - spanStartedAt,
      status_code: httpStatus >= 500 ? "error" : httpStatus >= 400 ? "error" : "ok",
      http_status: httpStatus,
      error_message: errorMessage?.slice(0, 500),
      attributes: { "gateway.path": path, ...extra },
    });
  };

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
  const isInternalCall = !!internalSecret && timingSafeEqual(internalHeader, internalSecret);

  // Caller scopes drive PII redaction on tool/resource responses.
  // - Internal calls (from mcp-server): scopes derived from the validated MCP token.
  // - Direct user calls (UI control plane): grant full access ("*"); RLS still
  //   enforces tenant isolation, and these are first-party authenticated users.
  const callerScopes: string[] = isInternalCall
    ? (req.headers.get("x-mcp-scopes") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : ["*"];

  let internalUserId: string;
  let uniqueRoles: string[];
  let userClient: any;

  if (isInternalCall) {
    const onBehalfId = req.headers.get("x-mcp-on-behalf-user-id") ?? "";
    if (!onBehalfId) {
      return tjson({ error: "Internal call missing x-mcp-on-behalf-user-id" }, 400);
    }
    const { data: userRow } = await serviceClient.from("users").select("id").eq("id", onBehalfId).maybeSingle();
    if (!userRow) return tjson({ error: "On-behalf user not found" }, 403);
    internalUserId = userRow.id;
    const { data: rolesData } = await serviceClient.from("user_roles").select("role").eq("user_id", internalUserId);
    uniqueRoles = [...new Set((rolesData ?? []).map((r: any) => r.role as string))];
    // For DB queries we can use the service client (RLS bypass) — mcp-server already
    // enforced scope + the gateway will enforce policy below.
    userClient = serviceClient;
  } else {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return tjson({ error: "Unauthorized: missing token" }, 401);
    }

    userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return tjson({ error: "Unauthorized: invalid token" }, 401);
    }
    const authUserId = claims.claims.sub as string;

    const { data: userRow } = await serviceClient.from("users").select("id").eq("supabase_auth_id", authUserId).maybeSingle();
    if (!userRow) return tjson({ error: "User not found" }, 403);
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
    return tjson({ servers: servers ?? [], tools: tools ?? [], resources: resources ?? [] });
  }

  // ── POST /execute-tool ───────────────────────────
  if (req.method === "POST" && path === "execute-tool") {
    let body: ExecuteToolRequest;
    try {
      body = await req.json();
    } catch {
      return tjson({ error: "Invalid JSON body" }, 400);
    }

    if (!body.request_id || !body.tool) {
      return tjson({ error: "request_id and tool are required" }, 400);
    }

    // Brand scope validation
    if (!body.brand_id && !uniqueRoles.includes("admin")) {
      return tjson({ error: "brand_id required for non-admin users" }, 400);
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
      return tjson({ error: "Server is disabled via kill switch", tool: body.tool }, 503);
    }

    // Canary rollout enforcement
    if (server) {
      const canaryBrands = server.canary_brand_ids ?? [];
      const canaryRoles = server.canary_role_whitelist ?? [];
      if (canaryBrands.length > 0 && (!body.brand_id || !canaryBrands.includes(body.brand_id))) {
        return tjson({ error: "Server not available for this brand (canary rollout)", tool: body.tool }, 403);
      }
      if (canaryRoles.length > 0 && !canaryRoles.some((r: string) => uniqueRoles.includes(r))) {
        return tjson({ error: "Server not available for your role (canary rollout)", tool: body.tool }, 403);
      }
    }

    // Idempotency check
    if (body.idempotency_key) {
      const { isDuplicate, existingId } = await checkIdempotency(serviceClient, body.idempotency_key);
      if (isDuplicate) {
        return tjson({ status: "duplicate", existing_execution_id: existingId });
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
      return tjson({ status: "denied", execution_id: execId, policy_id: policyId }, 403);
    }

    // Require approval → create approval record and return
    if (decision === "require_approval") {
      await serviceClient.from("mcp_approvals").insert({
        execution_id: execId,
        required_by_policy: policyId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
      });
      return tjson({ status: "pending_approval", execution_id: execId, message: "Awaiting human approval" }, 202);
    }

    // Rate limit check
    if (toolRow?.rate_limit_per_min && server?.id) {
      const allowed = await checkRateLimit(serviceClient, body.tool, server.id, toolRow.rate_limit_per_min);
      if (!allowed) {
        await updateExecution(serviceClient, execId, { status: "failed", error_code: "RATE_LIMIT", error_message: "Rate limit exceeded", completed_at: new Date().toISOString(), latency_ms: Date.now() - startTime });
        return tjson({ error: "Rate limit exceeded", execution_id: execId }, 429);
      }
    }

    // Execute tool
    try {
      const result = await routeToolExecution(userClient, body.tool, body.input, body.brand_id ?? null, server);
      const latency = Date.now() - startTime;
      // Apply scope-aware PII redaction to the response payload.
      const redactionsCounter = { n: 0 };
      const safeResult = redactDeep(result, callerScopes, redactionsCounter);
      await updateExecution(serviceClient, execId, {
        status: "success",
        output_redacted: redactPII(result),
        latency_ms: latency,
        completed_at: new Date().toISOString(),
        metadata: { redactions_count: redactionsCounter.n, scopes: callerScopes, trace_id: traceId },
      });
      emitSpan("gateway.execute-tool", 200, {
        "mcp.tool": body.tool,
        "mcp.execution_id": execId,
        "mcp.brand_id": body.brand_id ?? null,
        "mcp.actor_id": internalUserId,
        "mcp.redactions_count": redactionsCounter.n,
      });
      return tjson({ status: "success", execution_id: execId, result: safeResult, latency_ms: latency, redactions_count: redactionsCounter.n });
    } catch (err) {
      const latency = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      await updateExecution(serviceClient, execId, {
        status: errMsg.includes("timeout") ? "timeout" : "failed",
        error_code: errMsg.includes("timeout") ? "TIMEOUT" : "EXECUTION_ERROR",
        error_message: errMsg.slice(0, 1000),
        latency_ms: latency,
        completed_at: new Date().toISOString(),
        metadata: { trace_id: traceId },
      });
      emitSpan("gateway.execute-tool", 500, {
        "mcp.tool": body.tool, "mcp.execution_id": execId,
      }, errMsg);
      return tjson({ status: "failed", execution_id: execId, error: errMsg, latency_ms: latency }, 500);
    }
  }

  // ── POST /fetch-resource ─────────────────────────
  if (req.method === "POST" && path === "fetch-resource") {
    let body: FetchResourceRequest;
    try {
      body = await req.json();
    } catch {
      return tjson({ error: "Invalid JSON body" }, 400);
    }

    if (!body.request_id || !body.uri) {
      return tjson({ error: "request_id and uri are required" }, 400);
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
      return tjson({ status: "denied", execution_id: execId, policy_id: policyId }, 403);
    }

    // Require approval → create approval record and return
    if (decision === "require_approval") {
      await serviceClient.from("mcp_approvals").insert({
        execution_id: execId,
        required_by_policy: policyId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      return tjson({ status: "pending_approval", execution_id: execId, message: "Awaiting human approval" }, 202);
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
        // SECURITY: enforce a strict allowlist of tables exposed via crm:// URIs.
        // Mirrors registered mcp_resources templates; defence-in-depth against
        // arbitrary table reads, especially when called with service role.
        const RESOURCE_TABLE_ALLOWLIST = new Set<string>([
          "contacts",
          "deals",
          "appointments",
        ]);
        if (!table || !RESOURCE_TABLE_ALLOWLIST.has(table)) {
          throw new Error(`Resource table not allowed: ${table ?? "(empty)"}`);
        }
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
      const redactionsCounter = { n: 0 };
      const safeResult = redactDeep(result, callerScopes, redactionsCounter);
      await updateExecution(serviceClient, execId, {
        status: "success",
        output_redacted: { type: "resource", record_count: Array.isArray(result) ? result.length : 1 },
        latency_ms: latency,
        completed_at: new Date().toISOString(),
        metadata: { redactions_count: redactionsCounter.n, scopes: callerScopes, trace_id: traceId },
      });

      emitSpan("gateway.fetch-resource", 200, {
        "mcp.uri": body.uri,
        "mcp.execution_id": execId,
        "mcp.brand_id": body.brand_id ?? null,
        "mcp.actor_id": internalUserId,
        "mcp.redactions_count": redactionsCounter.n,
        "mcp.record_count": Array.isArray(result) ? result.length : 1,
      });

      return tjson({ status: "success", execution_id: execId, data: safeResult, latency_ms: latency, redactions_count: redactionsCounter.n });
    } catch (err) {
      const latency = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      await updateExecution(serviceClient, execId, {
        status: "failed",
        error_code: "RESOURCE_ERROR",
        error_message: errMsg.slice(0, 1000),
        latency_ms: latency,
        completed_at: new Date().toISOString(),
        metadata: { trace_id: traceId },
      });
      emitSpan("gateway.fetch-resource", 500, {
        "mcp.uri": body.uri, "mcp.execution_id": execId,
      }, errMsg);
      return tjson({ status: "failed", execution_id: execId, error: errMsg }, 500);
    }
  }

  // ── POST /approve ────────────────────────────────
  if (req.method === "POST" && path === "approve") {
    // Only admins can approve
    if (!uniqueRoles.includes("admin")) {
      return tjson({ error: "Only admins can approve executions" }, 403);
    }

    let body: { approval_id: string; decision: "approved" | "rejected"; reason?: string };
    try {
      body = await req.json();
    } catch {
      return tjson({ error: "Invalid JSON body" }, 400);
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

    if (error) return tjson({ error: error.message }, 500);

    // If approved, update execution status to approved (actual execution is deferred)
    const { data: approval } = await serviceClient.from("mcp_approvals").select("execution_id").eq("id", body.approval_id).single();
    if (approval) {
      await serviceClient
        .from("mcp_executions")
        .update({ status: body.decision === "approved" ? "approved" : "rejected" })
        .eq("id", approval.execution_id);
    }

    return tjson({ status: "ok", decision: body.decision });
  }

  return tjson({ error: `Unknown endpoint: ${path}` }, 404);
});
