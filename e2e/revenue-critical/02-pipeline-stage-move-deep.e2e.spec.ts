import { test, expect } from "../fixtures/auth";

/**
 * Revenue-Critical Flow #2 — DEEP variant
 *
 * Verifies that after a webhook ingestion creates a contact, the system
 * correctly tracks any deal/stage state. We do NOT mutate stage from the
 * test (RLS-safe, no race conditions); we only assert the read model
 * exposes the deal counters via the snapshot RPC.
 *
 * Extended scenarios:
 *   - R2.D3 idempotent retry of the same webhook payload
 *   - R2.D4 phone-number format migration / dedup
 *
 * Skipped automatically if env not configured.
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
  const res = await request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      data: { email, password },
    },
  );
  if (!res.ok()) return null;
  const body = await res.json();
  return body.access_token ?? null;
}

async function snapshot(request: any, token: string, phone: string) {
  const res = await request.post(
    `${SUPABASE_URL}/rest/v1/rpc/e2e_revenue_snapshot`,
    {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { p_phone: phone },
    },
  );
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`snapshot RPC failed ${res.status()}: ${text}`);
  }
  return res.json();
}

async function ingest(request: any, payload: Record<string, unknown>) {
  return request.post(
    `${SUPABASE_URL}/functions/v1/webhook-ingest/${E2E_SOURCE_ACTIVE_ID}?api_key=${E2E_API_KEY}`,
    { data: payload },
  );
}

async function pollUntilFound(
  request: any,
  token: string,
  phone: string,
  maxSeconds = 15,
) {
  let snap: any = null;
  for (let i = 0; i < maxSeconds; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    snap = await snapshot(request, token, phone);
    if (snap.contact_found) break;
  }
  return snap;
}

test.describe("@revenue-critical Pipeline Stage Move (DEEP)", () => {
  test.skip(!SUPABASE_URL, "VITE_SUPABASE_URL not configured");
  test.skip(!email || !password, "E2E credentials not configured");

  test("R2.D1: ingested lead exposes deals snapshot via RPC", async ({ request }) => {
    const token = await getAccessToken(request);
    test.skip(!token, "could not obtain access token");

    const phoneSuffix = String(Date.now()).slice(-7);
    const phone = `+39335${phoneSuffix}`;

    const ingestRes = await ingest(request, {
      first_name: "E2E",
      last_name: "Pipeline",
      phone,
      email: `e2e-pipeline-${phoneSuffix}@test.local`,
    });
    expect([200, 202]).toContain(ingestRes.status());

    const snap = await pollUntilFound(request, token!, phone);

    expect(snap.contact_found, "contact must be created").toBe(true);
    expect(snap.deals, "deals snapshot key must be present").toBeDefined();
    expect(typeof snap.deals.total, "deals.total must be a number").toBe("number");
    expect(snap.deals.total, "deals.total must be >= 0").toBeGreaterThanOrEqual(0);
    expect(
      typeof snap.deals.recent_stage_transitions_10min,
      "transitions counter present",
    ).toBe("number");
  });

  test("R2.D2: snapshot is consistent across two consecutive reads", async ({ request }) => {
    const token = await getAccessToken(request);
    test.skip(!token, "could not obtain access token");

    const phoneSuffix = String(Date.now()).slice(-7);
    const phone = `+39336${phoneSuffix}`;

    await ingest(request, {
      first_name: "E2E",
      last_name: "Consistency",
      phone,
      email: `e2e-consist-${phoneSuffix}@test.local`,
    });

    await new Promise((r) => setTimeout(r, 5000));

    const a = await snapshot(request, token!, phone);
    await new Promise((r) => setTimeout(r, 1000));
    const b = await snapshot(request, token!, phone);

    expect(b.contact_id).toBe(a.contact_id);
    expect(b.deals.total).toBeGreaterThanOrEqual(a.deals.total);
    expect(b.appointments.total).toBeGreaterThanOrEqual(a.appointments.total);
  });

  test("R2.D3: repeated webhook with same payload does not duplicate the deal", async ({
    request,
  }) => {
    const token = await getAccessToken(request);
    test.skip(!token, "could not obtain access token");

    const phoneSuffix = String(Date.now()).slice(-7);
    const phone = `+39338${phoneSuffix}`;
    const payload = {
      first_name: "E2E",
      last_name: "Retry",
      phone,
      email: `e2e-retry-${phoneSuffix}@test.local`,
    };

    // First ingestion (sets baseline)
    const r1 = await ingest(request, payload);
    expect([200, 202]).toContain(r1.status());

    const baseline = await pollUntilFound(request, token!, phone);
    expect(baseline.contact_found).toBe(true);
    const baseContactId = baseline.contact_id;
    const baseDealTotal = baseline.deals.total as number;

    // Replay the very same payload twice (simulates n8n / provider retry)
    const r2 = await ingest(request, payload);
    const r3 = await ingest(request, payload);
    expect([200, 202, 409]).toContain(r2.status());
    expect([200, 202, 409]).toContain(r3.status());

    await new Promise((r) => setTimeout(r, 4000));
    const after = await snapshot(request, token!, phone);

    // Identity must be preserved
    expect(after.contact_id, "same contact_id after retries").toBe(baseContactId);
    // Deal count must NOT explode (idempotency contract)
    expect(
      after.deals.total,
      "deal count must not grow because of pure-retry events",
    ).toBe(baseDealTotal);
    // Phone rows: one row per contact_phone is allowed; we just guard against runaway growth
    expect(after.phone_rows, "phone_rows must stay <= 3 after retries").toBeLessThanOrEqual(3);
  });

  test("R2.D4: phone-format variants resolve to the same contact", async ({ request }) => {
    const token = await getAccessToken(request);
    test.skip(!token, "could not obtain access token");

    const phoneSuffix = String(Date.now()).slice(-7);
    const local = `335${phoneSuffix}`;
    const e164 = `+39${local}`;
    const intlPrefix = `0039${local}`;

    // Create the contact using E.164
    const ingestRes = await ingest(request, {
      first_name: "E2E",
      last_name: "PhoneMigration",
      phone: e164,
      email: `e2e-phone-${phoneSuffix}@test.local`,
    });
    expect([200, 202]).toContain(ingestRes.status());

    const baseline = await pollUntilFound(request, token!, e164);
    expect(baseline.contact_found).toBe(true);
    const baseContactId = baseline.contact_id;

    // Look up the same contact via the local-only format
    const localSnap = await snapshot(request, token!, local);
    expect(
      localSnap.contact_id,
      "10-digit local phone must map to same contact",
    ).toBe(baseContactId);

    // Look up via 0039-prefixed format
    const intlSnap = await snapshot(request, token!, intlPrefix);
    expect(
      intlSnap.contact_id,
      "0039-prefixed phone must map to same contact",
    ).toBe(baseContactId);

    // Phone rows must remain bounded — dedup must not spawn one row per format
    expect(
      baseline.phone_rows,
      "phone_rows for a single ingestion must stay small (<= 2)",
    ).toBeLessThanOrEqual(2);
  });
});
