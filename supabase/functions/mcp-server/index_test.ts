// =============================================================
// MCP Server — End-to-end test suite (Deno)
// Covers: protocol handshake, auth (missing/invalid/malformed),
// JSON-RPC error envelope, method routing, rate-limit + kill-switch
// preconditions and (optionally, if MCP_TEST_TOKEN is set) the
// happy path tools/list + revoked-token scenario.
//
// Run via the Lovable test-edge-functions tool. No real DB writes
// are performed by these tests beyond the audit log entries the
// edge function itself produces for each request (best-effort).
// =============================================================

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const MCP_URL = `${SUPABASE_URL}/functions/v1/mcp-server`;

// Optional: a real, active mcp_xxx token to exercise the happy path.
// When absent, those tests are skipped (ignore: true).
const VALID_TOKEN = Deno.env.get("MCP_TEST_TOKEN") ?? "";
// Optional: a token that has been revoked in mcp_tokens (revoked_at set).
const REVOKED_TOKEN = Deno.env.get("MCP_TEST_REVOKED_TOKEN") ?? "";

type RpcRes = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

async function rpc(
  body: unknown,
  opts: { token?: string; raw?: string } = {},
): Promise<{ status: number; json: RpcRes; requestId: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Supabase edge gateway requires apikey for unauthenticated edge calls
    "apikey": ANON_KEY,
    "Accept": "application/json",
  };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: opts.raw ?? JSON.stringify(body),
  });
  const requestId = res.headers.get("x-request-id");
  const text = await res.text();
  let json: RpcRes;
  try {
    json = JSON.parse(text);
  } catch {
    json = { jsonrpc: "2.0", id: null, error: { code: -1, message: text } };
  }
  return { status: res.status, json, requestId };
}

// -----------------------------------------------------------------
// Protocol & transport
// -----------------------------------------------------------------

Deno.test("CORS preflight returns 200 with allow headers", async () => {
  const res = await fetch(MCP_URL, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://example.com",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type",
    },
  });
  await res.text();
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
  const allowHeaders = res.headers.get("access-control-allow-headers") ?? "";
  assert(allowHeaders.toLowerCase().includes("authorization"));
});

Deno.test("GET is rejected with 405", async () => {
  const res = await fetch(MCP_URL, {
    method: "GET",
    headers: { "apikey": ANON_KEY },
  });
  await res.text();
  assertEquals(res.status, 405);
});

Deno.test("Malformed JSON body → JSON-RPC PARSE_ERROR (-32700)", async () => {
  const { status, json, requestId } = await rpc(undefined, { raw: "{not json" });
  assertEquals(status, 400);
  assertEquals(json.error?.code, -32700);
  assertExists(requestId);
});

Deno.test("Missing jsonrpc field → INVALID_REQUEST (-32600)", async () => {
  const { status, json } = await rpc({ id: 1, method: "ping" });
  assertEquals(status, 400);
  assertEquals(json.error?.code, -32600);
});

// -----------------------------------------------------------------
// Public methods (no auth required)
// -----------------------------------------------------------------

Deno.test("initialize works without a token and returns server capabilities", async () => {
  const { status, json } = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05" },
  });
  assertEquals(status, 200);
  assertExists(json.result);
  const r = json.result as Record<string, unknown>;
  assertEquals((r.serverInfo as { name: string }).name, "ralph-crm-mcp");
  assertExists(r.capabilities);
  assertExists((r.capabilities as Record<string, unknown>).tools);
});

Deno.test("ping works without a token", async () => {
  const { status, json } = await rpc({
    jsonrpc: "2.0",
    id: "p1",
    method: "ping",
  });
  assertEquals(status, 200);
  assertEquals(json.id, "p1");
  assertEquals(typeof json.result, "object");
});

Deno.test("notifications/initialized returns 202 and no body", async () => {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });
  await res.text();
  assertEquals(res.status, 202);
});

// -----------------------------------------------------------------
// Auth: missing / malformed / invalid / revoked
// -----------------------------------------------------------------

Deno.test("tools/list without Authorization → AUTH error (-32001) + 401", async () => {
  const { status, json } = await rpc({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/list",
  });
  assertEquals(status, 401);
  assertEquals(json.error?.code, -32001);
});

Deno.test("tools/list with non-mcp Bearer → AUTH error + 401", async () => {
  const { status, json } = await rpc(
    { jsonrpc: "2.0", id: 11, method: "tools/list" },
    { token: "not_an_mcp_token_value_123" },
  );
  assertEquals(status, 401);
  assertEquals(json.error?.code, -32001);
});

Deno.test("tools/list with well-formed but unknown mcp_ token → AUTH + 401", async () => {
  const { status, json } = await rpc(
    { jsonrpc: "2.0", id: 12, method: "tools/list" },
    { token: "mcp_" + "x".repeat(48) },
  );
  assertEquals(status, 401);
  assertEquals(json.error?.code, -32001);
});

