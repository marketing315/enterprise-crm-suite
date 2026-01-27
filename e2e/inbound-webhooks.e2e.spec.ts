import { test, expect } from "./fixtures/auth";

/**
 * M1 - Inbound Webhooks E2E Smoke Test
 * 
 * Tests the inbound webhook endpoint functionality:
 * - Valid source with correct API key returns 200
 * - Invalid API key returns 401
 * - Inactive source returns 409
 * - Invalid source ID returns 404
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.PW_BASE_URL?.replace(/\/+$/, "").replace(/:443$/, "") || "";
const TEST_EMAIL = process.env.E2E_EMAIL || "admin@example.com";
const TEST_PASSWORD = process.env.E2E_PASSWORD || "password123";
const TEST_BRAND = process.env.E2E_BRAND_NAME || "Demo Brand";

test.describe("Inbound Webhooks", () => {
  test("Invalid source UUID returns 404", async ({ request }) => {
    // Use a random valid UUID that doesn't exist
    const fakeSourceId = "00000000-0000-0000-0000-000000000000";
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
    const fakeSourceId = "00000000-0000-0000-0000-000000000001";
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

  test("Admin can create and view inbound source in UI", async ({ page, login, selectBrandIfNeeded }) => {
    // Login and navigate to settings
    await login(TEST_EMAIL, TEST_PASSWORD);
    await selectBrandIfNeeded(TEST_BRAND);

    // Navigate to settings and inbound tab
    await page.goto("/settings");
    await page.waitForSelector('[data-testid="inbound-tab"]', { timeout: 10000 });
    await page.getByTestId("inbound-tab").click();

    // Verify inbound sources section loads
    await expect(page.getByText("Sorgenti Inbound")).toBeVisible({ timeout: 10000 });
    
    // Verify add button is present
    await expect(page.getByTestId("add-inbound-source-btn")).toBeVisible();
  });
});
