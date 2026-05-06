import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { validatePassword } from "../_shared/password-policy.ts";

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  brand_ids: string[];  // Support multiple brands
  brand_id?: string;    // Legacy support for single brand
  role: "admin" | "ceo" | "amministrazione" | "responsabile_venditori" | "responsabile_callcenter" | "venditore" | "operatore_callcenter" | "callcenter" | "sales";
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, "restricted");
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

    const callerAuthUserId = user.id;

    // Use service role to check admin status (to avoid RLS issues)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the user's internal ID first
    const { data: internalUser, error: internalError } = await adminClient
      .from("users")
      .select("id")
      .eq("supabase_auth_id", callerAuthUserId)
      .single();
    
    if (internalError || !internalUser) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if requesting user is admin and get their brand scope
    // Only consider active admin roles
    const { data: adminRoles, error: roleError } = await adminClient
      .from("user_roles")
      .select("id, brand_id")
      .eq("user_id", internalUser.id)
      .eq("role", "admin")
      .eq("is_active", true);

    if (roleError || !adminRoles || adminRoles.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine caller's administrable brands
    const callerBrandIds = adminRoles.map(r => r.brand_id);
    const isGlobalAdmin = callerBrandIds.includes("00000000-0000-0000-0000-000000000000");

    const body: CreateUserRequest = await req.json();
    const { email, password, full_name, role } = body;
    
    // Support both brand_ids (array) and legacy brand_id (single)
    const brandIds = body.brand_ids?.length ? body.brand_ids : (body.brand_id ? [body.brand_id] : []);

    if (!email || !password || !full_name || brandIds.length === 0 || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      return new Response(JSON.stringify({ error: pwCheck.error, code: pwCheck.code }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate that all requested brand_ids are within caller's scope
    if (!isGlobalAdmin) {
      const unauthorizedBrands = brandIds.filter((bid: string) => !callerBrandIds.includes(bid));
      if (unauthorizedBrands.length > 0) {
        return new Response(JSON.stringify({ 
          error: "Non sei autorizzato a creare utenti per i brand richiesti",
          unauthorized_count: unauthorizedBrands.length,
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Try to create auth user; if already exists, look them up
    let authUserId: string;
    let isExistingUser = false;

    const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      if (createError.message?.includes("already been registered") || (createError as any).code === "email_exists") {
        // User already exists in auth — look up by email via SECURITY DEFINER RPC
        // (auth.users.email has a unique index → O(1), unlike listUsers() which scans all users).
        // RPC is GRANTed only to service_role.
        const { data: existingId, error: lookupError } = await adminClient.rpc(
          "get_auth_user_id_by_email",
          { p_email: email }
        );

        if (lookupError || !existingId) {
          console.error("Error looking up existing auth user:", lookupError);
          return new Response(JSON.stringify({ error: "Utente esistente ma non trovato in auth" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        authUserId = existingId as string;
        isExistingUser = true;
      } else {
        console.error("Error creating auth user:", createError);
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      authUserId = authUser.user.id;
    }

    // Wait for trigger on_auth_user_created to insert into public.users, then fetch
    let publicUser: { id: string; email: string; full_name: string } | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data } = await adminClient
        .from("users")
        .select("id, email, full_name")
        .eq("supabase_auth_id", authUserId)
        .maybeSingle();
      
      if (data) {
        publicUser = data;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!publicUser) {
      if (!isExistingUser) {
        await adminClient.auth.admin.deleteUser(authUserId);
      }
      return new Response(JSON.stringify({ error: "Record utente non trovato" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // C9: assign roles via SECURITY DEFINER RPC with pg_advisory_xact_lock,
    // so two concurrent admin calls on overlapping brands are serialized.
    // The user_roles_guard trigger remains as a second layer of scope enforcement.
    const { error: roleInsertError } = await adminClient.rpc("admin_create_user", {
      p_caller_auth_id: callerAuthUserId,
      p_target_user_id: publicUser.id,
      p_email: email,
      p_brand_ids: brandIds,
      p_role: role,
    });

    if (roleInsertError) {
      console.error("Error assigning roles:", roleInsertError);
      if (!isExistingUser) {
        await adminClient.from("users").delete().eq("id", publicUser!.id);
        await adminClient.auth.admin.deleteUser(authUserId);
      }
      return new Response(JSON.stringify({ error: roleInsertError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        is_existing_user: isExistingUser,
        user: {
          id: publicUser.id,
          email: publicUser.email,
          full_name: publicUser.full_name,
        },
        assigned_brands: brandIds.length,
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
