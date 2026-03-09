import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const googleClientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID");

    if (!googleClientId) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_ADS_CLIENT_ID not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is admin/ceo
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body for brand_id
    const body = await req.json().catch(() => ({}));
    const brandId = body.brand_id;

    // B16 FIX: Verify user has admin/ceo role on this brand
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: crmUser } = await serviceClient
      .from("users")
      .select("id")
      .eq("supabase_auth_id", userData.user.id)
      .single();

    if (!crmUser) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminRole } = await serviceClient
      .from("user_roles")
      .select("id")
      .eq("user_id", crmUser.id)
      .eq("brand_id", brandId || "")
      .in("role", ["admin", "ceo"])
      .limit(1)
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Forbidden: admin or ceo role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!brandId) {
      return new Response(JSON.stringify({ error: "brand_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;

    // H05 FIX: Sign state with HMAC to prevent tampering; don't include raw token
    const statePayload = { brand_id: brandId, user_id: crmUser.id, exp: Date.now() + 600_000 };
    const stateJson = JSON.stringify(statePayload);
    const hmacSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(hmacSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(stateJson));
    const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    const state = btoa(JSON.stringify({ ...statePayload, sig: sigHex }));

    const scopes = [
      "https://www.googleapis.com/auth/adwords",
    ].join(" ");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", googleClientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    return new Response(
      JSON.stringify({ auth_url: authUrl.toString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("google-oauth-start error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
