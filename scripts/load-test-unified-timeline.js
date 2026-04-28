#!/usr/bin/env node
/**
 * Load test for the `get_unified_customer_timeline` Postgres RPC.
 *
 * Usage:
 *   node scripts/load-test-unified-timeline.js [iterations=200] [concurrency=8] [limit=200]
 *
 * Produces a Markdown report at /mnt/documents/load-test-unified-timeline.md
 * with p50/p95/p99 latencies, throughput, and per-contact stats.
 *
 * Auth: uses VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY from the
 * environment (anon key is sufficient because the RPC is SECURITY DEFINER
 * and gated via RLS on the underlying tables).
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or supabase key in env.");
  process.exit(1);
}

const ITERATIONS = parseInt(process.argv[2] ?? "200", 10);
const CONCURRENCY = parseInt(process.argv[3] ?? "8", 10);
const LIMIT = parseInt(process.argv[4] ?? "200", 10);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: sorted.length ? sum / sorted.length : 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

async function pickContactIds(n) {
  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(n);
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

async function callOnce(contactId) {
  const t0 = performance.now();
  const { data, error } = await supabase.rpc("get_unified_customer_timeline", {
    p_contact_id: contactId,
    p_limit: LIMIT,
  });
  const ms = performance.now() - t0;
  return { ms, ok: !error, rows: data?.length ?? 0, err: error?.message };
}

async function runPool(tasks, concurrency) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < tasks.length) {
      const myIdx = i++;
      results[myIdx] = await tasks[myIdx]();
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log(
    `[load-test] iterations=${ITERATIONS} concurrency=${CONCURRENCY} limit=${LIMIT}`
  );

  const sampleContacts = await pickContactIds(Math.min(50, ITERATIONS));
  if (sampleContacts.length === 0) {
    console.error("No contacts found in DB – cannot run load test.");
    process.exit(2);
  }
  console.log(`[load-test] sampling across ${sampleContacts.length} contacts`);

  // Warm-up (3 calls discarded)
  for (let i = 0; i < 3; i++) {
    await callOnce(sampleContacts[i % sampleContacts.length]);
  }

  const tasks = Array.from({ length: ITERATIONS }, (_, i) => () =>
    callOnce(sampleContacts[i % sampleContacts.length])
  );

  const wallStart = performance.now();
  const results = await runPool(tasks, CONCURRENCY);
  const wallMs = performance.now() - wallStart;

  const okSamples = results.filter((r) => r.ok).map((r) => r.ms);
  const rowsSamples = results.filter((r) => r.ok).map((r) => r.rows);
  const errors = results.filter((r) => !r.ok);

  const latency = stats(okSamples);
  const rowStats = stats(rowsSamples);
  const throughput = (okSamples.length / wallMs) * 1000;
  const errorRate = (errors.length / results.length) * 100;

  // Per-contact aggregation
  const perContact = new Map();
  results.forEach((r, idx) => {
    const cid = sampleContacts[idx % sampleContacts.length];
    if (!perContact.has(cid)) perContact.set(cid, []);
    if (r.ok) perContact.get(cid).push(r.ms);
  });
  const contactRows = Array.from(perContact.entries())
    .map(([cid, ms]) => {
      const s = stats(ms);
      return { cid, n: s.n, p50: s.p50, p95: s.p95, max: s.max };
    })
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, 10);

  const report = `# Load Test — \`get_unified_customer_timeline\`

**Run at:** ${new Date().toISOString()}
**Config:** iterations=${ITERATIONS}, concurrency=${CONCURRENCY}, p_limit=${LIMIT}
**Sample contacts:** ${sampleContacts.length} (top by last_interaction_at)

## 📊 Latency (ms)

| Metric | Value |
|---|---|
| Successful calls | ${latency.n} / ${ITERATIONS} |
| Error rate | ${errorRate.toFixed(2)} % |
| Wall time | ${(wallMs / 1000).toFixed(2)} s |
| Throughput | ${throughput.toFixed(2)} req/s |
| min | ${latency.min.toFixed(1)} |
| avg | ${latency.avg.toFixed(1)} |
| **p50** | **${latency.p50.toFixed(1)}** |
| **p95** | **${latency.p95.toFixed(1)}** |
| **p99** | **${latency.p99.toFixed(1)}** |
| max | ${latency.max.toFixed(1)} |

## 🔢 Result size (rows returned)

| Metric | Value |
|---|---|
| min | ${rowStats.min} |
| avg | ${rowStats.avg.toFixed(1)} |
| p50 | ${rowStats.p50} |
| p95 | ${rowStats.p95} |
| max | ${rowStats.max} |

## 🐢 Top 10 slowest contacts (by p95)

| Contact ID | calls | p50 | p95 | max |
|---|---|---|---|---|
${contactRows
  .map(
    (r) =>
      `| \`${r.cid.slice(0, 8)}…\` | ${r.n} | ${r.p50.toFixed(
        1
      )} | ${r.p95.toFixed(1)} | ${r.max.toFixed(1)} |`
  )
  .join("\n")}

## ❌ Errors (${errors.length})

${
  errors.length === 0
    ? "_None_"
    : errors
        .slice(0, 10)
        .map((e, i) => `${i + 1}. ${e.err}`)
        .join("\n")
}

## ✅ SLO assessment

- p95 ≤ 300 ms → ${latency.p95 <= 300 ? "✅ PASS" : "❌ FAIL"}
- p99 ≤ 800 ms → ${latency.p99 <= 800 ? "✅ PASS" : "❌ FAIL"}
- error rate ≤ 1% → ${errorRate <= 1 ? "✅ PASS" : "❌ FAIL"}
`;

  mkdirSync("/mnt/documents", { recursive: true });
  const outPath = "/mnt/documents/load-test-unified-timeline.md";
  writeFileSync(outPath, report);
  console.log(`\n✅ Report written to ${outPath}`);
  console.log(
    `   p50=${latency.p50.toFixed(1)}ms p95=${latency.p95.toFixed(
      1
    )}ms p99=${latency.p99.toFixed(1)}ms throughput=${throughput.toFixed(
      2
    )} req/s errors=${errors.length}`
  );
}

main().catch((e) => {
  console.error("Load test failed:", e);
  process.exit(1);
});
