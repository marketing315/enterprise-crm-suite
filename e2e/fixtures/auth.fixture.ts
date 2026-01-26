import { test as base, expect, Page } from "@playwright/test";

/**
 * E2E Auth Fixture
 * 
 * Provides authenticated page state for tests.
 * In a real setup, this would handle login flow.
 * For now, we assume the app has test credentials available.
 */

interface AuthFixture {
  authenticatedPage: Page;
  loginAs: (email: string, password: string) => Promise<void>;
  selectBrand: (brandName: string) => Promise<void>;
}

export const test = base.extend<AuthFixture>({
  authenticatedPage: async ({ page }, use) => {
    // Navigate to login
    await page.goto("/login");
    await use(page);
  },
  
  loginAs: async ({ page }, use) => {
    const loginFn = async (email: string, password: string) => {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /accedi|login|sign in/i }).click();
      
      // Wait for redirect to brand selection or dashboard
      await page.waitForURL(/\/(select-brand|dashboard|tickets)/);
    };
    await use(loginFn);
  },
  
  selectBrand: async ({ page }, use) => {
    const selectFn = async (brandName: string) => {
      // If on brand selection page, select the brand
      if (page.url().includes("select-brand")) {
        await page.getByText(brandName).click();
        await page.waitForURL(/\/(dashboard|tickets)/);
      }
    };
    await use(selectFn);
  },
});

export { expect };

/**
 * Helper to extract URL search params
 */
export function getUrlParams(page: Page): URLSearchParams {
  const url = new URL(page.url());
  return url.searchParams;
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
  return getUrlParams(page).get(param);
}

/**
 * Helper to get first visible ticket ID in table
 */
export async function getFirstTicketId(page: Page): Promise<string | null> {
  const firstRow = page.locator("table tbody tr").first();
  await firstRow.waitFor({ state: "visible", timeout: 5000 });
  // Assuming ticket ID is in data attribute or we can extract from row content
  return firstRow.getAttribute("data-ticket-id");
}

/**
 * Helper to count table rows
 */
export async function getTableRowCount(page: Page): Promise<number> {
  const rows = page.locator("table tbody tr");
  return rows.count();
}
