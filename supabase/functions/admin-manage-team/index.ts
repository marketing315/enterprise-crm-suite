import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = 
  | "admin" 
  | "ceo" 
  | "responsabile_venditori" 
  | "responsabile_callcenter" 
  | "venditore" 
  | "operatore_callcenter"
  | "callcenter" 
  | "sales";

interface InviteUserRequest {
  action: "invite";
  brand_id: string;
  email: string;
  role: AppRole;
  full_name?: string;
}

interface UpdateMemberRequest {
  action: "update_member";
  membership_id: string;
  new_role?: AppRole;
  is_active?: boolean;
}

interface ListMembersRequest {
  action: "list";
  brand_id: string;
  role_filter?: AppRole;
  active_only?: boolean;
}

interface GetAssignableRolesRequest {
  action: "get_assignable_roles";
  brand_id: string;
}

type RequestBody = InviteUserRequest | UpdateMemberRequest | ListMembersRequest | GetAssignableRolesRequest;

async function getCallerContext(authHeader: string) {
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

  return { adminClient, callerId: internalUser.id, authUserId: user.id };
}

async function getCallerRoleInBrand(
  adminClient: any,
  callerId: string,
  brandId: string
): Promise<AppRole | null> {
  const roleOrder: Record<string, number> = {
    admin: 100, ceo: 90, 
    responsabile_venditori: 50, responsabile_callcenter: 50,
    venditore: 10, sales: 10, operatore_callcenter: 10, callcenter: 10
  };
  
  const { data: allRoles } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("brand_id", brandId)
    .eq("is_active", true);

  if (!allRoles || allRoles.length === 0) return null;

  let highestRole = allRoles[0].role as AppRole;
  for (const r of allRoles) {
    const rRole = r.role as string;
    if ((roleOrder[rRole] || 0) > (roleOrder[highestRole] || 0)) {
      highestRole = r.role as AppRole;
    }
  }
  return highestRole;
}

function canManageRole(managerRole: AppRole, targetRole: AppRole): boolean {
  if (managerRole === "admin") return true;
  if (managerRole === "ceo" && targetRole !== "admin") return true;
  if (managerRole === "responsabile_venditori" && 
      (targetRole === "venditore" || targetRole === "sales")) return true;
  if (managerRole === "responsabile_callcenter" && 
      (targetRole === "operatore_callcenter" || targetRole === "callcenter")) return true;
  return false;
}

