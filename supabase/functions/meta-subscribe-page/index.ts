import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify authorization
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify user JWT
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !userData?.user) {
    console.error("[META-SUBSCRIBE] Auth error:", userError);
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse request body
  let body: { meta_app_id: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { meta_app_id } = body;
  if (!meta_app_id) {
    return new Response(JSON.stringify({ error: "missing_meta_app_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use service role to fetch meta app config
  const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

  const { data: metaApp, error: fetchError } = await supabaseService
    .from("meta_apps")
    .select("*")
    .eq("id", meta_app_id)
    .single();

  if (fetchError || !metaApp) {
    console.error("[META-SUBSCRIBE] Meta app not found:", fetchError);
    return new Response(JSON.stringify({ error: "meta_app_not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check if page_id exists
  if (!metaApp.page_id) {
    return new Response(JSON.stringify({ error: "missing_page_id", message: "Page ID non configurato nella Meta App" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Subscribe page to leadgen webhooks via Graph API
  const graphUrl = `https://graph.facebook.com/v20.0/${metaApp.page_id}/subscribed_apps`;
  
  console.log(`[META-SUBSCRIBE] Subscribing page ${metaApp.page_id} to leadgen webhooks`);

  try {
    const formData = new URLSearchParams();
    formData.append("subscribed_fields", "leadgen");
    formData.append("access_token", metaApp.access_token);

    const graphRes = await fetch(graphUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const graphData = await graphRes.json();

    console.log(`[META-SUBSCRIBE] Graph API response:`, JSON.stringify(graphData));

    if (!graphRes.ok) {
      const errorMessage = graphData.error?.message || "Unknown Graph API error";
      const errorCode = graphData.error?.code;
      
      console.error(`[META-SUBSCRIBE] Graph API error:`, graphData);
      
      return new Response(JSON.stringify({ 
        error: "graph_api_error", 
        message: errorMessage,
        code: errorCode,
        details: graphData.error
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (graphData.success === true) {
      console.log(`[META-SUBSCRIBE] Successfully subscribed page ${metaApp.page_id}`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Pagina sottoscritta con successo ai webhook leadgen" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: false, 
      message: "Risposta inattesa dall'API Graph",
      response: graphData
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(`[META-SUBSCRIBE] Network error:`, err);
    return new Response(JSON.stringify({ 
      error: "network_error", 
      message: "Errore di rete nella chiamata all'API Graph" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
