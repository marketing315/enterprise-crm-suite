import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/capi-event-sender`;

/**
 * Auth table-driven tests for capi-event-sender.
 * Policy: only x-cron-secret (current/previous) or service_role JWT are accepted.
 * anon, authenticated, and invalid tokens must be rejected with 401.
 */

async function callWithHeaders(headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({}),
  });
  const body = await res.text(); // always consume to avoid resource leak
  return { status: res.status, body };
}

// 1. No auth header at all → 401
Deno.test("auth: missing headers → 401", async () => {
  const { status } = await callWithHeaders({});
  assertEquals(status, 401);
});

// 2. Empty x-cron-secret → 401
Deno.test("auth: empty x-cron-secret → 401", async () => {
  const { status } = await callWithHeaders({ "x-cron-secret": "" });
  assertEquals(status, 401);
});

// 3. Wrong x-cron-secret → 401
Deno.test("auth: wrong x-cron-secret → 401", async () => {
  const { status } = await callWithHeaders({ "x-cron-secret": "totally-wrong-value-12345" });
  assertEquals(status, 401);
});

// 4. Invalid Bearer token → 401
Deno.test("auth: invalid Bearer token → 401", async () => {
  const { status } = await callWithHeaders({ Authorization: "Bearer not.a.jwt" });
  assertEquals(status, 401);
});

// 5. JWT with wrong project ref → 401
Deno.test("auth: JWT with wrong ref → 401", async () => {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ iss: "supabase", ref: "wrong_project_ref", role: "service_role" }));
  const fakeJwt = `${header}.${payload}.fake_signature`;
  const { status } = await callWithHeaders({ Authorization: `Bearer ${fakeJwt}` });
  assertEquals(status, 401);
});

// 6. Anon key → 401 (anon is NOT authorized for this function)
Deno.test("auth: anon key → 401", async () => {
  const { status } = await callWithHeaders({ Authorization: `Bearer ${SUPABASE_ANON_KEY}` });
  assertEquals(status, 401, "Anon key must be rejected — only service_role and cron_secret are allowed");
});

// 7. JWT with correct ref but role=authenticated → 401
Deno.test("auth: authenticated JWT → 401", async () => {
  // Extract project ref from URL for a realistic but unauthorized JWT
  const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ iss: "supabase", ref: projectRef, role: "authenticated", sub: "fake-user" }));
  const fakeJwt = `${header}.${payload}.fake_signature`;
  const { status } = await callWithHeaders({ Authorization: `Bearer ${fakeJwt}` });
  assertEquals(status, 401, "Authenticated JWT must be rejected");
});

// 8. 401 response must not leak internal details
Deno.test("auth: 401 body is sanitized", async () => {
  const { status, body } = await callWithHeaders({});
  assertEquals(status, 401);
  const parsed = JSON.parse(body);
  assertEquals(parsed.error, "Unauthorized");
  // Must NOT contain internal info
  assertEquals(Object.keys(parsed).length, 1, "401 body should only contain { error }");
});