function getAssignableRolesForRole(managerRole: AppRole): { value: AppRole; label: string }[] {
  const allRoles: { value: AppRole; label: string }[] = [
    { value: "ceo", label: "CEO" },
    { value: "responsabile_venditori", label: "Responsabile Venditori" },
    { value: "responsabile_callcenter", label: "Responsabile Call Center" },
    { value: "venditore", label: "Venditore" },
    { value: "operatore_callcenter", label: "Operatore Call Center" },
  ];
  
  return allRoles.filter(r => canManageRole(managerRole, r.value));
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

    const { adminClient, callerId } = await getCallerContext(authHeader);
    const body: RequestBody = await req.json();

    switch (body.action) {
      case "get_assignable_roles": {
        const { brand_id } = body;
        
        const callerRole = await getCallerRoleInBrand(adminClient, callerId, brand_id);
        if (!callerRole) {
          return new Response(JSON.stringify({ error: "Non hai accesso a questo brand" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const roles = getAssignableRolesForRole(callerRole);
        return new Response(JSON.stringify({ roles }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list": {
        const { brand_id, role_filter, active_only = true } = body;
        
        const callerRole = await getCallerRoleInBrand(adminClient, callerId, brand_id);
        if (!callerRole) {
          return new Response(JSON.stringify({ error: "Non hai accesso a questo brand" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let query = adminClient
          .from("user_roles")
          .select(`
            id,
            user_id,
            role,
            is_active,
            created_at,
            users!inner(id, email, full_name)
          `)
          .eq("brand_id", brand_id);

        if (role_filter) {
          query = query.eq("role", role_filter);
        }
        if (active_only) {
          query = query.eq("is_active", true);
        }

        const { data: members, error } = await query.order("created_at", { ascending: false });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Filter based on visibility rules and add can_edit
        const filteredMembers = (members || [])
          .filter((m: any) => {
            // Admin/CEO see all
            if (callerRole === "admin" || callerRole === "ceo") return true;
            // Others see what they can manage + themselves
            return canManageRole(callerRole, m.role) || m.user_id === callerId;
          })
          .map((m: any) => ({
            membership_id: m.id,
            user_id: m.user_id,
            email: m.users?.email,
            full_name: m.users?.full_name,
            role: m.role,
            is_active: m.is_active,
            created_at: m.created_at,
            can_edit: canManageRole(callerRole, m.role) && m.user_id !== callerId,
          }));

        return new Response(JSON.stringify({ members: filteredMembers }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "invite": {
        const { brand_id, email, role, full_name } = body;

        // Check caller can manage this role
        const callerRole = await getCallerRoleInBrand(adminClient, callerId, brand_id);
        if (!callerRole || !canManageRole(callerRole, role)) {
          return new Response(JSON.stringify({ error: "Non sei autorizzato ad assegnare questo ruolo" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if user already exists in auth
        const { data: existingUsers } = await adminClient.auth.admin.listUsers();
        const existingAuthUser = existingUsers?.users.find(
          u => u.email?.toLowerCase() === email.toLowerCase()
        );

        let authUserId: string;
        let isNewUser = false;

        if (existingAuthUser) {
          authUserId = existingAuthUser.id;
        } else {
          // Create new user with invite
          const { data: newUser, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
            data: { full_name: full_name || email },
          });

          if (inviteError) {
            return new Response(JSON.stringify({ error: `Errore invito: ${inviteError.message}` }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          authUserId = newUser.user.id;
          isNewUser = true;
        }

        // Check/create internal user record
        let { data: internalUser } = await adminClient
          .from("users")
          .select("id")
          .eq("supabase_auth_id", authUserId)
          .maybeSingle();

        if (!internalUser) {
          const { data: newInternalUser, error: createError } = await adminClient
            .from("users")
            .insert({
              supabase_auth_id: authUserId,
              email: email.toLowerCase(),
              full_name: full_name || email,
            })
            .select("id")
            .single();

          if (createError) {
            return new Response(JSON.stringify({ error: `Errore creazione utente: ${createError.message}` }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          internalUser = newInternalUser;
        }

        // Check if user already has a role in this brand
        const { data: existingRole } = await adminClient
          .from("user_roles")
          .select("id, role, is_active")
          .eq("user_id", internalUser.id)
          .eq("brand_id", brand_id)
          .maybeSingle();

        if (existingRole) {
          // Reactivate and update role if needed
          const { error: updateError } = await adminClient
            .from("user_roles")
            .update({ role, is_active: true })
            .eq("id", existingRole.id);

          if (updateError) {
            return new Response(JSON.stringify({ error: updateError.message }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ 
            success: true, 
            membership_id: existingRole.id,
            user_id: internalUser.id,
            was_existing: true,
            is_new_user: isNewUser,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Create new membership
        const { data: newMembership, error: insertError } = await adminClient
          .from("user_roles")
          .insert({
            user_id: internalUser.id,
            brand_id,
            role,
            is_active: true,
          })
          .select("id")
          .single();

        if (insertError) {
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ 
          success: true, 
          membership_id: newMembership.id,
          user_id: internalUser.id,
          is_new_user: isNewUser,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_member": {
        const { membership_id, new_role, is_active } = body;

        // Get membership info
        const { data: membership, error: fetchError } = await adminClient
          .from("user_roles")
          .select("brand_id, role, user_id")
          .eq("id", membership_id)
          .single();

        if (fetchError || !membership) {
          return new Response(JSON.stringify({ error: "Membership non trovata" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const callerRole = await getCallerRoleInBrand(adminClient, callerId, membership.brand_id);
        
        // Check caller can manage current role
        if (!callerRole || !canManageRole(callerRole, membership.role as AppRole)) {
          return new Response(JSON.stringify({ error: "Non autorizzato a gestire questo membro" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // If changing role, check can manage new role too
        if (new_role && !canManageRole(callerRole, new_role)) {
          return new Response(JSON.stringify({ error: "Non autorizzato ad assegnare questo ruolo" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Prevent self-modification of own role
        if (membership.user_id === callerId && new_role) {
          return new Response(JSON.stringify({ error: "Non puoi modificare il tuo stesso ruolo" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update
        const updates: Record<string, unknown> = {};
        if (new_role !== undefined) updates.role = new_role;
        if (is_active !== undefined) updates.is_active = is_active;

        const { error: updateError } = await adminClient
          .from("user_roles")
          .update(updates)
          .eq("id", membership_id);

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

      default:
        return new Response(JSON.stringify({ error: "Azione non valida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Errore interno";
    const status = message.includes("access") || message.includes("token") ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
