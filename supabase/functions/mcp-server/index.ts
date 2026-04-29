// =============================================================
// MCP Server (Streamable HTTP) — exposes CRM to external AI clients
// Loop 1: M0 Foundation + M1 Auth & RBAC
// - JSON-RPC 2.0 over HTTP (POST)
// - methods: initialize, ping, tools/list, tools/call
// - auth: Bearer mcp_xxx token (validated via validate_mcp_token RPC)
// - delegates tool execution to mcp-gateway (policy engine, audit)
// - audit log: mcp_request_log (every request, with request_id)
// =============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_TOKEN = Deno.env.get("INTERNAL_SERVICE_TOKEN")!;
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1] ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id, x-request-id",
};

const SERVER_INFO = {
  name: "ralph-crm-mcp",
  version: "1.0.0",
};

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
  // Application-level (MCP)
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
// Auth: validate Bearer token via DB RPC
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

  const { data, error } = await supabase.rpc("validate_mcp_token", {
    p_raw_token: raw,
  });
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
// Tool registry (loop 1: subset; loop 2 will load from mcp_tools)
// -------------------------------------------------------------
type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: string;
  dataClassification: "public" | "internal" | "restricted";
  maxTimeoutMs: number;
};

const BUILT_IN_TOOLS: ToolDef[] = [
  {
    name: "crm.search_contacts",
    description:
      "Search contacts by name, email, or phone. Returns up to 25 contacts.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text query" },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 25 },
      },
      required: ["query"],
    },
    requiredScope: "crm.read",
    dataClassification: "internal",
    maxTimeoutMs: 5000,
  },
  {
    name: "crm.get_contact",
    description: "Get a single contact by id with deals, appointments, and recent events.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
    },
    requiredScope: "crm.read",
    dataClassification: "internal",
    maxTimeoutMs: 5000,
  },
  {
    name: "crm.list_appointments",
    description: "List appointments in a date range, optionally filtered by sales user.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", format: "date-time" },
        to: { type: "string", format: "date-time" },
        sales_user_id: { type: "string", format: "uuid" },
      },
      required: ["from", "to"],
    },
    requiredScope: "crm.read",
    dataClassification: "internal",
    maxTimeoutMs: 5000,
  },
  {
    name: "crm.get_funnel_kpi",
    description: "Get aggregated funnel KPIs (leads, deals, appointments) for a brand.",
    inputSchema: {
      type: "object",
      properties: {
        brand_id: { type: "string", format: "uuid" },
        from: { type: "string", format: "date" },
        to: { type: "string", format: "date" },
      },
      required: ["from", "to"],
    },
    requiredScope: "crm.read",
    dataClassification: "internal",
    maxTimeoutMs: 8000,
  },
];

// -------------------------------------------------------------
// Audit log (best-effort, never throws to caller)
// -------------------------------------------------------------
async function logRequest(
  supabase: any,
  entry: {
    request_id: string;
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
  } catch (_e) {
    // swallow — log failures must not break MCP responses
  }
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
      // resources: { listChanged: false },  // enabled in Loop 3
      logging: {},
    },
    serverInfo: SERVER_INFO,
    instructions:
      "Ralph CRM MCP. Use tools/list to discover capabilities. " +
      "All calls are authorized server-side via the CRM policy engine.",
  });
}

function handlePing(req: JsonRpcReq): JsonRpcRes {
  return rpcOk(req.id, {});
}

function handleToolsList(req: JsonRpcReq, ctx: AuthCtx): JsonRpcRes {
  const visible = BUILT_IN_TOOLS.filter(
    (t) =>
      ctx.scopes.includes("*") ||
      ctx.scopes.includes(t.requiredScope) ||
      ctx.scopes.some((s) => t.requiredScope.startsWith(s.replace(/\*$/, ""))),
  );
  return rpcOk(req.id, {
    tools: visible.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      // MCP extension fields:
      _meta: {
        requiredScope: t.requiredScope,
        dataClassification: t.dataClassification,
        maxTimeoutMs: t.maxTimeoutMs,
      },
    })),
  });
}

async function handleToolsCall(
  req: JsonRpcReq,
  ctx: AuthCtx,
  requestId: string,
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

  const tool = BUILT_IN_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return {
      res: rpcErr(req.id, RPC_ERR.METHOD_NOT_FOUND, `unknown tool: ${name}`),
      toolName: name,
      errorCode: "VALIDATION",
    };
  }

  // Scope check (defense in depth before delegating to gateway policy engine)
  if (
    !ctx.scopes.includes("*") &&
    !ctx.scopes.includes(tool.requiredScope) &&
    !ctx.scopes.some((s) => tool.requiredScope.startsWith(s.replace(/\*$/, "")))
  ) {
    return {
      res: rpcErr(req.id, RPC_ERR.AUTH, `token lacks scope: ${tool.requiredScope}`),
      toolName: name,
      errorCode: "AUTH",
    };
  }

  // Delegate to internal mcp-gateway (which enforces full policy + audit)
  const gatewayUrl = `${SUPABASE_URL}/functions/v1/mcp-gateway`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), tool.maxTimeoutMs);
  const startedAt = Date.now();

  try {
    const upstream = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${INTERNAL_TOKEN}`,
        "x-mcp-request-id": requestId,
        "x-mcp-user-id": ctx.user_id ?? "",
        "x-mcp-brand-id": ctx.brand_id ?? "",
      },
      body: JSON.stringify({
        action: "execute",
        tool: name,
        input: params.arguments ?? {},
        on_behalf_of: ctx.user_id,
        brand_id: ctx.brand_id,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await upstream.text();
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text }; }

    if (!upstream.ok) {
      const code =
        upstream.status === 401 || upstream.status === 403
          ? RPC_ERR.POLICY_DENY
          : upstream.status >= 500
          ? RPC_ERR.UPSTREAM
          : RPC_ERR.INTERNAL_ERROR;
      const errCode =
        upstream.status === 401 || upstream.status === 403 ? "POLICY_DENY"
          : upstream.status >= 500 ? "UPSTREAM" : "INTERNAL";
      return {
        res: rpcErr(req.id, code, body.error ?? `gateway error ${upstream.status}`, {
          request_id: requestId,
          status: upstream.status,
        }),
        toolName: name,
        errorCode: errCode,
      };
    }

    return {
      res: rpcOk(req.id, {
        content: [
          {
            type: "text",
            text: typeof body.result === "string"
              ? body.result
              : JSON.stringify(body.result ?? body, null, 2),
          },
        ],
        isError: false,
        _meta: {
          duration_ms: Date.now() - startedAt,
          request_id: requestId,
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
        isAbort ? `tool timed out after ${tool.maxTimeoutMs}ms` : (e as Error).message,
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

  // initialize and ping are public (MCP spec); everything else requires auth
  const isPublic = body.method === "initialize" || body.method === "ping";
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
        response = handleToolsList(body, ctx!);
        break;
      case "tools/call": {
        const out = await handleToolsCall(body, ctx!, requestId);
        response = out.res;
        toolName = out.toolName;
        errorCode = out.errorCode;
        break;
      }
      case "notifications/initialized":
        // MCP notification (no id, no response needed)
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
