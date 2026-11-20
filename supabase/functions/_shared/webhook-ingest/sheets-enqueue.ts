import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// The caller's existing admin client is required: there is no global client.
// A duplicate job is already durable and must not be recreated/reset.
export async function enqueueSheetsExport(
  client: SupabaseClient,
  leadEventId: string,
  brandId: string,
  now = Date.now(),
): Promise<void> {
  const { error } = await client.from("sheets_export_logs").insert({
    lead_event_id: leadEventId,
    brand_id: brandId,
    status: "pending",
    next_attempt_at: new Date(now + 30_000).toISOString(),
    attempts: 0,
  });
  if (error && error.code !== "23505") {
    throw new Error(`Failed to enqueue sheets export job: ${error.message}`);
  }
}