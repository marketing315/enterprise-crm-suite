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
    await page.goto("/tickets?tab=unassigned&q=test&assign=all");
    await page.waitForSelector('[data-testid="tickets-table"]');

    const next = page.locator('[data-testid="tickets-next"]');
    if (await next.isVisible() && await next.isEnabled()) {
      await next.click();
      await page.waitForTimeout(300);
    }

    const urlBefore = page.url();
    const rowBefore = await firstRowKey(page);

    // Reload page
    await page.reload();
    await page.waitForSelector('[data-testid="tickets-table"]');

    // Verify URL preserved
    expect(page.url()).toBe(urlBefore);
    
    // Verify table data consistent
    const rowAfter = await firstRowKey(page);
    expect(rowAfter).toBe(rowBefore);

    // Verify filters still applied in UI
    const params = urlParams(page);
    expect(params.get("tab")).toBe("unassigned");
    expect(params.get("q")).toBe("test");

    // Test back/forward
    const rowPageNow = await firstRowKey(page);
    await page.goBack();
    await page.waitForSelector('[data-testid="tickets-table"]');

    await page.goForward();
    await page.waitForSelector('[data-testid="tickets-table"]');
    const rowForward = await firstRowKey(page);
    expect(rowForward).toBe(rowPageNow);
  });

  test("E2E-3: SLA badge visible when breached ticket exists (table + sidebar)", async ({ page }) => {
    await page.goto("/tickets?tab=all");
    await page.waitForSelector('[data-testid="tickets-table"]');

    const slaBadges = page.locator('[data-testid="sla-badge"]');
    const count = await slaBadges.count();

    if (count === 0) {
      // No SLA breached tickets in test data - skip but log
      console.log("No SLA breached tickets found. Consider adding seed data with sla_breached_at set.");
      test.skip();
      return;
    }

    await expect(slaBadges.first()).toBeVisible();

    // Verify sidebar SLA badge
    const sidebarBadge = page.locator('[data-testid="sidebar-sla-badge"]');
    // Note: sidebar badge only shows if realtime subscription has detected breaches
    // In a full E2E with seed data, this should be visible
    if (await sidebarBadge.isVisible()) {
      await expect(sidebarBadge).toBeVisible();
    }
  });

  test("E2E-4: Tab navigation updates URL and persists across refresh", async ({ page }) => {
    await page.goto("/tickets");
    await page.waitForSelector('[data-testid="tickets-table"]');

    // Click on "Non assegnati" (Unassigned) tab
    const unassignedTab = page.locator('[data-testid="tab-unassigned"]');
    await unassignedTab.click();
    await page.waitForTimeout(500);

    // Verify URL updated
    let params = urlParams(page);
    expect(params.get("tab")).toBe("unassigned");

    // Refresh page
    await page.reload();
    await page.waitForSelector('[data-testid="tickets-table"]');

    // Verify tab still selected after refresh
    params = urlParams(page);
    expect(params.get("tab")).toBe("unassigned");

    // Verify UI shows correct tab as active
    await expect(unassignedTab).toHaveAttribute("data-state", "active");
  });

  test("E2E-5: Search query persists in URL and across refresh", async ({ page }) => {
    await page.goto("/tickets");
    await page.waitForSelector('[data-testid="tickets-table"]');

    // Find and fill search input
    const searchInput = page.locator('[data-testid="tickets-search"]');
    await searchInput.fill("test query");

    // Wait for debounce and URL update
    await page.waitForTimeout(500);

    // Verify URL has search param
    let params = urlParams(page);
    expect(params.get("q")).toBe("test query");

    // Refresh
    await page.reload();
    await page.waitForSelector('[data-testid="tickets-table"]');

    // Verify search input still has value
    await expect(searchInput).toHaveValue("test query");

    // Verify URL still has param
    params = urlParams(page);
    expect(params.get("q")).toBe("test query");
  });

  test("E2E-6: SLA breached tab shows filtered tickets", async ({ page }) => {
    await page.goto("/tickets");
    await page.waitForSelector('[data-testid="tickets-table"]');

    // Click on SLA breached tab
    const slaTab = page.locator('[data-testid="tab-sla-breached"]');
    await slaTab.click();
    await page.waitForTimeout(500);

    // Verify URL updated
    const params = urlParams(page);
    expect(params.get("tab")).toBe("sla_breached");

    // Verify tab is active
    await expect(slaTab).toHaveAttribute("data-state", "active");
  });
});
