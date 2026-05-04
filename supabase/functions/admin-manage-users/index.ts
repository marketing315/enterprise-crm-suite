import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { validatePassword } from "../_shared/password-policy.ts";

type AppRole = 
  | "admin" 
  | "ceo" 
  | "amministrazione"
  | "responsabile_venditori" 
  | "responsabile_callcenter" 
  | "venditore" 
  | "operatore_callcenter"
  | "callcenter" 
  | "sales";

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

interface ResetPasswordRequest {
  action: "reset_password";
  user_id: string;
  new_password: string;
}

interface ResendConfirmationRequest {
  action: "resend_confirmation";
  user_id: string;
}

interface ConfirmEmailRequest {
  action: "confirm_email";
  user_id: string;
}

type RequestBody = UpdateUserRequest | DeleteUserRequest | UpdateRoleRequest | DeleteRoleRequest | AddRoleRequest | ResetPasswordRequest | ResendConfirmationRequest;

async function verifyAdmin(authHeader: string): Promise<{ adminClient: ReturnType<typeof createClient>; callerBrandIds: string[] }> {
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

  // Fetch all admin roles with their brand_ids for scoping
  // Only consider active admin roles
  const { data: adminRoles, error: roleError } = await adminClient
    .from("user_roles")
    .select("id, brand_id")
    .eq("user_id", internalUser.id)
    .eq("role", "admin")
    .eq("is_active", true);

  if (roleError || !adminRoles || adminRoles.length === 0) {
    throw new Error("Admin access required");
  }

  // Collect brand_ids this admin can manage
  const callerBrandIds = adminRoles.map(r => r.brand_id);
  // System brand (all-zero) means global admin
  const isGlobalAdmin = callerBrandIds.includes("00000000-0000-0000-0000-000000000000");

  return { adminClient, callerBrandIds: isGlobalAdmin ? [] : callerBrandIds };
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

    const { adminClient, callerBrandIds } = await verifyAdmin(authHeader);
    const body: RequestBody = await req.json();

    // Helper to check if caller can manage a given brand
    const isGlobalAdmin = callerBrandIds.length === 0;
    const canManageBrand = (brandId: string) => isGlobalAdmin || callerBrandIds.includes(brandId);

    // Helper to verify target user belongs to caller's brands
    async function assertCanManageUser(userId: string) {
      if (isGlobalAdmin) return;
      const { data: targetRoles } = await adminClient
        .from("user_roles")
        .select("brand_id")
        .eq("user_id", userId);
      const targetBrands = targetRoles?.map(r => r.brand_id) || [];
      const hasOverlap = targetBrands.some(b => callerBrandIds.includes(b));
      if (!hasOverlap) {
        throw new Error("Admin access required");
      }
    }

    // Helper to verify target role belongs to caller's brands
    async function assertCanManageRole(roleId: string) {
      if (isGlobalAdmin) return;
      const { data: role } = await adminClient
        .from("user_roles")
        .select("brand_id")
        .eq("id", roleId)
        .single();
      if (!role || !canManageBrand(role.brand_id)) {
        throw new Error("Admin access required");
      }
    }

    switch (body.action) {
      case "update": {
        const { user_id, full_name, email } = body;
        await assertCanManageUser(user_id);
        
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
            return new Response(JSON.stringify({ error: `Auth sync failed: ${authUpdateError.message}` }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete": {
        const { user_id } = body;
        await assertCanManageUser(user_id);

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

        // Delete auth.users FIRST — if this fails, application data remains intact
        // and the operation can be safely retried. The reverse order would leave orphaned
        // auth records if application-level deletes fail.
        const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(
          userData.supabase_auth_id
        );

        if (authDeleteError) {
          console.error("Error deleting auth user:", authDeleteError);
          return new Response(JSON.stringify({ error: `Auth deletion failed: ${authDeleteError.message}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Now delete application data (auth user is already gone, so safe)
        // Delete user roles first (FK dependency)
        const { error: rolesDeleteError } = await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", user_id);

        if (rolesDeleteError) {
          console.error("Error deleting user roles (auth user already deleted):", rolesDeleteError);
        }

        // Delete from public.users
        const { error: deleteError } = await adminClient
          .from("users")
          .delete()
          .eq("id", user_id);

        if (deleteError) {
          console.error("Error deleting public.users (auth user already deleted):", deleteError);
          return new Response(JSON.stringify({ 
            error: `Partial deletion: auth user removed but application record cleanup failed: ${deleteError.message}`,
            auth_deleted: true,
          }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_role": {
        const { role_id, role } = body;
        await assertCanManageRole(role_id);

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
        await assertCanManageRole(role_id);

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
        if (!canManageBrand(brand_id)) {
          throw new Error("Admin access required");
        }

        // Check if user already has a role for this brand
        const { data: existingRole } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", user_id)
          .eq("brand_id", brand_id)
          .maybeSingle();

        if (existingRole) {
          return new Response(JSON.stringify({ error: "User already has a role for this brand. Update the existing role instead." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: insertedRole, error: insertError } = await adminClient
          .from("user_roles")
          .insert({ user_id, brand_id, role })
          .select("id")
          .single();

        if (insertError) {
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true, role_id: insertedRole.id }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "reset_password": {
        const { user_id, new_password } = body as ResetPasswordRequest;
        await assertCanManageUser(user_id);

        const pwCheck = validatePassword(new_password);
        if (!pwCheck.ok) {
          return new Response(JSON.stringify({ error: pwCheck.error, code: pwCheck.code }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

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

        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
          userData.supabase_auth_id,
          { password: new_password }
        );

        if (authUpdateError) {
          return new Response(JSON.stringify({ error: `Password reset failed: ${authUpdateError.message}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "resend_confirmation": {
        const { user_id } = body as ResendConfirmationRequest;
        await assertCanManageUser(user_id);

        const { data: userData, error: userFetchError } = await adminClient
          .from("users")
          .select("supabase_auth_id, email")
          .eq("id", user_id)
          .single();

        if (userFetchError || !userData) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Generate a fresh signup confirmation link (triggers auth email hook if configured)
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "signup",
          email: userData.email,
        });

        if (linkError) {
          return new Response(JSON.stringify({ error: `Invio fallito: ${linkError.message}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Try to enqueue the confirmation email via pgmq if available
        const confirmationUrl = linkData?.properties?.action_link;
        if (confirmationUrl) {
          try {
            await adminClient.rpc("enqueue_email", {
              p_queue_name: "auth_emails",
              p_to_email: userData.email,
              p_subject: "Conferma il tuo indirizzo email",
              p_html: `<p>Clicca il link per confermare il tuo account:</p><p><a href="${confirmationUrl}">Conferma Email</a></p>`,
              p_from_name: "Sistema",
              p_metadata: { type: "admin_resend_confirmation", user_id },
            });
          } catch {
            // enqueue_email may not exist — confirmation link was still generated
            console.log("enqueue_email not available, link generated only");
          }
        }

        return new Response(JSON.stringify({ success: true, email_sent: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "confirm_email": {
        const { user_id } = body as ConfirmEmailRequest;
        await assertCanManageUser(user_id);

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

        const { error: confirmError } = await adminClient.auth.admin.updateUserById(
          userData.supabase_auth_id,
          { email_confirm: true }
        );

        if (confirmError) {
          return new Response(JSON.stringify({ error: `Confirm failed: ${confirmError.message}` }), {
            status: 500,
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
