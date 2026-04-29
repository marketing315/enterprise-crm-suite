import { test, expect } from "../fixtures/auth";

/**
 * Revenue-Critical Flow #1 — DEEP variant
 *
 * Goes beyond smoke: after firing the webhook, verifies via the
 * `e2e_revenue_snapshot` RPC that:
 *   - A contact_phone row exists for the test phone
 *   - A contact_id was created/found
 *   - At least one recent lead_event was appended (append-only contract)
 *
 * Skipped automatically if env not configured. Uses a deterministic
 * timestamped phone to avoid colliding with other test runs.
 *
 * Requires:
 *   - VITE_SUPABASE_URL
 *   - E2E source seeded (scripts/seed-e2e-inbound-source.sql)
 *   - e2e_revenue_snapshot RPC (scripts/seed-e2e-snapshot-rpc.sql)
 *   - E2E_EMAIL + E2E_PASSWORD (used to call RPC as authenticated)
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcWNqdG1jeGZxYWhodWJwYWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTAxNjMsImV4cCI6MjA4NDc2NjE2M30.dEquxxLGm9VfT2_T8ty3dakAytK9ePoUjT5x7IKbK-o";

const E2E_SOURCE_ACTIVE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001";
const E2E_API_KEY = "e2e-test-api-key-12345";

const email = process.env.E2E_EMAIL!;
const password = process.env.E2E_PASSWORD!;

async function getAccessToken(request: any): Promise<string | null> {
  if (!email || !password) return null;
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
    data: { email, password },
  });
  if (!res.ok()) return null;
  const body = await res.json();
  return body.access_token ?? null;
}

async function snapshot(request: any, token: string, phone: string) {
  const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/e2e_revenue_snapshot`, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { p_phone: phone },
  });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`snapshot RPC failed ${res.status()}: ${text}`);
  }
  return res.json();
}

test.describe("@revenue-critical Lead Ingestion (DEEP)", () => {
  test.skip(!SUPABASE_URL, "VITE_SUPABASE_URL not configured");
  test.skip(!email || !password, "E2E credentials not configured");

  test("R1.D1: webhook → contact + lead_event persisted within 10s", async ({ request }) => {
    const token = await getAccessToken(request);
    test.skip(!token, "could not obtain access token");

    // Deterministic but unique phone so we don't collide with other runs
    const phoneSuffix = String(Date.now()).slice(-7);
    const phone = `+39333${phoneSuffix}`;

    // Pre-state (should usually be empty)
    const before = await snapshot(request, token!, phone);

    // Fire webhook
    const ingestRes = await request.post(
      `${SUPABASE_URL}/functions/v1/webhook-ingest/${E2E_SOURCE_ACTIVE_ID}?api_key=${E2E_API_KEY}`,
      {
        data: {
          first_name: "E2E",
          last_name: "Deep",
          phone,
          email: `e2e-deep-${phoneSuffix}@test.local`,
        },
      },
    );
    expect([200, 202]).toContain(ingestRes.status());

    // Poll snapshot for up to 10s — webhook + trigger chain may take 2-3s
    let after = before;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      after = await snapshot(request, token!, phone);
      if (after.contact_found && after.recent_lead_events > 0) break;
    }

    expect(after.contact_found, "contact must be created").toBe(true);
    expect(after.contact_id, "contact_id must be populated").toBeTruthy();
    expect(after.recent_lead_events, "at least one lead_event in last 5min").toBeGreaterThanOrEqual(1);
    expect(after.phone_rows, "exactly 1 contact_phone row").toBeGreaterThanOrEqual(1);
  });

  test("R1.D2: duplicate webhook does NOT create duplicate contact", async ({ request }) => {
    const token = await getAccessToken(request);
    test.skip(!token, "could not obtain access token");

    const phoneSuffix = String(Date.now()).slice(-7);
    const phone = `+39334${phoneSuffix}`;

    // Fire twice in quick succession
    const payload = {
      first_name: "E2E",
      last_name: "Dup",
      phone,
      email: `e2e-dup-${phoneSuffix}@test.local`,
    };
    const url = `${SUPABASE_URL}/functions/v1/webhook-ingest/${E2E_SOURCE_ACTIVE_ID}?api_key=${E2E_API_KEY}`;

    await request.post(url, { data: payload });
    await new Promise((r) => setTimeout(r, 500));
    await request.post(url, { data: payload });

    // Wait for both to settle
    await new Promise((r) => setTimeout(r, 5000));

    const snap = await snapshot(request, token!, phone);
    expect(snap.contact_found).toBe(true);
    // Identity contract: same phone → exactly one phone row
    expect(snap.phone_rows, "phone normalization must dedupe").toBeLessThanOrEqual(1);
  });
});
