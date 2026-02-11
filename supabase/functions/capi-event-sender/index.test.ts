import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/capi-event-sender`;

/**
 * Auth table-driven tests for capi-event-sender.
 * These test the deployed function's auth layer via HTTP.
 */

async function callWithHeaders(headers: Record<string, string>): Promise<Response> {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({}),
  });
  // Always consume body to avoid resource leak
  const _body = await res.text();
  return res;
}

// 1. No auth header at all → 401
Deno.test("auth: missing headers → 401", async () => {
  const res = await callWithHeaders({});
  assertEquals(res.status, 401);
});

// 2. Empty x-cron-secret → 401 (not accepted even if env is empty)
Deno.test("auth: empty x-cron-secret → 401", async () => {
  const res = await callWithHeaders({ "x-cron-secret": "" });
  assertEquals(res.status, 401);
});

// 3. Wrong x-cron-secret → 401
Deno.test("auth: wrong x-cron-secret → 401", async () => {
  const res = await callWithHeaders({ "x-cron-secret": "totally-wrong-value-12345" });
  assertEquals(res.status, 401);
});

// 4. Invalid Bearer token → 401
Deno.test("auth: invalid Bearer token → 401", async () => {
  const res = await callWithHeaders({ Authorization: "Bearer not.a.jwt" });
  assertEquals(res.status, 401);
});

// 5. JWT with wrong project ref → 401
Deno.test("auth: JWT with wrong ref → 401", async () => {
  // Craft a fake JWT with wrong ref (unsigned, just testing parsing)
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ iss: "supabase", ref: "wrong_project_ref", role: "service_role" }));
  const fakeJwt = `${header}.${payload}.fake_signature`;
  const res = await callWithHeaders({ Authorization: `Bearer ${fakeJwt}` });
  assertEquals(res.status, 401);
});

// 6. Valid anon key → should be accepted (200 or other non-401)
Deno.test("auth: valid anon key → not 401", async () => {
  const res = await callWithHeaders({ Authorization: `Bearer ${SUPABASE_ANON_KEY}` });
  // Should pass auth (may return 200 with processed:0 or 500 for other reasons, but NOT 401)
  assertEquals(res.status !== 401, true, `Expected non-401 but got ${res.status}`);
});
