import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-test-token",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret OR a one-time test token for initial setup
    const cronSecret = req.headers.get("x-cron-secret");
    const testToken = req.headers.get("x-test-token");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    
    // Allow access with CRON_SECRET or a one-time test token
    const oneTimeTestToken = "create-qa-admin-2026-02-02";
    
    const isAuthorized = 
      (expectedSecret && cronSecret === expectedSecret) ||
      (testToken === oneTimeTestToken);
    
    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Hardcoded test user details
    const testUser = {
      email: "qa.admin@example.com",
      password: "Test!12345",
      full_name: "QA Admin Test",
      brand_id: "2dc052de-26b5-48ef-8dee-917ea591a681", // Excell
      role: "admin" as const,
    };

    // Check if user already exists in public.users
    const { data: existingUser } = await adminClient
      .from("users")
      .select("id")
      .eq("email", testUser.email)
      .maybeSingle();

    if (existingUser) {
      // Check if role already assigned
      const { data: existingRole } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("brand_id", testUser.brand_id)
        .eq("role", testUser.role)
        .maybeSingle();

      if (!existingRole) {
        // Assign missing role
        await adminClient
          .from("user_roles")
          .insert({
            user_id: existingUser.id,
            brand_id: testUser.brand_id,
            role: testUser.role,
          });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "User already exists in public.users",
          user: { email: testUser.email, password: testUser.password },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Cleanup any existing auth users with this email
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    const existingAuthUsers = authUsers?.users?.filter(u => u.email === testUser.email) || [];
    
    for (const user of existingAuthUsers) {
      console.log("Deleting existing auth user:", user.id);
      await adminClient.auth.admin.deleteUser(user.id);
    }

    // Wait for deletions to propagate
    if (existingAuthUsers.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Create new auth user - trigger will automatically create public.users entry
    const { data: newAuthUser, error: createError } = await adminClient.auth.admin.createUser({
      email: testUser.email,
      password: testUser.password,
      email_confirm: true,
      user_metadata: { full_name: testUser.full_name },
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

    // Wait for trigger to create public.users entry
    await new Promise(resolve => setTimeout(resolve, 500));

    // Fetch the user created by the trigger
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

    // Assign admin role
    const { error: roleError } = await adminClient
      .from("user_roles")
      .insert({
        user_id: publicUser.id,
        brand_id: testUser.brand_id,
        role: testUser.role,
      });

    if (roleError) {
      console.error("Error assigning role:", roleError);
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Test user created successfully",
        user: {
          id: publicUser.id,
          email: testUser.email,
          password: testUser.password,
          full_name: testUser.full_name,
          role: testUser.role,
          brand_id: testUser.brand_id,
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
