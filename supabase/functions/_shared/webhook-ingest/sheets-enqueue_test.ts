import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { enqueueSheetsExport } from "./sheets-enqueue.ts";

function fakeClient(error: { code: string; message: string } | null = null) {
  const calls: { table: string; row: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ table, row });
          return Promise.resolve({ error });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

Deno.test("website lead is durably enqueued with the provided admin client and brand", async () => {
  const { client, calls } = fakeClient();
  await enqueueSheetsExport(client, "sonimed-lead", "sonimed-brand", Date.parse("2026-11-20T13:25:46Z"));
  assertEquals(calls, [{ table: "sheets_export_logs", row: {
    lead_event_id: "sonimed-lead", brand_id: "sonimed-brand", status: "pending",
    next_attempt_at: "2026-11-20T13:26:16.000Z", attempts: 0,
  } }]);
});

Deno.test("already present export job is not reset or duplicated", async () => {
  const { client, calls } = fakeClient({ code: "23505", message: "duplicate" });
  await enqueueSheetsExport(client, "existing-lead", "sonimed-brand");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].table, "sheets_export_logs");
});

Deno.test("enqueue database error is reported instead of silently losing the retry", async () => {
  const { client } = fakeClient({ code: "08006", message: "connection failure" });
  await assertRejects(() => enqueueSheetsExport(client, "lead", "brand"), Error, "connection failure");
});