import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Recovery scheduler for ticket auto-assignment.
 * Runs every 2 minutes to catch any unassigned support tickets
 * that may have been missed by the primary ai-classify flow.
 */
Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  const log = (level: string, msg: string, extra?: Record<string, unknown>) =>
    console[level as "log" | "error"]?.(JSON.stringify({ ts: new Date().toISOString(), correlation_id: correlationId, fn: "ticket-assign-recovery", level, msg, ...extra }));
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // B03 FIX: Validate cron secret OR verify JWT signature server-side
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
    const authHeader = req.headers.get("authorization") || "";
    
    const hasValidCronSecret = expectedSecret && cronSecret && 
      (cronSecret === expectedSecret || (cronSecretPrev && cronSecret === cronSecretPrev));
    
    let hasValidJwt = false;
    if (!hasValidCronSecret && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const cronAnonJwt = Deno.env.get("CRON_ANON_JWT");
      if (cronAnonJwt && token === cronAnonJwt) {
        hasValidJwt = true;
      }
      if (!hasValidJwt) {
        try {
          const verifyClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: claimsData, error: claimsErr } = await verifyClient.auth.getClaims(token);
          if (!claimsErr && claimsData?.claims) {
            const role = claimsData.claims.role as string;
            if (role === "service_role" || role === "anon") {
              hasValidJwt = true;
            }
          }
        } catch { /* invalid JWT, fall through */ }
      }
    }
    
    if (!hasValidCronSecret && !hasValidJwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all active brands
    const { data: brands, error: brandsError } = await supabase
      .from("brands")
      .select("id, name");

    if (brandsError) {
      throw brandsError;
    }

    interface Brand {
      id: string;
      name: string;
    }

    const typedBrands = brands as Brand[] | null;

    if (!typedBrands || typedBrands.length === 0) {
      return new Response(
        JSON.stringify({ message: "No brands found", assigned: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalAssigned = 0;
    const results: { brand: string; assigned: number }[] = [];

    for (const brand of typedBrands) {
      const { data: count, error: assignError } = await supabase.rpc(
        "assign_unassigned_support_tickets",
        { p_brand_id: brand.id }
      );

      if (assignError) {
        console.error(`Error assigning tickets for brand ${brand.name}:`, assignError);
        results.push({ brand: brand.name, assigned: 0 });
      } else {
        const assigned = count as number;
        totalAssigned += assigned;
        results.push({ brand: brand.name, assigned });
        
        if (assigned > 0) {
          console.log(`Assigned ${assigned} tickets for brand ${brand.name}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Recovery complete",
        total_assigned: totalAssigned,
        by_brand: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("ticket-assign-recovery error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
