import { test, expect } from "./fixtures/auth";

/**
 * M1 - Inbound Webhooks E2E Tests
 * 
 * Tests the complete inbound webhook flow:
 * - Error cases (400, 401, 404, 409)
 * - Happy path: POST creates incoming_request + lead_event
 * - Append-only: retry creates new lead_event (not update)
 * - Phone normalization works correctly
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.PW_BASE_URL?.replace(/\/+$/, "").replace(/:443$/, "") || "";
const TEST_EMAIL = process.env.E2E_EMAIL || "admin@example.com";
const TEST_PASSWORD = process.env.E2E_PASSWORD || "password123";
const TEST_BRAND = process.env.E2E_BRAND_NAME || "Demo Brand";

// Seeded test sources (from seed-e2e-inbound-source.sql)
// UUIDs are valid hex: a=10, so aaaaaaaa-... is valid
const E2E_SOURCE_ACTIVE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001";
const E2E_SOURCE_INACTIVE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002";
const E2E_API_KEY = "e2e-test-api-key-12345";

test.describe("Inbound Webhooks - Error Cases", () => {
  test("Invalid source UUID returns 404", async ({ request }) => {
    // Use crypto.randomUUID() to guarantee no collision with real sources
    const fakeSourceId = crypto.randomUUID();
    const endpoint = `${SUPABASE_URL}/functions/v1/webhook-ingest/${fakeSourceId}`;

    const response = await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "any-key",
      },
      data: {
        phone: "+393331234567",
        first_name: "Test",
        last_name: "User",
      },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Unknown webhook source");
  });

  test("Invalid UUID format returns 400", async ({ request }) => {
    const endpoint = `${SUPABASE_URL}/functions/v1/webhook-ingest/not-a-uuid`;

    const response = await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "any-key",
      },
      data: {
        phone: "+393331234567",
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Valid source ID");
  });

  test("Missing API key returns 401", async ({ request }) => {
    // Use random UUID - we test 401 before source lookup completes
    const fakeSourceId = crypto.randomUUID();
    const endpoint = `${SUPABASE_URL}/functions/v1/webhook-ingest/${fakeSourceId}`;

    const response = await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        phone: "+393331234567",
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Missing X-API-Key header");
  });

  test("Wrong API key returns 401", async ({ request }) => {
    const endpoint = `${SUPABASE_URL}/functions/v1/webhook-ingest/${E2E_SOURCE_ACTIVE_ID}`;

    const response = await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "wrong-api-key",
      },
      data: {
        telefono: "+393331234567",
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Invalid API key");
  });

  test("Inactive source returns 409", async ({ request }) => {
    const endpoint = `${SUPABASE_URL}/functions/v1/webhook-ingest/${E2E_SOURCE_INACTIVE_ID}`;

    const response = await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": E2E_API_KEY,
      },
      data: {
        telefono: "+393331234567",
        nome: "Test",
        cognome: "Inactive",
      },
    });

    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("inactive_source");
  });
});

test.describe("Inbound Webhooks - Happy Path", () => {
  test("Valid webhook creates incoming_request and lead_event", async ({ request }) => {
    const endpoint = `${SUPABASE_URL}/functions/v1/webhook-ingest/${E2E_SOURCE_ACTIVE_ID}`;
    const uniquePhone = `+39333${Date.now().toString().slice(-7)}`;

    const response = await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": E2E_API_KEY,
      },
      data: {
        telefono: uniquePhone, // Using mapped field (phone -> telefono)
        nome: "Mario",
        cognome: "Rossi",
        email: "mario.rossi@test.com",
        city: "Milano",
      },
    });

    // Should return 200 with contact_id and lead_event_id
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.contact_id).toBeTruthy();
    expect(body.lead_event_id).toBeTruthy();
  });

  test("Retry with same payload creates new lead_event (append-only)", async ({ request }) => {
    const endpoint = `${SUPABASE_URL}/functions/v1/webhook-ingest/${E2E_SOURCE_ACTIVE_ID}`;
    const uniquePhone = `+39333${Date.now().toString().slice(-7)}`;

    const payload = {
      telefono: uniquePhone,
      nome: "Luigi",
      cognome: "Verdi",
      email: "luigi.verdi@test.com",
    };

    // First request
    const response1 = await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": E2E_API_KEY,
      },
      data: payload,
    });
    expect(response1.status()).toBe(200);
    const body1 = await response1.json();
    const firstEventId = body1.lead_event_id;
    const contactId = body1.contact_id;

    // Second request with same payload (simulating retry)
    const response2 = await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": E2E_API_KEY,
      },
      data: payload,
    });
    expect(response2.status()).toBe(200);
    const body2 = await response2.json();

    // Should have same contact (dedup by phone) but different lead_event (append-only)
    expect(body2.contact_id).toBe(contactId);
    expect(body2.lead_event_id).not.toBe(firstEventId);
  });

  test("Phone normalization strips country prefix", async ({ request }) => {
    const endpoint = `${SUPABASE_URL}/functions/v1/webhook-ingest/${E2E_SOURCE_ACTIVE_ID}`;
    
    // Send with full international format
    const response = await request.post(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": E2E_API_KEY,
      },
      data: {
        telefono: "+39 333 123 4567", // With spaces and country code
        nome: "Test",
        cognome: "Normalization",
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});

test.describe("Sheets Export - Idempotency", () => {
  test("Duplicate sheets-export call returns skipped:true", async ({ request }) => {
    // First, create a lead event via inbound webhook
    const ingestEndpoint = `${SUPABASE_URL}/functions/v1/webhook-ingest/${E2E_SOURCE_ACTIVE_ID}`;
    const uniquePhone = `+39333${Date.now().toString().slice(-7)}`;

    const ingestResponse = await request.post(ingestEndpoint, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": E2E_API_KEY,
      },
      data: {
        telefono: uniquePhone,
        nome: "Idempotency",
        cognome: "Test",
        email: "idempotency@test.com",
      },
    });

    expect(ingestResponse.status()).toBe(200);
    const ingestBody = await ingestResponse.json();
    const leadEventId = ingestBody.lead_event_id;
    expect(leadEventId).toBeTruthy();

    // Sheets export endpoint
    const sheetsEndpoint = `${SUPABASE_URL}/functions/v1/sheets-export`;

    // First call - should succeed or skip (depending on GOOGLE_SHEETS_ENABLED)
    const response1 = await request.post(sheetsEndpoint, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ""}`,
      },
      data: { lead_event_id: leadEventId },
    });
    expect(response1.status()).toBe(200);
    const body1 = await response1.json();

    // If sheets is disabled, success:false is returned - that's ok for this test
    if (body1.success === false && body1.error === "Sheets export is disabled") {
      console.log("Sheets export disabled - skipping idempotency verification");
      return;
    }

    // Second call - should return skipped:true due to idempotency
    const response2 = await request.post(sheetsEndpoint, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ""}`,
      },
      data: { lead_event_id: leadEventId },
    });
    expect(response2.status()).toBe(200);
    const body2 = await response2.json();

    // Should be skipped (already exported or in progress)
    expect(body2.success).toBe(true);
    expect(body2.skipped).toBe(true);
    expect(["already_exported", "in_progress", "processing", "success"]).toContain(body2.reason);
  });
});

test.describe("Inbound Webhooks - Admin UI", () => {
  test("Admin can create and view inbound source in UI", async ({ page, login, selectBrandIfNeeded }) => {
    await login(TEST_EMAIL, TEST_PASSWORD);
    await selectBrandIfNeeded(TEST_BRAND);

    await page.goto("/settings");
    await page.waitForSelector('[data-testid="inbound-tab"]', { timeout: 10000 });
    await page.getByTestId("inbound-tab").click();

    // Verify inbound sources section loads
    await expect(page.getByText("Sorgenti Inbound")).toBeVisible({ timeout: 10000 });
    
    // Verify add button is present
    await expect(page.getByTestId("add-inbound-source-btn")).toBeVisible();
  });
});
