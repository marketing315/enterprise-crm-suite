import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { meta_app_id, action, form_id } = await req.json();

    if (!meta_app_id) {
      return new Response(JSON.stringify({ error: "meta_app_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get meta app config
    const { data: metaApp, error: appError } = await supabase
      .from("meta_apps")
      .select("*")
      .eq("id", meta_app_id)
      .single();

    if (appError || !metaApp) {
      return new Response(JSON.stringify({ error: "Meta App not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { page_id, access_token } = metaApp;

    if (!page_id || !access_token) {
      return new Response(JSON.stringify({ error: "Page ID or Access Token missing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: list_forms - Get all lead forms for this page
    if (action === "list_forms") {
      const formsUrl = `https://graph.facebook.com/v19.0/${page_id}/leadgen_forms?access_token=${access_token}`;
      const formsRes = await fetch(formsUrl);
      const formsData = await formsRes.json();

      if (formsData.error) {
        console.error("[META-TEST] Forms error:", formsData.error);
        return new Response(JSON.stringify({ 
          error: formsData.error.message || "Failed to fetch forms",
          fb_error: formsData.error 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        forms: formsData.data || [] 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: create_test_lead - Create a test lead (auto-deletes existing one first)
    if (action === "create_test_lead") {
      if (!form_id) {
        return new Response(JSON.stringify({ error: "form_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const testLeadUrl = `https://graph.facebook.com/v19.0/${form_id}/test_leads?access_token=${access_token}`;

      // Step 1: Try to get existing test leads
      console.log("[META-TEST] Checking for existing test leads...");
      const getExistingRes = await fetch(testLeadUrl, { method: "GET" });
      const existingData = await getExistingRes.json();

      // Step 2: Delete existing test leads if any
      if (existingData.data && existingData.data.length > 0) {
        console.log("[META-TEST] Found existing test leads, deleting...");
        for (const lead of existingData.data) {
          const deleteUrl = `https://graph.facebook.com/v19.0/${lead.id}?access_token=${access_token}`;
          const deleteRes = await fetch(deleteUrl, { method: "DELETE" });
          const deleteData = await deleteRes.json();
          console.log(`[META-TEST] Deleted test lead ${lead.id}:`, deleteData);
        }
      }

      // Step 3: Create new test lead
      console.log("[META-TEST] Creating new test lead...");
      const testLeadRes = await fetch(testLeadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const testLeadData = await testLeadRes.json();

      if (testLeadData.error) {
        console.error("[META-TEST] Create test lead error:", testLeadData.error);
        return new Response(JSON.stringify({ 
          error: testLeadData.error.message || "Failed to create test lead",
          fb_error: testLeadData.error 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[META-TEST] Test lead created:", testLeadData);

      return new Response(JSON.stringify({ 
        success: true, 
        lead_id: testLeadData.id,
        message: "Test lead created successfully! It should appear in your contacts shortly."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'list_forms' or 'create_test_lead'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[META-TEST] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
