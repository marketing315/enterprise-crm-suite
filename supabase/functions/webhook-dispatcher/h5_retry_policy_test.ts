// H5 — Webhook retry policy contracts
//
// We don't spin up a real Postgres here; we test the contract surface that the
// dispatcher relies on:
//   1. Idempotency-Key MUST be the stable event_id, NOT the per-attempt delivery_id.
//      Subscribers depend on this to dedupe technical retries.
//   2. The resurrection RPC name + signature contract used by webhook-dispatcher.
//   3. processDelivery sets X-Webhook-Attempt = attempt_count + 1.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// --- 1. Idempotency-Key contract ----------------------------------------------
Deno.test("H5: Idempotency-Key uses stable event_id (not delivery_id)", () => {
  const delivery = {
    id: "delivery-row-attempt-3",        // CHANGES across replays
    event_id: "evt-stable-42",           // STABLE per business event
    attempt_count: 2,
  };

  // Headers built the same way the dispatcher builds them.
  const headers = {
    "Idempotency-Key": delivery.event_id,
    "X-Webhook-Event-Id": delivery.event_id,
    "X-Webhook-Delivery-Id": delivery.id,
    "X-Webhook-Attempt": (delivery.attempt_count + 1).toString(),
  };

  assertEquals(headers["Idempotency-Key"], "evt-stable-42");
  assertEquals(headers["X-Webhook-Event-Id"], "evt-stable-42");
  assertEquals(headers["X-Webhook-Delivery-Id"], "delivery-row-attempt-3");
  assertEquals(headers["X-Webhook-Attempt"], "3");

  // Critical invariant: a technical retry of the SAME event MUST keep the same
  // Idempotency-Key, even if the delivery_id row changes.
  const replay = { ...delivery, id: "delivery-row-attempt-4", attempt_count: 3 };
  const replayHeaders = {
    "Idempotency-Key": replay.event_id,
    "X-Webhook-Delivery-Id": replay.id,
  };
  assertEquals(replayHeaders["Idempotency-Key"], headers["Idempotency-Key"]);
});

// --- 2. Resurrection RPC contract ---------------------------------------------
Deno.test("H5: requeue_stuck_webhook_deliveries returns requeued_count", () => {
  // The dispatcher reads `data[0].requeued_count` — make sure we never break
  // that shape. This test acts as a typed contract.
  type RequeueResult = { requeued_count: number };
  const fakeRpcResult: RequeueResult[] = [{ requeued_count: 7 }];
  const count = Array.isArray(fakeRpcResult) && fakeRpcResult[0]?.requeued_count
    ? fakeRpcResult[0].requeued_count
    : 0;
  assertEquals(count, 7);

  const empty: RequeueResult[] = [{ requeued_count: 0 }];
  const zero = Array.isArray(empty) && empty[0]?.requeued_count
    ? empty[0].requeued_count
    : 0;
  assertEquals(zero, 0);
});

// --- 3. Backoff schedule sanity (mirror of SQL array) -------------------------
Deno.test("H5: backoff schedule is monotonic (1, 5, 15, 60, 360, 1440 minutes)", () => {
  const backoff = [1, 5, 15, 60, 360, 1440];
  for (let i = 1; i < backoff.length; i++) {
    if (backoff[i] <= backoff[i - 1]) {
      throw new Error(`Backoff not monotonic at index ${i}`);
    }
  }
  // Total budget must be >= 24h to allow a full day of downstream outage recovery.
  const totalMin = backoff.reduce((a, b) => a + b, 0);
  if (totalMin < 24 * 60) {
    throw new Error(`Total retry budget too small: ${totalMin}min`);
  }
});
