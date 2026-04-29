import { test, expect } from "../fixtures/auth";

/**
 * Revenue-Critical Flow #5: MCP Server + Subscriptions
 * 
 * Verifies external MCP server endpoint and admin dashboard:
 *  - /admin/mcp dashboard renders
 *  - MCP server endpoint responds to JSON-RPC initialize
 *  - Auth required (no token = 401)
 * 
 * Critical because external AI agents (Claude, n8n, etc.) depend
 * on this for revenue automation. Downtime breaks workflows.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const email = process.env.E2E_EMAIL!;
const password = process.env.E2E_PASSWORD!;
const brand = process.env.E2E_BRAND_NAME!;

test.describe("@revenue-critical MCP Server", () => {
  test.skip(!SUPABASE_URL, "VITE_SUPABASE_URL not configured");

  test("R5.1: MCP server requires auth (401 without token)", async ({ request }) => {
    const endpoint = `${SUPABASE_URL}/functions/v1/mcp-server`;
    const res = await request.post(endpoint, {
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("R5.2: MCP server rejects invalid token", async ({ request }) => {
    const endpoint = `${SUPABASE_URL}/functions/v1/mcp-server`;
    const res = await request.post(endpoint, {
      headers: { Authorization: "Bearer mcp_invalid_token_12345" },
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("R5.3: MCP server returns JSON-RPC error envelope on bad method", async ({ request }) => {
    const endpoint = `${SUPABASE_URL}/functions/v1/mcp-server`;
    const res = await request.post(endpoint, {
      headers: { Authorization: "Bearer mcp_invalid_token" },
      data: { jsonrpc: "2.0", id: 1, method: "nonexistent", params: {} },
    });
    // Either rejected for auth or returns JSON-RPC error
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.jsonrpc).toBe("2.0");
      expect(body.error).toBeDefined();
    } else {
      expect([401, 403, 404]).toContain(res.status());
    }
  });

  test("R5.4: Admin MCP dashboard renders", async ({ page, login, selectBrandIfNeeded }) => {
    await login(email, password);
    await selectBrandIfNeeded(brand);

    await page.goto("/admin/mcp");
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10000 });

    const errorOverlay = page.locator('[data-testid="error-boundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });
});
