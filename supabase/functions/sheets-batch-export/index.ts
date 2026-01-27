import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BatchExportParams {
  brand_id: string;
  from?: string; // ISO date
  to?: string; // ISO date
  only_failed?: boolean;
  limit?: number;
  force?: boolean;
}

interface ExportResult {
  lead_event_id: string;
  success: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: Admin-only endpoint - requires service role
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(
      JSON.stringify({ error: "Unauthorized - admin only" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const sheetsEnabled = Deno.env.get("GOOGLE_SHEETS_ENABLED") === "true";
  if (!sheetsEnabled) {
    return new Response(
      JSON.stringify({ error: "Sheets export is disabled" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let params: BatchExportParams;
  try {
    params = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { brand_id, from, to, only_failed = false, limit = 100, force = false } = params;

  if (!brand_id) {
    return new Response(
      JSON.stringify({ error: "brand_id required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Build query for lead events to export
    let query = supabaseAdmin
      .from("lead_events")
      .select("id")
      .eq("brand_id", brand_id)
      .order("received_at", { ascending: false })
      .limit(Math.min(limit, 500)); // Cap at 500 per batch

    if (from) {
      query = query.gte("received_at", from);
    }
    if (to) {
      query = query.lte("received_at", to);
    }

    const { data: leadEvents, error: queryError } = await query;

    if (queryError) {
      throw new Error(`Query error: ${queryError.message}`);
    }

    if (!leadEvents || leadEvents.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No lead events found matching criteria",
          exported: 0,
          skipped: 0,
          failed: 0 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If only_failed, filter to events with failed export logs
    let eventsToExport = leadEvents.map(e => e.id);

    if (only_failed) {
      const { data: failedLogs } = await supabaseAdmin
        .from("sheets_export_logs")
        .select("lead_event_id")
        .eq("status", "failed")
        .in("lead_event_id", eventsToExport);

      eventsToExport = failedLogs?.map(l => l.lead_event_id) || [];
    }

    // Get sheets-export function URL
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const sheetsExportUrl = `${supabaseUrl}/functions/v1/sheets-export`;

    const results: ExportResult[] = [];
    let exported = 0;
    let skipped = 0;
    let failed = 0;

    // Process in sequence to avoid overwhelming Google Sheets API
    for (const leadEventId of eventsToExport) {
      try {
        const response = await fetch(sheetsExportUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ lead_event_id: leadEventId, force }),
        });

        const result = await response.json();

        if (response.ok) {
          if (result.skipped) {
            skipped++;
            results.push({ lead_event_id: leadEventId, success: true, skipped: true, reason: result.reason });
          } else {
            exported++;
            results.push({ lead_event_id: leadEventId, success: true });
          }
        } else {
          failed++;
          results.push({ lead_event_id: leadEventId, success: false, error: result.error });
        }

        // Small delay to respect Google Sheets API quota
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        failed++;
        results.push({ 
          lead_event_id: leadEventId, 
          success: false, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: eventsToExport.length,
        exported,
        skipped,
        failed,
        results: results.slice(0, 50), // Limit detailed results in response
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Batch export error:", error);

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
