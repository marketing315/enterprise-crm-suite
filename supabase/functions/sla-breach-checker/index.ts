import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // B03 FIX: Validate cron secret OR verify JWT signature server-side
  const cronSecret = Deno.env.get("CRON_SECRET");
  const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
  const providedSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization") || "";
  
  const hasValidSecret = cronSecret && providedSecret && 
    (providedSecret === cronSecret || (cronSecretPrev && providedSecret === cronSecretPrev));
  
  let hasValidJwt = false;
  if (!hasValidSecret && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    // Fallback: accept project anon key from pg_cron
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (anonKey && token === anonKey) {
      hasValidJwt = true;
    }
    // Try getClaims for service_role JWT
    if (!hasValidJwt) {
      try {
        const verifyClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          anonKey!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: claimsData, error: claimsErr } = await verifyClient.auth.getClaims(token);
        if (!claimsErr && claimsData?.claims?.role === "service_role") {
          hasValidJwt = true;
        }
      } catch { /* invalid JWT, fall through */ }
    }
  }
  
  if (!hasValidSecret && !hasValidJwt) {
    console.error("[AUTH] Invalid or missing authentication");
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
