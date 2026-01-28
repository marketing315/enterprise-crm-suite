/**
 * STEP 1 - Concurrency Test
 * 
 * Verifica che 10 webhook simultanei con stesso telefono/brand creino:
 * - 1 solo contatto
 * - 1 solo phone record attivo
 * - N lead_events (append-only)
 * - 1 solo deal open
 * 
 * Esegui con: npx tsx scripts/test-concurrency.ts
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://qmqcjtmcxfqahhubpaea.supabase.co";
const TEST_SOURCE_ID = "aaaaaaaa-0000-0000-0000-000000000001"; // Active test source
const TEST_API_KEY = "test-api-key-active-source"; // From seed

async function sendWebhook(index: number): Promise<{ status: number; body: unknown }> {
  const payload = {
    first_name: `Test${index}`,
    last_name: "Concurrency",
    phone: "+39 333 123 4567", // Same phone for all
    email: `test${index}@concurrency.test`,
    message: `Concurrent webhook #${index}`,
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/webhook-ingest/${TEST_SOURCE_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": TEST_API_KEY,
      },
      body: JSON.stringify(payload),
    }
  );

  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function runConcurrencyTest() {
  console.log("🚀 Starting STEP 1 Concurrency Test...\n");
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log(`   Source: ${TEST_SOURCE_ID}`);
  console.log(`   Concurrent requests: 10\n`);

  // Launch 10 concurrent webhook calls
  const promises = Array.from({ length: 10 }, (_, i) => sendWebhook(i + 1));
  
  console.log("⏳ Sending 10 simultaneous webhooks...\n");
  const startTime = Date.now();
  
  const results = await Promise.all(promises);
  
  const duration = Date.now() - startTime;
  console.log(`✅ All requests completed in ${duration}ms\n`);

  // Analyze results
  const successes = results.filter(r => r.status === 200 || r.status === 201);
  const errors = results.filter(r => r.status >= 400);

  console.log("📊 Results Summary:");
  console.log(`   ✓ Success: ${successes.length}`);
  console.log(`   ✗ Errors: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log("\n❌ Error details:");
    errors.forEach((e, i) => {
      console.log(`   [${i + 1}] Status ${e.status}: ${JSON.stringify(e.body)}`);
    });
  }

  // Check for unique IDs
  const contactIds = new Set<string>();
  const dealIds = new Set<string>();
  const leadEventIds = new Set<string>();

  successes.forEach(r => {
    const body = r.body as { contact_id?: string; deal_id?: string; lead_event_id?: string };
    if (body.contact_id) contactIds.add(body.contact_id);
    if (body.deal_id) dealIds.add(body.deal_id);
    if (body.lead_event_id) leadEventIds.add(body.lead_event_id);
  });

  console.log("\n🔍 Deduplication Check:");
  console.log(`   Unique contacts: ${contactIds.size} (expected: 1)`);
  console.log(`   Unique deals: ${dealIds.size} (expected: 1)`);
  console.log(`   Unique lead_events: ${leadEventIds.size} (expected: 10)`);

  // Final verdict
  console.log("\n" + "=".repeat(50));
  if (contactIds.size === 1 && dealIds.size === 1 && leadEventIds.size === 10 && errors.length === 0) {
    console.log("✅ STEP 1 PASSED: No duplicates, all constraints working!");
  } else {
    console.log("❌ STEP 1 FAILED: Check results above");
  }
  console.log("=".repeat(50));
}

// Run the test
runConcurrencyTest().catch(console.error);
