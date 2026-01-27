import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  brand_id: string;
  role: "admin" | "ceo" | "callcenter" | "sales";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the requesting user is an admin
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the current user from the token
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUserId = user.id;

    // Use service role to check admin status (to avoid RLS issues)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the user's internal ID first
    const { data: internalUser, error: internalError } = await adminClient
      .from("users")
      .select("id")
      .eq("supabase_auth_id", authUserId)
      .single();
    
    if (internalError || !internalUser) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if requesting user is admin
    const { data: adminRole, error: roleError } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", internalUser.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !adminRole) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, full_name, brand_id, role }: CreateUserRequest = await req.json();

    if (!email || !password || !full_name || !brand_id || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user
    const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      console.error("Error creating auth user:", createError);
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user in public.users table
    const { data: publicUser, error: publicUserError } = await adminClient
      .from("users")
      .insert({
        supabase_auth_id: authUser.user.id,
        email,
        full_name,
      })
      .select()
      .single();

    if (publicUserError) {
      console.error("Error creating public user:", publicUserError);
      // Rollback: delete auth user
      await adminClient.auth.admin.deleteUser(authUser.user.id);
      return new Response(JSON.stringify({ error: publicUserError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign role to user for the brand
    const { error: roleInsertError } = await adminClient
      .from("user_roles")
      .insert({
        user_id: publicUser.id,
        brand_id,
        role,
      });

    if (roleInsertError) {
      console.error("Error assigning role:", roleInsertError);
      // Rollback
      await adminClient.from("users").delete().eq("id", publicUser.id);
      await adminClient.auth.admin.deleteUser(authUser.user.id);
      return new Response(JSON.stringify({ error: roleInsertError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: publicUser.id,
          email: publicUser.email,
          full_name: publicUser.full_name,
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
