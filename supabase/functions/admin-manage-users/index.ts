import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "admin" | "ceo" | "callcenter" | "sales";

interface UpdateUserRequest {
  action: "update";
  user_id: string;
  full_name?: string;
  email?: string;
}

interface DeleteUserRequest {
  action: "delete";
  user_id: string;
}

interface UpdateRoleRequest {
  action: "update_role";
  role_id: string;
  role: AppRole;
}

interface DeleteRoleRequest {
  action: "delete_role";
  role_id: string;
}

interface AddRoleRequest {
  action: "add_role";
  user_id: string;
  brand_id: string;
  role: AppRole;
}

type RequestBody = UpdateUserRequest | DeleteUserRequest | UpdateRoleRequest | DeleteRoleRequest | AddRoleRequest;

async function verifyAdmin(authHeader: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  
  if (userError || !user) {
    throw new Error("Invalid token");
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: internalUser, error: internalError } = await adminClient
    .from("users")
    .select("id")
    .eq("supabase_auth_id", user.id)
    .single();
  
  if (internalError || !internalUser) {
    throw new Error("User not found");
  }

  const { data: adminRole, error: roleError } = await adminClient
    .from("user_roles")
    .select("id")
    .eq("user_id", internalUser.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError || !adminRole) {
    throw new Error("Admin access required");
  }

  return adminClient;
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

    const adminClient = await verifyAdmin(authHeader);
    const body: RequestBody = await req.json();

    switch (body.action) {
      case "update": {
        const { user_id, full_name, email } = body;
        
        // Get the user's supabase_auth_id
        const { data: userData, error: userFetchError } = await adminClient
          .from("users")
          .select("supabase_auth_id")
          .eq("id", user_id)
          .single();

        if (userFetchError || !userData) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update public.users table
        const updateData: Record<string, string> = {};
        if (full_name) updateData.full_name = full_name;
        if (email) updateData.email = email;

        const { error: updateError } = await adminClient
          .from("users")
          .update(updateData)
          .eq("id", user_id);

        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update auth.users if email changed
        if (email) {
          const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
            userData.supabase_auth_id,
            { email }
          );
          if (authUpdateError) {
            console.error("Error updating auth email:", authUpdateError);
          }
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete": {
        const { user_id } = body;

        // Get the user's supabase_auth_id
        const { data: userData, error: userFetchError } = await adminClient
          .from("users")
          .select("supabase_auth_id")
          .eq("id", user_id)
          .single();

        if (userFetchError || !userData) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Delete user roles first
        await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", user_id);

        // Delete from public.users
        const { error: deleteError } = await adminClient
          .from("users")
          .delete()
          .eq("id", user_id);

        if (deleteError) {
          return new Response(JSON.stringify({ error: deleteError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Delete from auth.users
        const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(
          userData.supabase_auth_id
        );

        if (authDeleteError) {
          console.error("Error deleting auth user:", authDeleteError);
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_role": {
        const { role_id, role } = body;

        const { error: updateError } = await adminClient
          .from("user_roles")
          .update({ role })
          .eq("id", role_id);

        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_role": {
        const { role_id } = body;

        const { error: deleteError } = await adminClient
          .from("user_roles")
          .delete()
          .eq("id", role_id);

        if (deleteError) {
          return new Response(JSON.stringify({ error: deleteError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "add_role": {
        const { user_id, brand_id, role } = body;

        const { error: insertError } = await adminClient
          .from("user_roles")
          .insert({ user_id, brand_id, role });

        if (insertError) {
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Admin access") || message.includes("Invalid token") ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
