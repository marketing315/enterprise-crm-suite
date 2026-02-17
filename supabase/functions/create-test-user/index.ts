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
    // B05 FIX: Use CRON_SECRET only (remove hardcoded backdoor token)
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    
    if (!expectedSecret || !cronSecret || cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Read test user config from request body
    const body = await req.json().catch(() => ({}));
    const testEmail = body.email || "qa.admin@example.com";
    const testFullName = body.full_name || "QA Admin Test";
    const testBrandId = body.brand_id || "2dc052de-26b5-48ef-8dee-917ea591a681";
    const testRole = body.role || "admin";

    // Generate a random password (never returned in response)
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
        await adminClient
          .from("user_roles")
          .insert({
            user_id: existingUser.id,
            brand_id: testBrandId,
            role: testRole,
          });
      }

      // B05 FIX: Never return password in response
      return new Response(
        JSON.stringify({
          success: true,
          message: "User already exists",
          user: { email: testEmail },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Cleanup any existing auth users with this email
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    const existingAuthUsers = authUsers?.users?.filter(u => u.email === testEmail) || [];
    
    for (const user of existingAuthUsers) {
      console.log("Deleting existing auth user:", user.id);
      await adminClient.auth.admin.deleteUser(user.id);
    }

    if (existingAuthUsers.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
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
    console.log("Created auth user with ID:", authUserId);

    await new Promise(resolve => setTimeout(resolve, 500));

    const { data: publicUser, error: fetchError } = await adminClient
      .from("users")
      .select("id, email, full_name")
      .eq("supabase_auth_id", authUserId)
      .single();

    if (fetchError || !publicUser) {
      console.error("Error fetching public user created by trigger:", fetchError);
      return new Response(JSON.stringify({ error: fetchError?.message || "User was not created by trigger" }), {
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

    // B05 FIX: Never return password in response
    return new Response(
      JSON.stringify({
        success: true,
        message: "Test user created successfully",
        user: {
          id: publicUser.id,
          email: testEmail,
          full_name: testFullName,
          role: testRole,
          brand_id: testBrandId,
        },
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
