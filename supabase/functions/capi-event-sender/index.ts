import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// SHA-256 hash for CAPI user data (lowercase, trimmed)
async function sha256(value: string): Promise<string> {
  const normalized = value.toLowerCase().trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Build user_data for CAPI (hashed where required)
async function buildUserData(
  contact: { email?: string | null; first_name?: string | null; last_name?: string | null; city?: string | null; cap?: string | null },
  phone: string | null,
  tracking: { fbp?: string | null; fbc?: string | null; client_ip?: string | null; client_user_agent?: string | null } | null
): Promise<Record<string, any>> {
  const userData: Record<string, any> = {
    country: [await sha256("it")],
  };

  if (contact.email) userData.em = [await sha256(contact.email)];
  if (phone) userData.ph = [await sha256(phone)];
  if (contact.first_name) userData.fn = [await sha256(contact.first_name)];
  if (contact.last_name) userData.ln = [await sha256(contact.last_name)];
  if (contact.city) userData.ct = [await sha256(contact.city)];
  if (contact.cap) userData.zp = [await sha256(contact.cap)];

  if (tracking?.fbp) userData.fbp = tracking.fbp;
  if (tracking?.fbc) userData.fbc = tracking.fbc;
  if (tracking?.client_ip) userData.client_ip_address = tracking.client_ip;
  if (tracking?.client_user_agent) userData.client_user_agent = tracking.client_user_agent;

  return userData;
}

interface CapiEvent {
  id: string;
  brand_id: string;
  meta_app_id: string;
  event_name: string;
  event_id: string;
  event_time: string;
  action_source: string;
  contact_id: string | null;
  deal_id: string | null;
  lead_event_id: string | null;
  custom_data: Record<string, any> | null;
  user_data: Record<string, any> | null;
}

interface MetaApp {
  id: string;
  pixel_id: string;
  capi_token_key: string;
  capi_test_event_code: string | null;
}

interface Contact {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  cap: string | null;
}

interface ContactPhone {
  phone_normalized: string;
  is_primary: boolean;
}

interface Tracking {
  fbp: string | null;
  fbc: string | null;
  client_ip: string | null;
  client_user_agent: string | null;
}

// H06 FIX: Validate cron secret or known project JWT
// pg_cron sends the project anon key (HS256 JWT) as Bearer token.
// We decode and verify the JWT belongs to this Supabase project.
function isAuthorized(req: Request): boolean {
  // 1. Primary: x-cron-secret header
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
    return true;
  }

  // 2. Bearer token: decode JWT and check project ref + role
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        // Extract project ref from URL (e.g., "https://abc123.supabase.co" → "abc123")
        const projectRef = supabaseUrl.replace("https://", "").split(".")[0];

        // Accept JWT if: issued by supabase, matches project ref, has system role
        const isProjectJwt =
          (payload.iss === "supabase" && payload.ref === projectRef) ||
          (payload.iss && projectRef && payload.iss.includes(projectRef));
        const hasSystemRole = payload.role === "anon" || payload.role === "service_role";

        if (isProjectJwt && hasSystemRole) {
          return true;
        }

        // Also accept authenticated user JWTs from this project (for manual testing)
        if (payload.iss && projectRef && payload.iss.includes(projectRef) && payload.role === "authenticated") {
          return true;
        }
      }
    } catch {
      // Invalid JWT format — fall through
    }
  }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // H06 FIX: Strict auth validation
  if (!isAuthorized(req)) {
    console.error("[CAPI] Unauthorized: no valid cron secret or service role key");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requestId = crypto.randomUUID();
  console.log(`[CAPI] Starting run ${requestId}`);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const environment = Deno.env.get("ENVIRONMENT") || "development";
  const isProduction = environment === "production";

  try {
    // 1. Claim events atomically
    const { data: claimedEvents, error: claimError } = await supabase.rpc("claim_capi_events", {
      p_limit: 50,
      p_processing_by: requestId,
    });

    if (claimError) {
      console.error("[CAPI] Claim error:", claimError);
      return new Response(JSON.stringify({ error: "Claim failed", details: claimError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!claimedEvents || claimedEvents.length === 0) {
      // H-GUARD: Check backlog size even when no events claimed (stale processing?)
      const { count: pendingCount } = await supabase
        .from("meta_capi_event_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (pendingCount && pendingCount > 100) {
        console.warn(`[CAPI] ⚠️ Backlog alert: ${pendingCount} pending events in queue`);
      }

      console.log("[CAPI] No pending events to process");
      return new Response(JSON.stringify({ processed: 0, pending_backlog: pendingCount || 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[CAPI] Claimed ${claimedEvents.length} events`);

    // 2. Group events by meta_app_id
    const eventsByMetaApp = new Map<string, CapiEvent[]>();
    for (const event of claimedEvents as CapiEvent[]) {
      if (!eventsByMetaApp.has(event.meta_app_id)) {
        eventsByMetaApp.set(event.meta_app_id, []);
      }
      eventsByMetaApp.get(event.meta_app_id)!.push(event);
    }

    // 3. Fetch meta_apps config
    const metaAppIds = Array.from(eventsByMetaApp.keys());
    const { data: metaApps, error: metaAppsError } = await supabase
      .from("meta_apps")
      .select("id, pixel_id, capi_token_key, capi_test_event_code")
      .in("id", metaAppIds);

    if (metaAppsError || !metaApps) {
      console.error("[CAPI] Failed to fetch meta_apps:", metaAppsError);
      // H07 FIX: Mark all as failed in parallel
      await Promise.all(
        (claimedEvents as CapiEvent[]).map((event) =>
          supabase.rpc("update_capi_event_status", {
            p_event_id: event.id,
            p_status: "failed",
            p_error: "Failed to fetch meta_apps config",
          })
        )
      );
      return new Response(JSON.stringify({ error: "Failed to fetch config" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metaAppMap = new Map<string, MetaApp>();
    for (const app of metaApps as MetaApp[]) {
      metaAppMap.set(app.id, app);
    }

    // 4. Fetch all contacts, phones, tracking IN PARALLEL (H10 FIX)
    const contactIds = [...new Set((claimedEvents as CapiEvent[]).map((e) => e.contact_id).filter(Boolean))] as string[];
    let contactMap = new Map<string, Contact>();
    let phoneMap = new Map<string, string>();
    let trackingMap = new Map<string, Tracking>();

    if (contactIds.length > 0) {
      const [contactsRes, phonesRes, trackingRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, email, first_name, last_name, city, cap")
          .in("id", contactIds),
        supabase
          .from("contact_phones")
          .select("contact_id, phone_normalized, is_primary")
          .in("contact_id", contactIds)
          .eq("is_primary", true),
        supabase
          .from("contact_tracking")
          .select("contact_id, fbp, fbc, client_ip, client_user_agent")
          .in("contact_id", contactIds),
      ]);

      if (contactsRes.data) {
        for (const c of contactsRes.data as Contact[]) {
          contactMap.set(c.id, c);
        }
      }
      if (phonesRes.data) {
        for (const p of phonesRes.data as (ContactPhone & { contact_id: string })[]) {
          phoneMap.set(p.contact_id, p.phone_normalized);
        }
      }
      if (trackingRes.data) {
        for (const t of trackingRes.data as (Tracking & { contact_id: string })[]) {
          trackingMap.set(t.contact_id, t);
        }
      }
    }

    // 5. Process each meta_app batch
    const results: { sent: number; failed: number; skipped: number } = { sent: 0, failed: 0, skipped: 0 };

    for (const [metaAppId, events] of eventsByMetaApp) {
      const metaApp = metaAppMap.get(metaAppId);
      if (!metaApp || !metaApp.pixel_id || !metaApp.capi_token_key) {
        console.error(`[CAPI] Missing config for meta_app ${metaAppId}`);
        // H07 FIX: parallel updates
        await Promise.all(
          events.map((event) =>
            supabase.rpc("update_capi_event_status", {
              p_event_id: event.id,
              p_status: "failed",
              p_error: "Missing pixel_id or capi_token_key",
            })
          )
        );
        results.failed += events.length;
        continue;
      }

      const token = Deno.env.get(metaApp.capi_token_key);
      if (!token) {
        console.error(`[CAPI] Missing token env var: ${metaApp.capi_token_key}`);
        await Promise.all(
          events.map((event) =>
            supabase.rpc("update_capi_event_status", {
              p_event_id: event.id,
              p_status: "failed",
              p_error: `Missing env var: ${metaApp.capi_token_key}`,
            })
          )
        );
        results.failed += events.length;
        continue;
      }

      // Build CAPI payload
      const capiData: any[] = [];

      for (const event of events) {
        const contact = event.contact_id ? contactMap.get(event.contact_id) : null;
        const phone = event.contact_id ? phoneMap.get(event.contact_id) || null : null;
        const tracking = event.contact_id ? trackingMap.get(event.contact_id) || null : null;

        let userData: Record<string, any>;
        if (contact) {
          userData = await buildUserData(contact, phone, tracking);
        } else {
          userData = { country: [await sha256("it")] };
        }

        if (event.user_data?.lead_id) {
          userData.lead_id = event.user_data.lead_id;
        }

        const customData = {
          event_source: "crm",
          lead_event_source: "CRM Gruppo Benessere",
          ...(event.custom_data || {}),
        };

        const eventPayload: Record<string, any> = {
          event_name: event.event_name,
          event_time: Math.floor(new Date(event.event_time).getTime() / 1000),
          event_id: event.event_id,
          action_source: "system_generated",
          user_data: userData,
          custom_data: customData,
        };

        capiData.push(eventPayload);
      }

      const requestBody: Record<string, any> = {
        data: capiData,
        access_token: token,
      };

      if (!isProduction && metaApp.capi_test_event_code) {
        requestBody.test_event_code = metaApp.capi_test_event_code;
        console.log(`[CAPI] Using test_event_code: ${metaApp.capi_test_event_code}`);
      }

      // Send to Meta CAPI
      try {
        console.log(`[CAPI] Sending ${capiData.length} events to pixel ${metaApp.pixel_id}`);

        // H12 FIX: Only log payload in non-production
        if (!isProduction) {
          console.log(`[CAPI] Payload preview:`, JSON.stringify({ data: capiData, test_event_code: requestBody.test_event_code }, null, 2).slice(0, 2000));
        }

        const response = await fetch(
          `https://graph.facebook.com/v24.0/${metaApp.pixel_id}/events`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          }
        );

        const responseText = await response.text();
        console.log(`[CAPI] Response status: ${response.status}, body: ${responseText.slice(0, 500)}`);

        let responseData: any;
        try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

        if (response.ok && responseData.events_received) {
          // H05 FIX: Check partial success
          const received = responseData.events_received;
          const expectedCount = capiData.length;

          if (received < expectedCount) {
            console.warn(`[CAPI] Partial success: Meta received ${received}/${expectedCount} events`);
          }

          // Mark all as sent (Meta doesn't tell us WHICH ones failed in batch)
          // but log the discrepancy for investigation
          await Promise.all(
            events.map((event) =>
              supabase.rpc("update_capi_event_status", {
                p_event_id: event.id,
                p_status: "sent",
                p_error: received < expectedCount
                  ? `Partial: ${received}/${expectedCount} received by Meta`
                  : null,
              })
            )
          );
          results.sent += events.length;
        } else {
          const errorMsg = responseData.error?.message || JSON.stringify(responseData);
          console.error(`[CAPI] Meta API error:`, errorMsg, responseData.error);
          await Promise.all(
            events.map((event) =>
              supabase.rpc("update_capi_event_status", {
                p_event_id: event.id,
                p_status: "failed",
                p_error: errorMsg.slice(0, 500),
              })
            )
          );
          results.failed += events.length;
        }
      } catch (fetchError: any) {
        console.error(`[CAPI] Fetch error:`, fetchError);
        await Promise.all(
          events.map((event) =>
            supabase.rpc("update_capi_event_status", {
              p_event_id: event.id,
              p_status: "failed",
              p_error: fetchError.message?.slice(0, 500) || "Network error",
            })
          )
        );
        results.failed += events.length;
      }
    }

    console.log(`[CAPI] Run ${requestId} complete:`, results);

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[CAPI] Unexpected error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
