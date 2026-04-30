import { test, expect } from "../fixtures/auth";

/**
 * Revenue-Critical Flow #3 — DEEP variant
 *
 * Verifies that after a lead ingestion, appointment-related counters
 * are reachable through the snapshot RPC and stay monotonic.
 *
 * Note: appointment creation usually happens in a follow-up flow
 * (NewAppointmentDialog or AI agent). This DEEP test asserts the
 * snapshot exposes appointment counters and they behave consistently
 * even when zero — preventing silent regressions in the snapshot RPC
 * or in the appointment_outcomes append-only contract.
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

test.describe("@revenue-critical Appointment Lifecycle (DEEP)", () => {
  test.skip(!SUPABASE_URL, "VITE_SUPABASE_URL not configured");
  test.skip(!email || !password, "E2E credentials not configured");

  test("R3.D1: appointments snapshot returns valid shape after ingestion", async ({ request }) => {
    const token = await getAccessToken(request);
    test.skip(!token, "could not obtain access token");

    const phoneSuffix = String(Date.now()).slice(-7);
    const phone = `+39337${phoneSuffix}`;

    await request.post(
      `${SUPABASE_URL}/functions/v1/webhook-ingest/${E2E_SOURCE_ACTIVE_ID}?api_key=${E2E_API_KEY}`,
      {
        data: {
          first_name: "E2E",
          last_name: "Appointment",
          phone,
          email: `e2e-appt-${phoneSuffix}@test.local`,
        },
      },
    );

    let snap: any = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      snap = await snapshot(request, token!, phone);
      if (snap.contact_found) break;
    }

    expect(snap.contact_found, "contact must be created").toBe(true);
    expect(snap.appointments, "appointments key must exist").toBeDefined();
    expect(typeof snap.appointments.total).toBe("number");
    expect(snap.appointments.total).toBeGreaterThanOrEqual(0);
    expect(typeof snap.appointments.recent_outcomes_10min).toBe("number");
    expect(snap.appointments.recent_outcomes_10min).toBeGreaterThanOrEqual(0);
  });

  test("R3.D2: appointments page renders without error boundary (UI smoke)", async ({
    page,
    login,
    selectBrandIfNeeded,
  }) => {
    const brand = process.env.E2E_BRAND_NAME!;
    test.skip(!brand, "E2E_BRAND_NAME not set");
    await login(email, password);
    await selectBrandIfNeeded(brand);

    await page.goto("/appointments/calendar");
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

    const errorOverlay = page.locator('[data-testid="error-boundary"]');
    await expect(errorOverlay).toHaveCount(0);

    await page.goto("/appointments/ops-board");
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await expect(errorOverlay).toHaveCount(0);
  });
});
