// =============================================================
// MCP Server (Streamable HTTP) — exposes CRM to external AI clients
// Loop 2: M2 Core capabilities
// - JSON-RPC 2.0 over HTTP (POST)
// - methods: initialize, ping, tools/list, tools/call,
//            resources/list, resources/read
// - dynamic tool/resource registry loaded from mcp_tools / mcp_resources
// - auth: Bearer mcp_xxx token (validate_mcp_token RPC)
// - delegates execution to mcp-gateway (policy engine + audit)
// - audit log: mcp_request_log (every request, with request_id)
// =============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_TOKEN = Deno.env.get("INTERNAL_SERVICE_TOKEN")!;
const SERVICE_NAME = "mcp-server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id, accept, traceparent, tracestate",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id, x-request-id, traceparent, x-trace-id",
};

// -------------------------------------------------------------
// W3C Trace Context (OpenTelemetry-compatible) helpers
//   traceparent: 00-<trace_id:32hex>-<span_id:16hex>-<flags:2hex>
// We persist spans into trace_events via the trace-ingest function
// (best-effort, fire-and-forget — never blocks the request).
// -------------------------------------------------------------
function randHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
function newTraceId(): string { return randHex(16); }
function newSpanId(): string { return randHex(8); }

const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
function parseTraceparent(value: string | null): { traceId: string; parentSpanId: string } | null {
  if (!value) return null;
  const m = TRACEPARENT_RE.exec(value.trim());
  if (!m) return null;
  // reject all-zero ids
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
  // Fire-and-forget; never await on the hot path.
  if (!INTERNAL_TOKEN) return;
  const url = `${SUPABASE_URL}/functions/v1/trace-ingest`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": INTERNAL_TOKEN,
    },
    body: JSON.stringify({ events: [span] }),
  }).catch(() => {/* swallow — observability must never break runtime */});
}

const SERVER_INFO = { name: "ralph-crm-mcp", version: "1.0.0" };
const PROTOCOL_VERSION = "2024-11-05";

// -------------------------------------------------------------
// JSON-RPC error codes (MCP standard + our taxonomy)
// -------------------------------------------------------------
const RPC_ERR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  AUTH: -32001,
  POLICY_DENY: -32002,
  TIMEOUT: -32003,
  UPSTREAM: -32004,
  VALIDATION: -32005,
} as const;

type JsonRpcReq = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

type JsonRpcRes = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function rpcOk(id: JsonRpcReq["id"], result: unknown): JsonRpcRes {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcErr(
  id: JsonRpcReq["id"],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcRes {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

// -------------------------------------------------------------
// Auth: validate Bearer mcp_xxx via DB RPC
// -------------------------------------------------------------
type AuthCtx = {
  token_id: string;
  user_id: string | null;
  kind: "user" | "service";
  brand_id: string | null;
  scopes: string[];
};

async function authenticate(req: Request, supabase: any): Promise<AuthCtx | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const raw = authHeader.slice(7).trim();
  if (!raw.startsWith("mcp_")) return null;

  const { data, error } = await supabase.rpc("validate_mcp_token", { p_raw_token: raw });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return {
    token_id: row.token_id,
    user_id: row.user_id,
    kind: row.kind,
    brand_id: row.brand_id,
    scopes: row.scopes ?? [],
  };
}

// -------------------------------------------------------------
// Audit (best-effort)
// -------------------------------------------------------------
async function logRequest(
  supabase: any,
  entry: {
    request_id: string;
    trace_id: string | null;
    token_id: string | null;
    user_id: string | null;
    brand_id: string | null;
    method: string;
    tool_name: string | null;
    status_code: number;
    error_code: string | null;
    duration_ms: number;
    request_size: number;
    response_size: number;
    client_ip: string | null;
    user_agent: string | null;
  },
) {
  try {
    await supabase.from("mcp_request_log").insert(entry);
  } catch (_e) {/* swallow */}
}

// -------------------------------------------------------------
// Method handlers
// -------------------------------------------------------------
function handleInitialize(req: JsonRpcReq): JsonRpcRes {
  const params = (req.params ?? {}) as { protocolVersion?: string };
  return rpcOk(req.id, {
    protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false },
      resources: { listChanged: false, subscribe: false },
      logging: {},
    },
    serverInfo: SERVER_INFO,
    instructions:
      "Ralph CRM MCP. Use tools/list and resources/list to discover capabilities. " +
      "All calls are authorized server-side via the CRM policy engine.",
  });
}

