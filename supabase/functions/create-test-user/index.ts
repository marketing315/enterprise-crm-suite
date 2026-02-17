import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // H01 FIX: Use CRON_SECRET with dual-secret rotation support only
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const previousSecret = Deno.env.get("CRON_SECRET_PREVIOUS");
    
    const isValidSecret = cronSecret && cronSecret.length > 0 && (
      (expectedSecret && cronSecret === expectedSecret) ||
      (previousSecret && cronSecret === previousSecret)
    );

    if (!isValidSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Read test user config from request body (required)
    const body = await req.json().catch(() => ({}));
    const testEmail = body.email;
    const testFullName = body.full_name;
    const testBrandId = body.brand_id;
    const ALLOWED_ROLES = ["admin", "ceo", "callcenter", "sales", "responsabile_callcenter", "responsabile_vendite", "operatore_callcenter", "venditore"];
    const testRole = ALLOWED_ROLES.includes(body.role) ? body.role : "admin";

    if (!testEmail || !testFullName || !testBrandId) {
      return new Response(JSON.stringify({ error: "email, full_name, and brand_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // H01 FIX: Generate a random password (never returned in response)
    const randomPassword = crypto.randomUUID() + "!Aa1";

    // Check if user already exists in public.users
    const { data: existingUser } = await adminClient
      .from("users")
      .select("id")
      .eq("email", testEmail)
      .maybeSingle();

    if (existingUser) {
      // Check if role already assigned
      const { data: existingRole } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("brand_id", testBrandId)
        .eq("role", testRole)
        .maybeSingle();

      if (!existingRole) {
        const { error: roleInsertError } = await adminClient
          .from("user_roles")
          .insert({
            user_id: existingUser.id,
            brand_id: testBrandId,
            role: testRole,
          });

        if (roleInsertError) {
          console.error("Error assigning role to existing user:", roleInsertError);
          return new Response(JSON.stringify({ error: roleInsertError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // H01 FIX: Never return password or sensitive data
      return new Response(
        JSON.stringify({
          success: true,
          message: "User already exists, role ensured",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: newAuthUser, error: createError } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: randomPassword,
      email_confirm: true,
      user_metadata: { full_name: testFullName },
    });

    if (createError || !newAuthUser?.user) {
      console.error("Error creating auth user:", createError);
      return new Response(JSON.stringify({ error: createError?.message || "Failed to create auth user" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUserId = newAuthUser.user.id;

    // H07 FIX: Wait for trigger to create public.users row, then fetch it
    await new Promise(resolve => setTimeout(resolve, 500));

    const { data: publicUser, error: fetchError } = await adminClient
      .from("users")
      .select("id")
      .eq("supabase_auth_id", authUserId)
      .single();

    if (fetchError || !publicUser) {
      console.error("Error fetching public user created by trigger:", fetchError);
      return new Response(JSON.stringify({ error: "User was not created by trigger" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: roleError } = await adminClient
      .from("user_roles")
      .insert({
        user_id: publicUser.id,
        brand_id: testBrandId,
        role: testRole,
      });

    if (roleError) {
      console.error("Error assigning role:", roleError);
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // H01 FIX: Never return password
    return new Response(
      JSON.stringify({
        success: true,
        message: "Test user created successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});