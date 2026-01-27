import { test, expect } from "./fixtures/auth";

/**
 * M8 Step E2 - Webhook Dashboard E2E Smoke Test
 * 
 * Prerequisites:
 * - Test user with admin role on at least one brand
 * - Test credentials in environment: E2E_EMAIL, E2E_PASSWORD, E2E_BRAND_NAME
 */

const TEST_EMAIL = process.env.E2E_EMAIL || "admin@example.com";
const TEST_PASSWORD = process.env.E2E_PASSWORD || "password123";
const TEST_BRAND = process.env.E2E_BRAND_NAME || "Demo Brand";

test.describe("Webhook Monitoring Dashboard", () => {
  test("Admin can view webhook dashboard with KPIs and charts", async ({ page, login, selectBrandIfNeeded }) => {
    // Step 1: Login and select brand
    await login(TEST_EMAIL, TEST_PASSWORD);
    await selectBrandIfNeeded(TEST_BRAND);

    // Step 2: Navigate to webhooks dashboard via sidebar
    await page.getByTestId("nav-webhooks-dashboard").click();
    await page.waitForURL(/\/admin\/webhooks/, { timeout: 10000 });

    // Step 3: Verify page loaded with required sections
    await page.waitForSelector('[data-testid="webhooks-dashboard-page"]', { timeout: 10000 });

    // Verify KPIs section is visible
    const kpisSection = page.getByTestId("webhooks-dashboard-kpis");
    await expect(kpisSection).toBeVisible({ timeout: 15000 });

    // Verify timeseries/charts section is visible
    const timeseriesSection = page.getByTestId("webhooks-dashboard-timeseries");
    await expect(timeseriesSection).toBeVisible({ timeout: 15000 });

    // Verify latest deliveries section is visible
    const deliveriesSection = page.getByTestId("webhooks-dashboard-latest-deliveries");
    await expect(deliveriesSection).toBeVisible({ timeout: 15000 });
  });

  test("Webhook dashboard shows errors section", async ({ page, login, selectBrandIfNeeded }) => {
    await login(TEST_EMAIL, TEST_PASSWORD);
    await selectBrandIfNeeded(TEST_BRAND);

    await page.goto("/admin/webhooks");
    await page.waitForSelector('[data-testid="webhooks-dashboard-page"]', { timeout: 10000 });

    // Verify errors section is visible (may show "no data" message if empty)
    const errorsSection = page.getByTestId("webhooks-dashboard-errors");
    await expect(errorsSection).toBeVisible({ timeout: 15000 });
  });
});
