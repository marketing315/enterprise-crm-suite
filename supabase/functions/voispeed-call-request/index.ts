import { createClient } from "npm:@supabase/supabase-js@2";
import { safeErrorResponse } from "../_shared/safe-error-response.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * VOIspeed v4 Click-to-Call Edge Function
 * 
 * This function initiates outbound calls via VOIspeed SERI API.
 * The token is stored server-side and never exposed to the client.
 * 
 * Flow:
 * 1. Client calls this function with phone_number, contact_id, deal_id
 * 2. We look up the user's VOIspeed extension (voispeed_ext)
 * 3. We look up the brand's VOIspeed config (base_url, token)
 * 4. We call VOIspeed SERI service=call_request
 * 5. We create/update call_logs with status=initiated
 * 6. VOIspeed events will update the status via webhook
 */

interface CallRequestBody {
  phone_number: string;
  contact_id: string;
  deal_id?: string | null;
  brand_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: CallRequestBody;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { phone_number, contact_id, deal_id, brand_id } = body;

    if (!phone_number || !contact_id || !brand_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: phone_number, contact_id, brand_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's CRM ID and VOIspeed extension
    const { data: crmUser, error: userError } = await supabase
      .from("users")
      .select("id, voispeed_ext")
      .eq("supabase_auth_id", user.id)
      .single();

    if (userError || !crmUser) {
      return new Response(
        JSON.stringify({ error: "User not found in CRM" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user belongs to the requested brand
    const { data: userBrandRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", crmUser.id)
      .eq("brand_id", brand_id)
      .limit(1)
      .maybeSingle();

    if (!userBrandRole) {
      return new Response(
        JSON.stringify({ error: "Access denied to this brand" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify contact belongs to the same brand
    const { data: contactCheck } = await supabase
      .from("contacts")
      .select("id")
      .eq("id", contact_id)
      .eq("brand_id", brand_id)
      .maybeSingle();

    if (!contactCheck) {
      return new Response(
        JSON.stringify({ error: "Contact not found in this brand" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!crmUser.voispeed_ext) {
      return new Response(
        JSON.stringify({ 
          error: "VOIspeed extension not configured for this user",
          code: "VOISPEED_EXT_MISSING"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get brand VOIspeed config
    const { data: voipConfig, error: configError } = await supabase
      .from("voispeed_configs")
      .select("*")
      .eq("brand_id", brand_id)
      .eq("enabled", true)
      .single();

    if (configError || !voipConfig) {
      return new Response(
        JSON.stringify({ 
          error: "VOIspeed not configured for this brand",
          code: "VOISPEED_NOT_CONFIGURED"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create call log entry first (status: initiated)
    const extId = `calllog_${crypto.randomUUID()}`;
    
    const { data: callLog, error: callLogError } = await supabase
      .from("call_logs")
      .insert({
        brand_id,
        contact_id,
        deal_id: deal_id || null,
        user_id: crmUser.id,
        phone_number,
        call_type: "outbound",
        status: "initiated",
        provider: "voispeed",
        provider_ext_id: extId,
      })
      .select("id")
      .single();

    if (callLogError) {
      console.error("Failed to create call log:", callLogError);
      return new Response(
        JSON.stringify({ error: "Failed to create call log" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build VOIspeed SERI request URL
    // Format: {base_url}?service=call_request&token={token}&ext={ext}&number={number}&extid={extid}
    const seriUrl = new URL(voipConfig.base_url);
    seriUrl.searchParams.set("service", "call_request");
    seriUrl.searchParams.set("token", voipConfig.token);
    seriUrl.searchParams.set("ext", crmUser.voispeed_ext);
    seriUrl.searchParams.set("number", phone_number.replace(/\D/g, "")); // Strip non-digits
    seriUrl.searchParams.set("extid", extId);
    
    if (voipConfig.domain) {
      seriUrl.searchParams.set("domain", voipConfig.domain);
    }

    console.log(`Initiating VOIspeed call: ext=${crmUser.voispeed_ext}, number=${phone_number}, extid=${extId}`);

    // Call VOIspeed SERI API
    const voispeedResponse = await fetch(seriUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    const responseText = await voispeedResponse.text();
    let voispeedResult: Record<string, unknown> = {};
    
    try {
      voispeedResult = JSON.parse(responseText);
    } catch {
      // VOIspeed might return plain text
      voispeedResult = { raw: responseText };
    }

    console.log("VOIspeed response:", voispeedResult);

    // Check for VOIspeed errors
    // VOIspeed returns different formats, check for common error patterns
    const isError = voispeedResult.error || voispeedResult.errcode || 
                    (typeof voispeedResult.result === "string" && voispeedResult.result.toLowerCase().includes("error"));

    if (!voispeedResponse.ok || isError) {
      // Update call log to failed
      await supabase
        .from("call_logs")
        .update({ 
          status: "failed",
          last_error: JSON.stringify(voispeedResult),
          ended_at: new Date().toISOString(),
        })
        .eq("id", callLog.id);

      return new Response(
        JSON.stringify({ 
          error: "VOIspeed call request failed",
          details: voispeedResult,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update call log status to ringing (call initiated)
    await supabase
      .from("call_logs")
      .update({ status: "ringing" })
      .eq("id", callLog.id);

    return new Response(
      JSON.stringify({ 
        success: true,
        call_log_id: callLog.id,
        ext_id: extId,
        message: "Call initiated successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return safeErrorResponse(error, {
      status: 500,
      extraHeaders: corsHeaders,
      logContext: { fn: "voispeed-call-request" },
    });
  }
});