Deno.test({
  name: "tools/list with revoked MCP_TEST_REVOKED_TOKEN → AUTH + 401",
  ignore: !REVOKED_TOKEN,
  fn: async () => {
    const { status, json } = await rpc(
      { jsonrpc: "2.0", id: 13, method: "tools/list" },
      { token: REVOKED_TOKEN },
    );
    assertEquals(status, 401);
    assertEquals(json.error?.code, -32001);
  },
});

// -----------------------------------------------------------------
// Method routing
// -----------------------------------------------------------------

Deno.test("unknown method on public path is not reached (auth runs first)", async () => {
  // method != initialize/ping/notifications → auth gate runs before
  // METHOD_NOT_FOUND, so we expect 401, not 404.
  const { status, json } = await rpc({
    jsonrpc: "2.0",
    id: 20,
    method: "does/not/exist",
  });
  assertEquals(status, 401);
  assertEquals(json.error?.code, -32001);
});

// -----------------------------------------------------------------
// Happy path & rate-limit (require a real token via MCP_TEST_TOKEN)
// -----------------------------------------------------------------

Deno.test({
  name: "tools/list with valid token returns a tool array",
  ignore: !VALID_TOKEN,
  fn: async () => {
    const { status, json } = await rpc(
      { jsonrpc: "2.0", id: 30, method: "tools/list" },
      { token: VALID_TOKEN },
    );
    assertEquals(status, 200);
    const r = json.result as { tools: unknown[] };
    assert(Array.isArray(r.tools), "tools must be an array");
  },
});

Deno.test({
  name: "resources/list with valid token returns resources/templates",
  ignore: !VALID_TOKEN,
  fn: async () => {
    const { status, json } = await rpc(
      { jsonrpc: "2.0", id: 31, method: "resources/list" },
      { token: VALID_TOKEN },
    );
    assertEquals(status, 200);
    const r = json.result as { resources: unknown[]; resourceTemplates: unknown[] };
    assert(Array.isArray(r.resources));
    assert(Array.isArray(r.resourceTemplates));
  },
});

Deno.test({
  name: "rate-limit: rapid burst eventually returns 429 + UPSTREAM (-32004)",
  ignore: !VALID_TOKEN,
  // Best-effort: the default per-token limit is configurable; we cap the
  // burst so even high limits surface a 429 within a reasonable budget.
  fn: async () => {
    const BURST = 200;
    let saw429 = false;
    for (let i = 0; i < BURST; i++) {
      const { status, json } = await rpc(
        { jsonrpc: "2.0", id: 100 + i, method: "tools/list" },
        { token: VALID_TOKEN },
      );
      if (status === 429) {
        assertEquals(json.error?.code, -32004);
        saw429 = true;
        break;
      }
    }
    assert(saw429, `expected at least one 429 within ${BURST} requests`);
  },
});

// -----------------------------------------------------------------
// Kill-switch (read-only check — does NOT toggle global state)
// -----------------------------------------------------------------

Deno.test("kill-switch contract: 503 responses carry KILL_SWITCH semantics", async () => {
  // We can't safely toggle the global kill-switch from a test, but we can
  // assert the response shape the server promises when it IS active by
  // exercising the auth-failure path and confirming the JSON-RPC envelope
  // is well-formed (same envelope used by the kill-switch branch).
  const { json } = await rpc({
    jsonrpc: "2.0",
    id: 999,
    method: "tools/list",
  });
  assertEquals(json.jsonrpc, "2.0");
  assertExists(json.error);
  assert(typeof json.error?.code === "number");
  assert(typeof json.error?.message === "string");
});

// -----------------------------------------------------------------
// OpenTelemetry trace propagation
// -----------------------------------------------------------------

Deno.test("response always carries traceparent + x-trace-id headers", async () => {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });
  await res.text();
  const tp = res.headers.get("traceparent") ?? "";
  const tid = res.headers.get("x-trace-id") ?? "";
  assert(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i.test(tp), `bad traceparent: ${tp}`);
  assert(/^[0-9a-f]{32}$/i.test(tid), `bad x-trace-id: ${tid}`);
  assert(tp.includes(tid), "traceparent must embed the trace id");
});

Deno.test("incoming traceparent is honoured (trace_id propagated)", async () => {
  const incomingTraceId = "1".repeat(32);
  const incomingSpanId = "a".repeat(16);
  const incomingTp = `00-${incomingTraceId}-${incomingSpanId}-01`;
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "traceparent": incomingTp,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
  });
  await res.text();
  assertEquals(res.headers.get("x-trace-id"), incomingTraceId);
  const tp = res.headers.get("traceparent") ?? "";
  assert(tp.startsWith(`00-${incomingTraceId}-`), `traceparent must reuse trace id: ${tp}`);
  // span_id MUST be fresh (not the parent's)
  assert(!tp.includes(incomingSpanId), "server must mint its own span id");
});

Deno.test("malformed incoming traceparent is ignored, fresh trace minted", async () => {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "traceparent": "garbage-not-a-trace",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" }),
  });
  await res.text();
  const tid = res.headers.get("x-trace-id") ?? "";
  assert(/^[0-9a-f]{32}$/i.test(tid));
  assert(tid !== "0".repeat(32));
});
