import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

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

interface AssignToAllBrandsRequest {
  action: "assign_to_all_brands";
  user_id: string;
  role: AppRole;
}

interface ResetPasswordRequest {
  action: "reset_password";
  target_user_id: string;
  new_password: string;
}

type RequestBody = InviteUserRequest | UpdateMemberRequest | ListMembersRequest | GetAssignableRolesRequest | AssignToAllBrandsRequest | ResetPasswordRequest;

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

// B03 FIX: Only grant global access if admin/ceo role is on a system/sentinel brand,
// not on any arbitrary brand. This prevents cross-brand privilege escalation.
const SYSTEM_BRAND_ID = "00000000-0000-0000-0000-000000000000";

async function getCallerRoleInBrand(
  adminClient: any,
  callerId: string,
  brandId: string
): Promise<AppRole | null> {
  const roleOrder: Record<string, number> = {
    admin: 100, ceo: 90, amministrazione: 80,
    responsabile_venditori: 50, responsabile_callcenter: 50,
    venditore: 10, sales: 10, operatore_callcenter: 10, callcenter: 10
  };
  
  const isAllBrands = brandId === "__ALL_BRANDS__";
  
  // Check for global admin/ceo roles ONLY on system brand or brands with is_system=true
  const { data: systemBrands } = await adminClient
    .from("brands")
    .select("id")
    .eq("is_system", true);
  
  const systemBrandIds = new Set([
    SYSTEM_BRAND_ID,
    ...(systemBrands || []).map((b: any) => b.id),
  ]);
  
  const { data: adminCeoRoles } = await adminClient
    .from("user_roles")
    .select("role, brand_id")
    .eq("user_id", callerId)
    .in("role", ["admin", "ceo"])
    .eq("is_active", true);

  // Only roles on system brands grant global access
  const globalRoles = (adminCeoRoles || []).filter((r: any) => systemBrandIds.has(r.brand_id));
  
  if (globalRoles.length > 0) {
    let highestGlobalRole = globalRoles[0].role as AppRole;
    for (const r of globalRoles) {
      const rRole = r.role as string;
      if ((roleOrder[rRole] || 0) > (roleOrder[highestGlobalRole] || 0)) {
        highestGlobalRole = r.role as AppRole;
      }
    }
    return highestGlobalRole;
  }

  // If requesting all brands but user has no global role, deny access
  if (isAllBrands) {
    return null;
  }

  // Then check for brand-specific roles (including admin/ceo on this specific brand)
  const { data: brandRoles } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("brand_id", brandId)
    .eq("is_active", true);

  if (!brandRoles || brandRoles.length === 0) return null;

  let highestRole = brandRoles[0].role as AppRole;
  for (const r of brandRoles) {
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
  // Amministrazione can be managed by admin/ceo only (handled above)
  if (managerRole === "responsabile_venditori" && 
      (targetRole === "venditore" || targetRole === "sales")) return true;
  if (managerRole === "responsabile_callcenter" && 
      (targetRole === "operatore_callcenter" || targetRole === "callcenter")) return true;
  return false;
}

function getAssignableRolesForRole(managerRole: AppRole): { value: AppRole; label: string }[] {
  const allRoles: { value: AppRole; label: string }[] = [
    { value: "admin", label: "Admin" },
    { value: "ceo", label: "CEO" },
    { value: "amministrazione", label: "Amministrazione" },
    { value: "responsabile_venditori", label: "Responsabile Venditori" },
    { value: "responsabile_callcenter", label: "Responsabile Call Center" },
    { value: "venditore", label: "Venditore" },
    { value: "operatore_callcenter", label: "Operatore Call Center" },
  ];
  
  return allRoles.filter(r => canManageRole(managerRole, r.value));
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

    const { adminClient, callerId } = await getCallerContext(authHeader);
    const body: RequestBody = await req.json();

    // Helper to check if brand_id is the special "all brands" constant
    const isAllBrands = (brandId: string) => brandId === "__ALL_BRANDS__";

    switch (body.action) {
      case "get_assignable_roles": {
        const { brand_id } = body;
        
        // For all brands view, check if caller is admin/ceo globally
        if (isAllBrands(brand_id)) {
          const callerRole = await getCallerRoleInBrand(adminClient, callerId, brand_id);
          if (!callerRole || (callerRole !== "admin" && callerRole !== "ceo")) {
            return new Response(JSON.stringify({ error: "Solo Admin e CEO possono gestire tutti i brand" }), {
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
        
        // Handle "all brands" view - only for admin/ceo
        if (isAllBrands(brand_id)) {
          const callerRole = await getCallerRoleInBrand(adminClient, callerId, brand_id);
          if (!callerRole || (callerRole !== "admin" && callerRole !== "ceo")) {
            return new Response(JSON.stringify({ error: "Solo Admin e CEO possono visualizzare tutti i brand" }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Get all members from all brands
          let query = adminClient
            .from("user_roles")
            .select(`
              id,
              user_id,
              role,
              is_active,
              created_at,
              brand_id,
              users!inner(id, email, full_name),
              brands!inner(id, name)
            `);

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

          const mappedMembers = (members || []).map((m: any) => ({
            membership_id: m.id,
            user_id: m.user_id,
            email: m.users?.email,
            full_name: m.users?.full_name,
            role: m.role,
            is_active: m.is_active,
            created_at: m.created_at,
            brand_id: m.brand_id,
            brand_name: m.brands?.name,
            can_edit: callerRole === "admin" || (callerRole === "ceo" && m.role !== "admin"),
          }));

          return new Response(JSON.stringify({ members: mappedMembers }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
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

        // PERF: indexed lookup on auth.users.email (unique index → O(1)).
        // Replaces previous paginated listUsers() scan that degraded with auth size.
        const normalizedEmail = email.toLowerCase();
        const { data: existingRow } = await adminClient
          .schema("auth" as any)
          .from("users")
          .select("id, email")
          .eq("email", normalizedEmail)
          .maybeSingle();
        const existingAuthUser: { id: string } | null = existingRow?.id
          ? { id: existingRow.id as string }
          : null;

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
          // B10 FIX: Use upsert on supabase_auth_id to handle race conditions
          // (e.g. trigger or parallel invite creating the row concurrently)
          const { data: upsertedUser, error: createError } = await adminClient
            .from("users")
            .upsert(
              {
                supabase_auth_id: authUserId,
                email: email.toLowerCase(),
                full_name: full_name || email,
              },
              { onConflict: "supabase_auth_id" }
            )
            .select("id")
            .single();

          if (createError) {
            // Fallback: re-read in case of unexpected conflict
            const { data: retryUser } = await adminClient
              .from("users")
              .select("id")
              .eq("supabase_auth_id", authUserId)
              .maybeSingle();
            if (!retryUser) {
              return new Response(JSON.stringify({ error: `Errore creazione utente: ${createError.message}` }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            internalUser = retryUser;
          } else {
            internalUser = upsertedUser;
          }
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

      case "assign_to_all_brands": {
        const { user_id, role } = body as AssignToAllBrandsRequest;

        // Only admin/ceo can assign to all brands
        const callerRole = await getCallerRoleInBrand(adminClient, callerId, "__ALL_BRANDS__");
        if (!callerRole || (callerRole !== "admin" && callerRole !== "ceo")) {
          return new Response(JSON.stringify({ error: "Solo Admin e CEO possono assegnare a tutti i brand" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check caller can assign the target role
        if (!canManageRole(callerRole, role)) {
          return new Response(JSON.stringify({ error: "Non autorizzato ad assegnare questo ruolo" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get all non-system brands
        const { data: allBrands, error: brandsError } = await adminClient
          .from("brands")
          .select("id")
          .or("is_system.is.null,is_system.eq.false");

        if (brandsError) {
          return new Response(JSON.stringify({ error: brandsError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Upsert user_roles for each brand
        const upsertPromises = (allBrands || []).map(async (brand) => {
          const { data: existing } = await adminClient
            .from("user_roles")
            .select("id")
            .eq("user_id", user_id)
            .eq("brand_id", brand.id)
            .maybeSingle();

          if (existing) {
            // Update existing
            return adminClient
              .from("user_roles")
              .update({ role, is_active: true })
              .eq("id", existing.id);
          } else {
            // Insert new
            return adminClient
              .from("user_roles")
              .insert({ user_id, brand_id: brand.id, role, is_active: true });
          }
        });

        const results = await Promise.all(upsertPromises);
        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
          console.error("[assign_to_all_brands] Partial failures:", errors.map(e => e.error?.message));
          return new Response(JSON.stringify({ 
            error: `Assegnazione parziale: ${errors.length}/${allBrands?.length || 0} brand falliti`,
            failed_count: errors.length,
            total_count: allBrands?.length || 0,
          }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ 
          success: true, 
          brands_assigned: allBrands?.length || 0 
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "reset_password": {
        const { target_user_id, new_password } = body as ResetPasswordRequest;

        if (!new_password || new_password.length < 6) {
          return new Response(JSON.stringify({ error: "La password deve essere di almeno 6 caratteri" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get target user's roles to check if caller can manage them
        const { data: targetRoles, error: targetRolesError } = await adminClient
          .from("user_roles")
          .select("role, brand_id")
          .eq("user_id", target_user_id)
          .eq("is_active", true);

        if (targetRolesError || !targetRoles || targetRoles.length === 0) {
          return new Response(JSON.stringify({ error: "Utente non trovato o senza ruoli attivi" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // B08 FIX: Caller must be able to manage ALL target roles, not just one.
        // B09 FIX: Fetch caller context once (system brands + caller roles) to avoid N+1 queries.
        const { data: systemBrands } = await adminClient
          .from("brands")
          .select("id")
          .eq("is_system", true);
        const systemBrandIds = new Set([
          SYSTEM_BRAND_ID,
          ...(systemBrands || []).map((b: any) => b.id),
        ]);

        const { data: callerAllRoles } = await adminClient
          .from("user_roles")
          .select("role, brand_id")
          .eq("user_id", callerId)
          .eq("is_active", true);

        const roleOrder: Record<string, number> = {
          admin: 100, ceo: 90, amministrazione: 80,
          responsabile_venditori: 50, responsabile_callcenter: 50,
          venditore: 10, sales: 10, operatore_callcenter: 10, callcenter: 10
        };

        // Determine caller's global role (from system brands only)
        const callerGlobalRoles = (callerAllRoles || []).filter((r: any) => systemBrandIds.has(r.brand_id));
        let callerGlobalRole: AppRole | null = null;
        for (const r of callerGlobalRoles) {
          if (!callerGlobalRole || (roleOrder[r.role] || 0) > (roleOrder[callerGlobalRole] || 0)) {
            callerGlobalRole = r.role as AppRole;
          }
        }

        // Build a map of caller's highest role per brand
        const callerRoleByBrand = new Map<string, AppRole>();
        for (const r of (callerAllRoles || [])) {
          const existing = callerRoleByBrand.get(r.brand_id);
          if (!existing || (roleOrder[r.role] || 0) > (roleOrder[existing] || 0)) {
            callerRoleByBrand.set(r.brand_id, r.role as AppRole);
          }
        }

        // Check caller can manage ALL of the target's active roles
        let canManage = true;
        for (const targetRole of targetRoles) {
          let canManageThis = false;
          // Global admin/ceo check
          if (callerGlobalRole && canManageRole(callerGlobalRole, targetRole.role as AppRole)) {
            canManageThis = true;
          }
          // Brand-specific check
          if (!canManageThis) {
            const callerBrandRole = callerRoleByBrand.get(targetRole.brand_id);
            if (callerBrandRole && canManageRole(callerBrandRole, targetRole.role as AppRole)) {
              canManageThis = true;
            }
          }
          if (!canManageThis) {
            canManage = false;
            break;
          }
        }

        if (!canManage) {
          return new Response(JSON.stringify({ error: "Non sei autorizzato a modificare la password di questo utente" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get the target user's supabase_auth_id
        const { data: targetUser, error: targetUserError } = await adminClient
          .from("users")
          .select("supabase_auth_id")
          .eq("id", target_user_id)
          .single();

        if (targetUserError || !targetUser) {
          return new Response(JSON.stringify({ error: "Utente non trovato" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update password via admin API
        const { error: updateError } = await adminClient.auth.admin.updateUserById(
          targetUser.supabase_auth_id,
          { password: new_password }
        );

        if (updateError) {
          console.error("Error updating password:", updateError);
          return new Response(JSON.stringify({ error: `Errore durante l'aggiornamento: ${updateError.message}` }), {
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
