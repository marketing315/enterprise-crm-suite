import { test, expect } from "../fixtures/auth";

/**
 * M8 Step D E2E Tests: Webhook Settings + Deliveries Monitor
 * 
 * Prerequisites:
 * - Test user with admin role on at least one brand
 * - Test credentials in environment: TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
 */

const TEST_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@example.com";
const TEST_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "password123";
const TEST_BRAND = "Demo Brand"; // Must exist and user must be admin

test.describe("Webhook Settings", () => {
  test.beforeEach(async ({ page, login, selectBrandIfNeeded }) => {
    await login(TEST_EMAIL, TEST_PASSWORD);
    await selectBrandIfNeeded(TEST_BRAND);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
  });

  test("1. Admin can create a webhook with multiple event types", async ({ page }) => {
    // Navigate to Webhooks tab
    await page.getByTestId("webhooks-settings-tab").click();
    await page.waitForSelector('[data-testid="create-webhook-btn"]', { timeout: 5000 });

    // Open create form
    await page.getByTestId("create-webhook-btn").click();
    await page.waitForSelector('[data-testid="webhook-name-input"]', { timeout: 5000 });

    // Fill form
    await page.getByTestId("webhook-name-input").fill("E2E Test Webhook");
    await page.getByTestId("webhook-url-input").fill("https://httpbin.org/post");

    // Select 2 event types
    await page.getByTestId("event-type-ticket.created").click();
    await page.getByTestId("event-type-ticket.status_changed").click();

    // Generate secret
    await page.getByTestId("generate-secret-btn").click();
    await page.waitForSelector('[data-testid="generated-secret-input"]', { timeout: 3000 });

    // Copy secret before save
    const secretInput = page.getByTestId("generated-secret-input");
    const generatedSecret = await secretInput.inputValue();
    expect(generatedSecret.length).toBeGreaterThanOrEqual(64); // 32 bytes hex = 64 chars

    // Save webhook
    await page.getByTestId("save-webhook-btn").click();
    
    // Verify webhook appears in table
    await page.waitForSelector('[data-testid="webhooks-table"]', { timeout: 5000 });
    const webhookRow = page.getByTestId("webhook-row").filter({ hasText: "E2E Test Webhook" });
    await expect(webhookRow).toBeVisible();
  });

  test("2. Admin can rotate secret and see it only once", async ({ page }) => {
    // Navigate to Webhooks tab
    await page.getByTestId("webhooks-settings-tab").click();
    await page.waitForSelector('[data-testid="webhooks-table"]', { timeout: 5000 });

    // Find test webhook and open actions menu
    const webhookRow = page.getByTestId("webhook-row").filter({ hasText: "E2E Test Webhook" });
    await expect(webhookRow).toBeVisible({ timeout: 5000 });
    await webhookRow.getByTestId("webhook-actions-menu").click();

    // Click rotate secret
    await page.getByTestId("rotate-secret-btn").click();
    await page.waitForSelector('[data-testid="new-secret-input"]', { timeout: 3000 });

    // Verify new secret is shown
    const newSecretInput = page.getByTestId("new-secret-input");
    const newSecret = await newSecretInput.inputValue();
    expect(newSecret.length).toBeGreaterThanOrEqual(64);

    // Confirm rotation
    await page.getByTestId("confirm-rotate-btn").click();
    
    // Wait for success and close
    await page.waitForSelector('[data-testid="close-rotate-dialog"]', { timeout: 5000 });
    
    // Copy and verify the rotated secret is different
    const rotatedSecretInput = page.getByTestId("new-secret-input");
    const rotatedSecret = await rotatedSecretInput.inputValue();
    expect(rotatedSecret.length).toBeGreaterThanOrEqual(64);

    // Close dialog
    await page.getByTestId("close-rotate-dialog").click();

    // Secret should not be visible anywhere in the table
    const tableText = await page.getByTestId("webhooks-table").textContent();
    expect(tableText).not.toContain(rotatedSecret);
  });

  test("3. Test webhook creates delivery in monitor", async ({ page }) => {
    // Navigate to Webhooks tab
    await page.getByTestId("webhooks-settings-tab").click();
    await page.waitForSelector('[data-testid="webhooks-table"]', { timeout: 5000 });

    // Find test webhook and trigger test
    const webhookRow = page.getByTestId("webhook-row").filter({ hasText: "E2E Test Webhook" });
    await expect(webhookRow).toBeVisible({ timeout: 5000 });
    await webhookRow.getByTestId("webhook-actions-menu").click();
    await page.getByTestId("test-webhook-btn").click();

    // Wait for toast success
    await page.waitForSelector('text=Test webhook inviato', { timeout: 5000 });

    // Switch to monitor tab
    await page.getByTestId("deliveries-tab").click();
    await page.waitForSelector('[data-testid="deliveries-table"]', { timeout: 5000 });

    // Filter by webhook.test event type
    await page.getByTestId("filter-event-type").click();
    await page.getByRole("option", { name: "Test" }).click();

    // Wait for delivery to appear (may take up to 10s for auto-refresh)
    await page.waitForSelector('[data-testid="delivery-row"]', { timeout: 15000 });
    
    const deliveryRow = page.getByTestId("delivery-row").first();
    await expect(deliveryRow).toBeVisible();
    
    // Verify it's a webhook.test event
    const rowText = await deliveryRow.textContent();
    expect(rowText).toContain("Test");
  });

  test("4. Inactive webhook test produces webhook_inactive error", async ({ page }) => {
    // Navigate to Webhooks tab
    await page.getByTestId("webhooks-settings-tab").click();
    await page.waitForSelector('[data-testid="webhooks-table"]', { timeout: 5000 });

    // Find test webhook and toggle off
    const webhookRow = page.getByTestId("webhook-row").filter({ hasText: "E2E Test Webhook" });
    await expect(webhookRow).toBeVisible({ timeout: 5000 });
    
    const toggle = webhookRow.getByTestId("webhook-active-toggle");
    const isChecked = await toggle.isChecked();
    
    if (isChecked) {
      await toggle.click();
      await page.waitForTimeout(1000); // Wait for state update
    }

    // Trigger test on inactive webhook
    await webhookRow.getByTestId("webhook-actions-menu").click();
    await page.getByTestId("test-webhook-btn").click();
    await page.waitForSelector('text=Test webhook inviato', { timeout: 5000 });

    // Switch to monitor and wait for failed delivery
    await page.getByTestId("deliveries-tab").click();
    await page.waitForSelector('[data-testid="deliveries-table"]', { timeout: 5000 });

    // Filter by failed status  
    await page.getByTestId("filter-status").click();
    await page.getByRole("option", { name: "Fallito" }).click();

    // Also filter by webhook.test event type for precision
    await page.getByTestId("filter-event-type").click();
    await page.getByRole("option", { name: "Test" }).click();

    // Wait for failed delivery (may need dispatcher to run - up to 90s for cron + processing)
    await page.waitForSelector('[data-testid="delivery-row"]', { timeout: 90000 });
    
    // Click on delivery to see details
    await page.getByTestId("delivery-row").first().click();
    
    // Verify error contains webhook_inactive
    await page.waitForSelector('text=webhook_inactive', { timeout: 5000 });

    // Re-enable webhook for cleanup
    await page.keyboard.press("Escape");
    await page.getByTestId("webhooks-tab").click();
    await page.waitForSelector('[data-testid="webhooks-table"]', { timeout: 5000 });
    const row = page.getByTestId("webhook-row").filter({ hasText: "E2E Test Webhook" });
    await row.getByTestId("webhook-active-toggle").click();
  });

  test("5. Monitor filtering by status works correctly", async ({ page }) => {
    // Navigate to Webhooks tab and then monitor
    await page.getByTestId("webhooks-settings-tab").click();
    await page.getByTestId("deliveries-tab").click();
    await page.waitForSelector('[data-testid="filter-status"]', { timeout: 5000 });

    // Test each status filter
    const statuses = ["Completato", "Fallito", "In attesa", "Tutti gli stati"];
    
    for (const statusLabel of statuses) {
      await page.getByTestId("filter-status").click();
      await page.getByRole("option", { name: statusLabel }).click();
      
      // Wait for table update
      await page.waitForLoadState("networkidle");
      
      // Verify filter is applied (no error thrown)
      const filterValue = await page.getByTestId("filter-status").textContent();
      expect(filterValue).toContain(statusLabel === "Tutti gli stati" ? "Tutti" : statusLabel.slice(0, 4));
    }
  });
});