function handlePing(req: JsonRpcReq): JsonRpcRes {
  return rpcOk(req.id, {});
}

async function handleToolsList(
  req: JsonRpcReq,
  ctx: AuthCtx,
  supabase: any,
): Promise<JsonRpcRes> {
  const { data, error } = await supabase.rpc("mcp_list_tools_for_scopes", {
    p_scopes: ctx.scopes,
  });
  if (error) {
    return rpcErr(req.id, RPC_ERR.INTERNAL_ERROR, `registry error: ${error.message}`);
  }
  return rpcOk(req.id, {
    tools: (data ?? []).map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema_json ?? { type: "object" },
      _meta: {
        category: t.category,
        requiredScope: t.required_scope,
        dataClassification: t.data_classification,
        maxTimeoutMs: t.max_timeout_ms,
        requiresApproval: t.requires_approval,
        rateLimitPerMin: t.rate_limit_per_min,
      },
    })),
  });
}

async function handleResourcesList(
  req: JsonRpcReq,
  ctx: AuthCtx,
  supabase: any,
): Promise<JsonRpcRes> {
  const { data, error } = await supabase.rpc("mcp_list_resources_for_scopes", {
    p_scopes: ctx.scopes,
  });
  if (error) {
    return rpcErr(req.id, RPC_ERR.INTERNAL_ERROR, `registry error: ${error.message}`);
  }
  // MCP resources/list returns concrete resources OR resourceTemplates;
  // we return both: concrete URIs (no placeholders) as resources, the rest
  // as resourceTemplates.
  const all = data ?? [];
  const isTemplate = (uri: string) => /\{[^}]+\}/.test(uri);
  return rpcOk(req.id, {
    resources: all.filter((r: any) => !isTemplate(r.uri_template)).map((r: any) => ({
      uri: r.uri_template,
      name: r.name,
      description: r.description,
      mimeType: "application/json",
      _meta: {
        requiredScope: r.required_scope,
        dataClassification: r.data_classification,
      },
    })),
    resourceTemplates: all.filter((r: any) => isTemplate(r.uri_template)).map((r: any) => ({
      uriTemplate: r.uri_template,
      name: r.name,
      description: r.description,
      mimeType: "application/json",
      _meta: {
        requiredScope: r.required_scope,
        dataClassification: r.data_classification,
      },
    })),
  });
}

function scopeAllows(scopes: string[], required: string): boolean {
  if (scopes.includes("*") || scopes.includes(required)) return true;
  return scopes.some((s) => {
    if (!s.endsWith("*")) return false;
    const prefix = s.slice(0, -1);
    return required.startsWith(prefix);
  });
}

// Match an incoming uri (e.g. "crm://contacts/abc") against a template
// (e.g. "crm://contacts/{id}"). Returns true if the structure matches.
function uriMatchesTemplate(uri: string, template: string): boolean {
  const re = new RegExp(
    "^" +
      template
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\{[^}]+\\\}/g, "[^/]+") +
      "$",
  );
  return re.test(uri);
}

