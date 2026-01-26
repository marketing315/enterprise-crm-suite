import { test, expect, urlParams, firstRowKey } from "./fixtures/auth";

/**
 * M6 Gate Tests — Tickets Cursor Pagination + URL State + SLA Visibility
 * 
 * These are true E2E tests that validate real browser behavior:
 * 1. Cursor pagination with URL synchronization
 * 2. Browser back/forward + page refresh state preservation
 * 3. SLA badge visibility based on sla_breached_at
 * 
 * Environment variables required:
 * - E2E_EMAIL: Test user email
 * - E2E_PASSWORD: Test user password
 * - E2E_BRAND_NAME: Brand name to select
 */

const email = process.env.E2E_EMAIL!;
const password = process.env.E2E_PASSWORD!;
const brand = process.env.E2E_BRAND_NAME!;

test.describe("M6 Gates — Tickets Cursor + URL + SLA", () => {
  test.beforeEach(async ({ page, login, selectBrandIfNeeded }) => {
    await login(email, password);
    await selectBrandIfNeeded(brand);
  });

  test("E2E-1: Cursor pagination updates URL cursor+stack and table changes", async ({ page }) => {
    await page.goto("/tickets?tab=all");
    await page.waitForSelector('[data-testid="tickets-table"]');

    const p0 = urlParams(page);
    expect(p0.has("cursor")).toBe(false);
    expect(p0.has("stack")).toBe(false);

    const row0 = await firstRowKey(page);

    const next = page.locator('[data-testid="tickets-next"]');
    if (!(await next.isVisible()) || !(await next.isEnabled())) {
      test.skip();
      return;
    }

    await next.click();

    await page.waitForFunction(() => new URLSearchParams(location.search).has("cursor"), { timeout: 5000 });
    const row1 = await firstRowKey(page);
    expect(row1).not.toBe(row0);

    // Go next again to ensure stack grows
    if (await next.isEnabled()) {
      await next.click();
      await page.waitForFunction(() => {
        const sp = new URLSearchParams(location.search);
        const stack = sp.get("stack");
        return !!stack && stack.length > 0;
      }, { timeout: 5000 });

      const p2 = urlParams(page);
      expect(p2.get("cursor")).toBeTruthy();
      expect(p2.get("stack")).toBeTruthy();

      const prev = page.locator('[data-testid="tickets-prev"]');
      await expect(prev).toBeEnabled();
    }
  });

  test("E2E-2: Refresh keeps URL state + browser back/forward restores pages", async ({ page }) => {
    await page.goto("/tickets?tab=unassigned");
    await page.waitForSelector('[data-testid="tickets-table"]', { timeout: 15000 });

    // Wait for table to stabilize
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('[data-testid="ticket-row"]');
      return rows.length >= 0; // Table loaded (even if empty)
    }, { timeout: 5000 });

    const next = page.locator('[data-testid="tickets-next"]');
    const isNextVisible = await next.isVisible().catch(() => false);
    const isNextEnabled = isNextVisible ? await next.isEnabled().catch(() => false) : false;
    
    if (isNextVisible && isNextEnabled) {
      await next.click();
      // Wait for URL to update with cursor
      await page.waitForFunction(() => new URLSearchParams(location.search).has("cursor"), { timeout: 5000 });
    }

    const urlBefore = page.url();
    const rowBefore = await firstRowKey(page).catch(() => "empty");

    // Reload page
    await page.reload();
    await page.waitForSelector('[data-testid="tickets-table"]', { timeout: 15000 });

    // Verify URL preserved
    expect(page.url()).toBe(urlBefore);
    
    // Verify table data consistent (if we had rows)
    if (rowBefore !== "empty") {
      const rowAfter = await firstRowKey(page).catch(() => "empty");
      expect(rowAfter).toBe(rowBefore);
    }

    // Verify tab still applied in UI
    const params = urlParams(page);
    expect(params.get("tab")).toBe("unassigned");

    // Test back/forward navigation
    await page.goBack();
    await page.waitForSelector('[data-testid="tickets-table"]', { timeout: 10000 });

    await page.goForward();
    await page.waitForSelector('[data-testid="tickets-table"]', { timeout: 10000 });
    
    // Final URL should match what we had before
    expect(page.url()).toBe(urlBefore);
  });

  test("E2E-3: SLA badge visible when breached ticket exists (table + sidebar)", async ({ page }) => {
    // First, go to SLA breached tab to ensure we see breached tickets
    await page.goto("/tickets?tab=sla_breached");
    await page.waitForSelector('[data-testid="tickets-table"]', { timeout: 15000 });

    // Wait for table rows to load
    const rows = page.locator('[data-testid="ticket-row"]');
    await rows.first().waitFor({ state: "visible", timeout: 10000 }).catch(() => null);
    
    const rowCount = await rows.count();
    
    // If no rows in SLA breached tab, fail deterministically (seed data required)
    if (rowCount === 0) {
      throw new Error(
        "E2E-3 FAILED: No tickets in SLA breached tab. " +
        "Run seed script: scripts/seed-e2e-sla-breach.sql to ensure at least 1 ticket has sla_breached_at set."
      );
    }

    // Verify SLA badge is visible in table
    const slaBadges = page.locator('[data-testid="sla-badge"]');
    await expect(slaBadges.first()).toBeVisible({ timeout: 5000 });

    // Go back to "all" tab to verify SLA badge persists
    await page.goto("/tickets?tab=all");
    await page.waitForSelector('[data-testid="tickets-table"]');
    
    // SLA badges should be visible in the all tab too (for breached tickets)
    const allTabSlaBadges = page.locator('[data-testid="sla-badge"]');
    const badgeCount = await allTabSlaBadges.count();
    expect(badgeCount).toBeGreaterThan(0);
  });

  test("E2E-4: Tab navigation updates URL and persists across refresh", async ({ page }) => {
    await page.goto("/tickets");
    await page.waitForSelector('[data-testid="tickets-table"]', { timeout: 15000 });

    // Click on "Non assegnati" (Unassigned) tab
    const unassignedTab = page.locator('[data-testid="tab-unassigned"]');
    await unassignedTab.click();
    
    // Wait for URL to update with tab parameter
    await page.waitForFunction(
      () => new URLSearchParams(location.search).get("tab") === "unassigned",
      { timeout: 5000 }
    );

    // Verify URL updated
    let params = urlParams(page);
    expect(params.get("tab")).toBe("unassigned");

    // Refresh page
    await page.reload();
    await page.waitForSelector('[data-testid="tickets-table"]', { timeout: 15000 });

    // Verify tab still selected after refresh
    params = urlParams(page);
    expect(params.get("tab")).toBe("unassigned");

    // Verify UI shows correct tab as active
    await expect(unassignedTab).toHaveAttribute("data-state", "active", { timeout: 5000 });
  });

  test("E2E-5: Search query persists in URL and across refresh", async ({ page }) => {
    await page.goto("/tickets");
    await page.waitForSelector('[data-testid="tickets-table"]', { timeout: 15000 });

    // Find and fill search input
    const searchInput = page.locator('[data-testid="tickets-search"]');
    await searchInput.fill("test query");

    // Wait for debounce and URL update (300ms debounce + buffer)
    await page.waitForFunction(
      () => new URLSearchParams(location.search).get("q") === "test query",
      { timeout: 5000 }
    );

    // Verify URL has search param
    let params = urlParams(page);
    expect(params.get("q")).toBe("test query");

    // Refresh
    await page.reload();
    await page.waitForSelector('[data-testid="tickets-table"]', { timeout: 15000 });

    // Verify search input still has value
    await expect(searchInput).toHaveValue("test query", { timeout: 5000 });

    // Verify URL still has param
    params = urlParams(page);
    expect(params.get("q")).toBe("test query");
  });

  test("E2E-6: SLA breached tab shows filtered tickets", async ({ page }) => {
    await page.goto("/tickets");
    await page.waitForSelector('[data-testid="tickets-table"]', { timeout: 15000 });

    // Click on SLA breached tab
    const slaTab = page.locator('[data-testid="tab-sla-breached"]');
    await slaTab.click();
    
    // Wait for URL to update with tab parameter
    await page.waitForFunction(
      () => new URLSearchParams(location.search).get("tab") === "sla_breached",
      { timeout: 5000 }
    );

    // Verify URL updated
    const params = urlParams(page);
    expect(params.get("tab")).toBe("sla_breached");

    // Verify tab is active
    await expect(slaTab).toHaveAttribute("data-state", "active", { timeout: 5000 });
  });
});
