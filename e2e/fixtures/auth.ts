import { test as base, expect, Page } from "@playwright/test";

/**
 * E2E Auth Fixtures
 * 
 * Provides authenticated page state and common helpers for tests.
 */

type Fixtures = {
  login: (email: string, password: string) => Promise<void>;
  selectBrandIfNeeded: (brandName: string) => Promise<void>;
  gotoTickets: () => Promise<void>;
};

export const test = base.extend<Fixtures>({
  login: async ({ page }, use) => {
    await use(async (email: string, password: string) => {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /accedi|login|sign in/i }).click();
      await page.waitForURL(/\/(select-brand|dashboard|tickets|contacts)/, { timeout: 15000 });
    });
  },

  selectBrandIfNeeded: async ({ page }, use) => {
    await use(async (brandName: string) => {
      if (page.url().includes("select-brand")) {
        await page.getByText(brandName, { exact: false }).click();
        await page.waitForURL(/\/(dashboard|tickets|contacts)/);
      }
    });
  },

  gotoTickets: async ({ page }, use) => {
    await use(async () => {
      await page.goto("/tickets");
      await page.waitForSelector('[data-testid="tickets-table"]', { timeout: 15000 });
    });
  },
});

export { expect };

/**
 * Helper to extract URL search params
 */
export function urlParams(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

/**
 * Helper to wait for URL to contain specific param
 */
export async function waitForUrlParam(page: Page, param: string, timeout = 5000): Promise<string | null> {
  await page.waitForFunction(
    (p) => new URLSearchParams(window.location.search).has(p),
    param,
    { timeout }
  );
  return urlParams(page).get(param);
}

/**
 * Helper to get first visible ticket row identifier (id + text for comparison)
 */
export async function firstRowKey(page: Page): Promise<string> {
  const row = page.locator('[data-testid="ticket-row"]').first();
  await row.waitFor({ state: "visible", timeout: 5000 });
  const id = await row.getAttribute("data-ticket-id");
  const text = await row.innerText();
  return `${id ?? ""}::${text.slice(0, 80)}`;
}

/**
 * Helper to count table rows
 */
export async function getTableRowCount(page: Page): Promise<number> {
  const rows = page.locator('[data-testid="ticket-row"]');
  return rows.count();
}