async function handleResourcesRead(
  req: JsonRpcReq,
  ctx: AuthCtx,
  supabase: any,
  requestId: string,
  traceparent: string,
): Promise<{ res: JsonRpcRes; errorCode: string | null }> {
  const params = (req.params ?? {}) as { uri?: string };
  const uri = params.uri;
  if (!uri || typeof uri !== "string") {
    return {
      res: rpcErr(req.id, RPC_ERR.INVALID_PARAMS, "missing uri"),
      errorCode: "VALIDATION",
    };
  }

  // Look up which resource template (if any) the URI matches
  const { data: resources } = await supabase.rpc("mcp_list_resources_for_scopes", {
    p_scopes: ctx.scopes,
  });
  const match = (resources ?? []).find((r: any) =>
    r.uri_template === uri || uriMatchesTemplate(uri, r.uri_template),
  );
  if (!match) {
    return {
      res: rpcErr(req.id, RPC_ERR.AUTH, `resource not allowed or not found: ${uri}`),
      errorCode: "AUTH",
    };
  }
  if (!scopeAllows(ctx.scopes, match.required_scope)) {
    return {
      res: rpcErr(req.id, RPC_ERR.AUTH, `token lacks scope: ${match.required_scope}`),
      errorCode: "AUTH",
    };
  }

  // Delegate to mcp-gateway POST /fetch-resource
  const gatewayUrl = `${SUPABASE_URL}/functions/v1/mcp-gateway/fetch-resource`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mcp-internal": INTERNAL_TOKEN,
        "x-mcp-on-behalf-user-id": ctx.user_id ?? "",
        "x-mcp-request-id": requestId,
        "x-mcp-scopes": (ctx.scopes ?? []).join(","),
        "traceparent": traceparent,
      },
      body: JSON.stringify({
        request_id: requestId,
        user_id: ctx.user_id,
        brand_id: ctx.brand_id,
        uri,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const code = upstream.status === 401 || upstream.status === 403
        ? RPC_ERR.POLICY_DENY
        : upstream.status >= 500
        ? RPC_ERR.UPSTREAM
        : RPC_ERR.INTERNAL_ERROR;
      return {
        res: rpcErr(req.id, code, body.error ?? `gateway ${upstream.status}`, {
          request_id: requestId,
        }),
        errorCode: code === RPC_ERR.POLICY_DENY ? "POLICY_DENY" : "UPSTREAM",
      };
    }

    return {
      res: rpcOk(req.id, {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(body.data ?? body, null, 2),
          },
        ],
        _meta: { request_id: requestId, latency_ms: body.latency_ms },
      }),
      errorCode: null,
    };
  } catch (e) {
    clearTimeout(timer);
    const isAbort = (e as Error).name === "AbortError";
    return {
      res: rpcErr(
        req.id,
        isAbort ? RPC_ERR.TIMEOUT : RPC_ERR.INTERNAL_ERROR,
        isAbort ? "resource fetch timed out" : (e as Error).message,
        { request_id: requestId },
      ),
      errorCode: isAbort ? "TIMEOUT" : "INTERNAL",
    };
  }
}

async function handleToolsCall(
  req: JsonRpcReq,
  ctx: AuthCtx,
  supabase: any,
  requestId: string,
  traceparent: string,
): Promise<{ res: JsonRpcRes; toolName: string | null; errorCode: string | null }> {
  const params = (req.params ?? {}) as {
    name?: string;
    arguments?: Record<string, unknown>;
  };
  const name = params.name;
  if (!name || typeof name !== "string") {
    return {
      res: rpcErr(req.id, RPC_ERR.INVALID_PARAMS, "missing tool name"),
      toolName: null,
      errorCode: "VALIDATION",
    };
  }

  // Resolve tool from dynamic registry
  const { data: tools, error } = await supabase.rpc("mcp_list_tools_for_scopes", {
    p_scopes: ctx.scopes,
  });
  if (error) {
    return {
      res: rpcErr(req.id, RPC_ERR.INTERNAL_ERROR, `registry error: ${error.message}`),
      toolName: name,
      errorCode: "INTERNAL",
    };
  }
  const tool = (tools ?? []).find((t: any) => t.name === name);
  if (!tool) {
    return {
      res: rpcErr(req.id, RPC_ERR.METHOD_NOT_FOUND, `unknown or not allowed tool: ${name}`),
      toolName: name,
      errorCode: "VALIDATION",
    };
  }

  if (!scopeAllows(ctx.scopes, tool.required_scope)) {
    return {
      res: rpcErr(req.id, RPC_ERR.AUTH, `token lacks scope: ${tool.required_scope}`),
      toolName: name,
      errorCode: "AUTH",
    };
  }

  // Build idempotency key for write tools
  const idempotencyKey = tool.category !== "read"
    ? `mcp:${ctx.token_id}:${name}:${requestId}`
    : undefined;

  // Delegate to mcp-gateway POST /execute-tool (service-to-service)
  const gatewayUrl = `${SUPABASE_URL}/functions/v1/mcp-gateway/execute-tool`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), tool.max_timeout_ms ?? 8000);
  const startedAt = Date.now();

  try {
    const upstream = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mcp-internal": INTERNAL_TOKEN,
        "x-mcp-on-behalf-user-id": ctx.user_id ?? "",
        "x-mcp-request-id": requestId,
        "x-mcp-scopes": (ctx.scopes ?? []).join(","),
        "traceparent": traceparent,
      },
      body: JSON.stringify({
        request_id: requestId,
        user_id: ctx.user_id,
        brand_id: ctx.brand_id,
        tool: name,
        input: params.arguments ?? {},
        idempotency_key: idempotencyKey,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const body = await upstream.json().catch(() => ({}));

    // Pending approval → MCP returns isError=false but signals to the client
    if (upstream.status === 202 && body.status === "pending_approval") {
      return {
        res: rpcOk(req.id, {
          content: [{
            type: "text",
            text: `Approval required. Execution id: ${body.execution_id}. ` +
                  "An admin must approve before the action runs.",
          }],
          isError: false,
          _meta: {
            status: "pending_approval",
            execution_id: body.execution_id,
            request_id: requestId,
          },
        }),
        toolName: name,
        errorCode: null,
      };
    }

    if (!upstream.ok || body.status === "denied" || body.status === "failed") {
      const code = upstream.status === 401 || upstream.status === 403 || body.status === "denied"
        ? RPC_ERR.POLICY_DENY
        : upstream.status === 429
        ? RPC_ERR.UPSTREAM
        : upstream.status >= 500
        ? RPC_ERR.UPSTREAM
        : RPC_ERR.INTERNAL_ERROR;
      const errCode = code === RPC_ERR.POLICY_DENY ? "POLICY_DENY"
        : code === RPC_ERR.UPSTREAM ? "UPSTREAM" : "INTERNAL";
      return {
        res: rpcErr(req.id, code, body.error ?? `gateway ${upstream.status}`, {
          request_id: requestId,
          execution_id: body.execution_id,
        }),
        toolName: name,
        errorCode: errCode,
      };
    }

    return {
      res: rpcOk(req.id, {
        content: [{
          type: "text",
          text: typeof body.result === "string"
            ? body.result
            : JSON.stringify(body.result ?? body, null, 2),
        }],
        isError: false,
        _meta: {
          duration_ms: Date.now() - startedAt,
          request_id: requestId,
          execution_id: body.execution_id,
          source_systems: ["crm"],
        },
      }),
      toolName: name,
      errorCode: null,
    };
  } catch (e) {
    clearTimeout(timer);
    const isAbort = (e as Error).name === "AbortError";
    return {
      res: rpcErr(
        req.id,
        isAbort ? RPC_ERR.TIMEOUT : RPC_ERR.INTERNAL_ERROR,
        isAbort ? `tool timed out after ${tool.max_timeout_ms}ms` : (e as Error).message,
        { request_id: requestId },
      ),
      toolName: name,
      errorCode: isAbort ? "TIMEOUT" : "INTERNAL",
    };
  }
}

