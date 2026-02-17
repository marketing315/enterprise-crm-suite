import { test, expect } from "../fixtures/auth";

/**
 * E2E Smoke Suite — runs on every PR.
 * 
 * Covers the highest-risk paths:
 *   - Login + brand selection
 *   - Core page rendering (pipeline, tickets, contacts, sales)
 *   - Auth guard enforcement
 * 
 * Tagged: @smoke (use --grep @smoke to run only these)
 */

const email = process.env.E2E_EMAIL!;
const password = process.env.E2E_PASSWORD!;
const brand = process.env.E2E_BRAND_NAME!;

test.describe("@smoke Core Flows", () => {

  test("S1: Login → brand select → dashboard loads", async ({ page, login, selectBrandIfNeeded }) => {
    await login(email, password);
    await selectBrandIfNeeded(brand);

    // Should land on a dashboard variant
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    // Page should have meaningful content (not blank/error)
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(50);
  });

  test("S2: Pipeline page renders kanban or table", async ({ page, login, selectBrandIfNeeded }) => {
    await login(email, password);
    await selectBrandIfNeeded(brand);

    await page.goto("/pipeline");
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    
    // Should show pipeline content (kanban columns or empty state)
    const hasContent = await page.locator("main").textContent();
    expect(hasContent?.length).toBeGreaterThan(10);
    // No unhandled error overlay
    const errorOverlay = page.locator('[data-testid="error-boundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });

  test("S3: Tickets page renders table", async ({ page, login, selectBrandIfNeeded }) => {
    await login(email, password);
    await selectBrandIfNeeded(brand);

    await page.goto("/tickets");
    // Either tickets-table or empty state should appear
    const table = page.locator('[data-testid="tickets-table"]');
    const emptyState = page.locator('text=/nessun ticket|no ticket/i');
    
    await Promise.race([
      table.waitFor({ timeout: 15000 }),
      emptyState.waitFor({ timeout: 15000 }),
    ]).catch(() => {});

    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test("S4: Contacts page renders", async ({ page, login, selectBrandIfNeeded }) => {
    await login(email, password);
    await selectBrandIfNeeded(brand);

    await page.goto("/contacts");
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10000 });
  });

  test("S5: Unauthenticated access redirects to /login", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("S6: Sales page renders", async ({ page, login, selectBrandIfNeeded }) => {
    await login(email, password);
    await selectBrandIfNeeded(brand);

    await page.goto("/sales");
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10000 });
  });
});
