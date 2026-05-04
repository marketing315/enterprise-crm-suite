// Unit tests for the pure scheduling helper used inside the dispatcher.
// We re-implement buildFairChunks here from a small extracted copy to avoid
// importing the full Deno.serve module (which has top-level side effects).
//
// IMPORTANT: keep this in lockstep with the implementation in index.ts.
// Any change to PARALLEL_LIMIT or the scheduling algorithm must be mirrored here.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const PARALLEL_LIMIT = 10;

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  brand_id: string;
  event_type: string;
  event_id: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
}

function buildFairChunks(deliveries: WebhookDelivery[]): WebhookDelivery[][] {
  const queues = new Map<string, WebhookDelivery[]>();
  for (const d of deliveries) {
    const q = queues.get(d.webhook_id);
    if (q) q.push(d);
    else queues.set(d.webhook_id, [d]);
  }
  const order = Array.from(queues.keys());
  const chunks: WebhookDelivery[][] = [];
  let current: WebhookDelivery[] = [];
  let exhausted = false;
  while (!exhausted) {
    exhausted = true;
    for (const id of order) {
      const q = queues.get(id)!;
      if (q.length === 0) continue;
      exhausted = false;
      current.push(q.shift()!);
      if (current.length >= PARALLEL_LIMIT) {
        chunks.push(current);
        current = [];
      }
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function mkDelivery(id: string, webhookId: string): WebhookDelivery {
  return {
    id,
    webhook_id: webhookId,
    brand_id: "b",
    event_type: "lead.created",
    event_id: id,
    payload: {},
    attempt_count: 0,
    max_attempts: 5,
  };
}

Deno.test("buildFairChunks: single webhook splits into PARALLEL_LIMIT-sized chunks", () => {
  const deliveries = Array.from({ length: 25 }, (_, i) => mkDelivery(`d${i}`, "w1"));
  const chunks = buildFairChunks(deliveries);
  assertEquals(chunks.length, 3);
  assertEquals(chunks[0].length, 10);
  assertEquals(chunks[1].length, 10);
  assertEquals(chunks[2].length, 5);
});

Deno.test("buildFairChunks: two webhooks interleave 1:1 in first chunk", () => {
  const deliveries = [
    ...Array.from({ length: 10 }, (_, i) => mkDelivery(`a${i}`, "w1")),
    ...Array.from({ length: 10 }, (_, i) => mkDelivery(`b${i}`, "w2")),
  ];
  const chunks = buildFairChunks(deliveries);
  // First chunk: 5 from each webhook (round-robin), not 10 from w1.
  const w1InFirst = chunks[0].filter((d) => d.webhook_id === "w1").length;
  const w2InFirst = chunks[0].filter((d) => d.webhook_id === "w2").length;
  assertEquals(w1InFirst, 5);
  assertEquals(w2InFirst, 5);
});

Deno.test("buildFairChunks: slow webhook does NOT monopolize first chunk", () => {
  // 50 deliveries to slow webhook, 1 each to 5 fast webhooks.
  const deliveries: WebhookDelivery[] = [
    ...Array.from({ length: 50 }, (_, i) => mkDelivery(`slow${i}`, "wSlow")),
    mkDelivery("f1", "wFast1"),
    mkDelivery("f2", "wFast2"),
    mkDelivery("f3", "wFast3"),
    mkDelivery("f4", "wFast4"),
    mkDelivery("f5", "wFast5"),
  ];
  const chunks = buildFairChunks(deliveries);
  // First chunk must contain all 5 fast webhooks AND only 5 slow ones (not 10).
  const slowInFirst = chunks[0].filter((d) => d.webhook_id === "wSlow").length;
  const fastInFirst = chunks[0].filter((d) => d.webhook_id !== "wSlow").length;
  assertEquals(slowInFirst, 5, "slow webhook capped at 5/10 slots in first chunk");
  assertEquals(fastInFirst, 5, "all 5 fast webhooks fit in first chunk");
});

Deno.test("buildFairChunks: empty input returns empty array", () => {
  assertEquals(buildFairChunks([]), []);
});

Deno.test("buildFairChunks: preserves total count", () => {
  const deliveries = [
    ...Array.from({ length: 17 }, (_, i) => mkDelivery(`a${i}`, "w1")),
    ...Array.from({ length: 8 }, (_, i) => mkDelivery(`b${i}`, "w2")),
    ...Array.from({ length: 3 }, (_, i) => mkDelivery(`c${i}`, "w3")),
  ];
  const chunks = buildFairChunks(deliveries);
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  assertEquals(total, 28);
});