// -------------------------------------------------------------
// Main handler
// -------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Use POST with JSON-RPC 2.0 payload" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  let raw = "";
  let body: JsonRpcReq | null = null;
  try {
    raw = await req.text();
    body = JSON.parse(raw);
  } catch (_) {
    return new Response(
      JSON.stringify(rpcErr(null, RPC_ERR.PARSE_ERROR, "invalid JSON")),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId } },
    );
  }

  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return new Response(
      JSON.stringify(rpcErr(body?.id ?? null, RPC_ERR.INVALID_REQUEST, "expected JSON-RPC 2.0 request")),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId } },
    );
  }

  // ----------------------------------------------------------
  // Kill-switch globale (mcp_servers.kill_switch su ralph-crm-mcp)
  // ----------------------------------------------------------
  if (body && body.method !== "initialize" && body.method !== "ping" &&
      body.method !== "notifications/initialized") {
    const { data: srv } = await supabase
      .from("mcp_servers")
      .select("kill_switch")
      .eq("name", "ralph-crm-mcp")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (srv?.kill_switch) {
      const res = rpcErr(body.id, RPC_ERR.UPSTREAM,
        "MCP server is temporarily disabled (kill-switch active)",
        { request_id: requestId });
      const payload = JSON.stringify(res);
      logRequest(supabase, {
        request_id: requestId, token_id: null, user_id: null, brand_id: null,
        method: body.method, tool_name: null, status_code: 503,
        error_code: "KILL_SWITCH",
        duration_ms: Date.now() - startedAt,
        request_size: raw.length, response_size: payload.length,
        client_ip: req.headers.get("x-forwarded-for"),
        user_agent: req.headers.get("user-agent"),
      });
      return new Response(payload, {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId },
      });
    }
  }

  // initialize and ping are public (MCP spec); everything else requires auth
  const isPublic = body.method === "initialize" || body.method === "ping" ||
    body.method === "notifications/initialized";
  let ctx: AuthCtx | null = null;
  if (!isPublic) {
    ctx = await authenticate(req, supabase);
    if (!ctx) {
      const res = rpcErr(body.id, RPC_ERR.AUTH, "invalid or missing MCP token", {
        request_id: requestId,
      });
      const payload = JSON.stringify(res);
      logRequest(supabase, {
        request_id: requestId,
        token_id: null,
        user_id: null,
        brand_id: null,
        method: body.method,
        tool_name: null,
        status_code: 401,
        error_code: "AUTH",
        duration_ms: Date.now() - startedAt,
        request_size: raw.length,
        response_size: payload.length,
        client_ip: req.headers.get("x-forwarded-for"),
        user_agent: req.headers.get("user-agent"),
      });
      return new Response(payload, {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId },
      });
    }

    // ---------------------------------------------------------
    // Rate limiting per token (skipped for ping)
    // ---------------------------------------------------------
    if (ctx && body.method !== "ping") {
      const { data: rl } = await supabase.rpc("mcp_check_rate_limit", { p_token_id: ctx.token_id });
      const row = Array.isArray(rl) ? rl[0] : rl;
      if (row && row.allowed === false) {
        const res = rpcErr(body.id, RPC_ERR.UPSTREAM,
          `rate limit exceeded: ${row.used}/${row.max_per_min} req/min`,
          { request_id: requestId, retry_after_seconds: 60 });
        const payload = JSON.stringify(res);
        logRequest(supabase, {
          request_id: requestId, token_id: ctx.token_id, user_id: ctx.user_id,
          brand_id: ctx.brand_id, method: body.method, tool_name: null,
          status_code: 429, error_code: "RATE_LIMIT",
          duration_ms: Date.now() - startedAt,
          request_size: raw.length, response_size: payload.length,
          client_ip: req.headers.get("x-forwarded-for"),
          user_agent: req.headers.get("user-agent"),
        });
        return new Response(payload, {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "x-request-id": requestId,
            "Retry-After": "60",
            "X-RateLimit-Limit": String(row.max_per_min),
            "X-RateLimit-Remaining": "0",
          },
        });
      }
    }
  }

  let response: JsonRpcRes;
  let toolName: string | null = null;
  let errorCode: string | null = null;
  try {
    switch (body.method) {
      case "initialize":
        response = handleInitialize(body);
        break;
      case "ping":
        response = handlePing(body);
        break;
      case "tools/list":
        response = await handleToolsList(body, ctx!, supabase);
        break;
      case "tools/call": {
        const out = await handleToolsCall(body, ctx!, supabase, requestId);
        response = out.res;
        toolName = out.toolName;
        errorCode = out.errorCode;
        break;
      }
      case "resources/list":
        response = await handleResourcesList(body, ctx!, supabase);
        break;
      case "resources/read": {
        const out = await handleResourcesRead(body, ctx!, supabase, requestId);
        response = out.res;
        errorCode = out.errorCode;
        break;
      }
      case "notifications/initialized":
        return new Response(null, {
          status: 202,
          headers: { ...corsHeaders, "x-request-id": requestId },
        });
      default:
        response = rpcErr(body.id, RPC_ERR.METHOD_NOT_FOUND, `method not found: ${body.method}`);
        errorCode = "VALIDATION";
    }
  } catch (e) {
    response = rpcErr(body.id, RPC_ERR.INTERNAL_ERROR, (e as Error).message, {
      request_id: requestId,
    });
    errorCode = "INTERNAL";
  }

  const payload = JSON.stringify(response);
  const status = response.error ? (
    response.error.code === RPC_ERR.AUTH ? 401
      : response.error.code === RPC_ERR.POLICY_DENY ? 403
      : response.error.code === RPC_ERR.METHOD_NOT_FOUND ? 404
      : response.error.code === RPC_ERR.TIMEOUT ? 504
      : response.error.code === RPC_ERR.UPSTREAM ? 502
      : 400
  ) : 200;

  logRequest(supabase, {
    request_id: requestId,
    token_id: ctx?.token_id ?? null,
    user_id: ctx?.user_id ?? null,
    brand_id: ctx?.brand_id ?? null,
    method: body.method,
    tool_name: toolName,
    status_code: status,
    error_code: errorCode,
    duration_ms: Date.now() - startedAt,
    request_size: raw.length,
    response_size: payload.length,
    client_ip: req.headers.get("x-forwarded-for"),
    user_agent: req.headers.get("user-agent"),
  });

  return new Response(payload, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
  });
});
