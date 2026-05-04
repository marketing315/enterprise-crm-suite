// Sheets Export Dispatcher
// ------------------------------------------------------------------
// Picks up pending/failed jobs from sheets_export_logs and re-invokes
// the sheets-export function. Triggered every minute by cron-relay.
//
// Backoff is owned by sheets-export itself (it updates next_attempt_at
// after each failure). This dispatcher only:
//   1) selects due jobs (next_attempt_at <= now, status in pending/failed,
//      dead_letter = false, attempts < max_attempts)
//   2) calls sheets-export sequentially with a small concurrency cap
//   3) logs per-target outcome (200 / non-2xx / network error)
//
// Auth: accepts either a service_role JWT (Bearer) OR a CRON_SECRET via
// the X-Cron-Secret header (same pattern as cron-relay -> targets).

import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_SIZE = 25; // jobs per invocation
const CONCURRENCY = 4; // parallel sheets-export calls
const PER_CALL_TIMEOUT_MS = 25_000;

interface JobRow {
  lead_event_id: string;
  attempts: number;
  brand_id: string;
}

function timingSafeEqualAny(input: string, candidates: string[]): boolean {
  for (const c of candidates) {
    if (c && timingSafeEqual(input, c)) return true;
  }
  return false;
}

async function authorize(req: Request): Promise<boolean> {
  // Path 1: X-Cron-Secret (from cron-relay)
  const cronHeader = req.headers.get("x-cron-secret");
  if (cronHeader) {
    const expected = [
      Deno.env.get("CRON_SECRET") ?? "",
      Deno.env.get("CRON_SECRET_PREVIOUS") ?? "",
    ].filter(Boolean);
    if (expected.length === 0) {
      console.error("[sheets-export-dispatcher] CRON_SECRET not configured");
      return false;
    }
    return timingSafeEqualAny(cronHeader, expected);
  }

  // Path 2: service_role Bearer
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceKey) return false;
  return timingSafeEqual(auth.slice("Bearer ".length), serviceKey);
}

async function callSheetsExport(
  leadEventId: string,
  internalToken: string,
  baseUrl: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/functions/v1/sheets-export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": internalToken,
      },
      body: JSON.stringify({ lead_event_id: leadEventId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const allowed = await authorize(req);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Select due jobs. We don't need FOR UPDATE SKIP LOCKED because
    // sheets-export itself is idempotent (unique lead_event_id, claim
    // via INSERT, status=processing race-safe).
    const nowIso = new Date().toISOString();
    const { data: jobs, error: selErr } = await supabase
      .from("sheets_export_logs")
      .select("lead_event_id, attempts, brand_id, max_attempts")
      .in("status", ["pending", "failed"])
      .eq("dead_letter", false)
      .lte("next_attempt_at", nowIso)
      .order("next_attempt_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (selErr) {
      console.error("[sheets-export-dispatcher] select error:", selErr.message);
      return new Response(
        JSON.stringify({ error: selErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!jobs || jobs.length === 0) {
      console.log("[sheets-export-dispatcher] no due jobs");
      return new Response(
        JSON.stringify({ processed: 0, ok: 0, ko: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[sheets-export-dispatcher] processing ${jobs.length} jobs`);

    const internalToken =
      Deno.env.get("INTERNAL_SERVICE_TOKEN") ||
      Deno.env.get("SHEETS_INTERNAL_TOKEN") ||
      "";

    if (!internalToken) {
      console.error("[sheets-export-dispatcher] INTERNAL_SERVICE_TOKEN missing");
      return new Response(
        JSON.stringify({ error: "internal_token_missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let okCount = 0;
    let koCount = 0;

    // Run in batches of CONCURRENCY
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const slice = jobs.slice(i, i + CONCURRENCY) as JobRow[];
      const results = await Promise.all(
        slice.map((j) =>
          callSheetsExport(j.lead_event_id, internalToken, supabaseUrl)
            .then((r) => ({ ...r, lead_event_id: j.lead_event_id })),
        ),
      );
      for (const r of results) {
        if (r.ok) {
          okCount++;
          console.log(
            `[sheets-export-dispatcher] lead=${r.lead_event_id} status=${r.status} ok`,
          );
        } else {
          koCount++;
          console.warn(
            `[sheets-export-dispatcher] lead=${r.lead_event_id} status=${r.status} ko${
              r.error ? ` err=${r.error}` : ""
            }`,
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ processed: jobs.length, ok: okCount, ko: koCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sheets-export-dispatcher] fatal:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
