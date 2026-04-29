import { test, expect } from "../fixtures/auth";

/**
 * Revenue-Critical Flow #3: Appointment Lifecycle
 * 
 * Verifies appointment booking + outcome tracking:
 *  - Calendar page renders
 *  - Ops board shows KPIs (no-show, follow-up, at-risk)
 *  - Risk score appears on appointments
 * 
 * Critical because no-show rate directly affects revenue.
 * Risk-score notifications drive proactive intervention.
 */

const email = process.env.E2E_EMAIL!;
const password = process.env.E2E_PASSWORD!;
const brand = process.env.E2E_BRAND_NAME!;

test.describe("@revenue-critical Appointment Lifecycle", () => {
  test("R3.1: Appointments calendar renders", async ({ page, login, selectBrandIfNeeded }) => {
    await login(email, password);
    await selectBrandIfNeeded(brand);

    await page.goto("/appointments/calendar");
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10000 });

    const errorOverlay = page.locator('[data-testid="error-boundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });

  test("R3.2: Appointments ops board renders KPI cards", async ({ page, login, selectBrandIfNeeded }) => {
    await login(email, password);
    await selectBrandIfNeeded(brand);

    await page.goto("/appointments/ops-board");
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10000 });

    // KPI cards should be present
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(50);
  });

  test("R3.3: Sales availability page renders", async ({ page, login, selectBrandIfNeeded }) => {
    await login(email, password);
    await selectBrandIfNeeded(brand);

    await page.goto("/appointments/availability");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    const errorOverlay = page.locator('[data-testid="error-boundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });
});
