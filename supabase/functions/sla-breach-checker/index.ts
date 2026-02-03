import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: Validate cron secret OR internal service call with anon key
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization") || "";
  
  // Internal cron calls from pg_cron use the anon key Bearer token
  // Check for valid JWT structure (starts with eyJ which is base64 for {"alg")
  const hasValidJwt = authHeader.startsWith("Bearer eyJ");
  
  // Allow if: valid cron secret OR valid JWT bearer token (from pg_cron)
  const hasValidSecret = cronSecret && providedSecret && providedSecret === cronSecret;
  
  if (!hasValidSecret && !hasValidJwt) {
    console.error("[AUTH] Invalid or missing x-cron-secret");
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use service role to bypass RLS for system operation
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the function that checks all brands for SLA breaches
    const { data, error } = await supabase.rpc("check_all_brands_sla_breaches");

    if (error) {
      console.error("Error checking SLA breaches:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("SLA breach check completed:", JSON.stringify(data));

    return new Response(
      JSON.stringify({ success: true, result: data }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (err) {
    console.error("Unexpected error in SLA breach checker:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
