import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { contact_id, brand_id, trigger_event = "manual" } = body;

    // Single contact mode
    if (contact_id) {
      const { data, error } = await supabase.rpc("calculate_lead_score", {
        p_contact_id: contact_id,
        p_trigger_event: trigger_event,
      });

      if (error) {
        console.error("RPC error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch mode: all contacts for a brand
    if (brand_id) {
      const { data: contacts, error: fetchErr } = await supabase
        .from("contacts")
        .select("id")
        .eq("brand_id", brand_id)
        .limit(1000);

      if (fetchErr) {
        return new Response(JSON.stringify({ error: fetchErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results = [];
      let errors = 0;

      for (const c of contacts || []) {
        const { data, error } = await supabase.rpc("calculate_lead_score", {
          p_contact_id: c.id,
          p_trigger_event: "batch",
        });
        if (error) {
          errors++;
          console.error(`Score error for ${c.id}:`, error.message);
        } else {
          results.push(data);
        }
      }

      return new Response(
        JSON.stringify({
          processed: results.length,
          errors,
          total: (contacts || []).length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Provide contact_id or brand_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("calculate-lead-score error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
