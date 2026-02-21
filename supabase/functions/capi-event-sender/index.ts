import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// SHA-256 hash for CAPI user data with per-field normalization
// Meta requires: email → lowercase+trim, phone → digits only (E.164 without +),
// names/city → lowercase+trim, zip → trim
async function sha256(value: string, fieldType?: "em" | "ph" | "fn" | "ln" | "ct" | "zp" | "country"): Promise<string> {
  let normalized: string;
  switch (fieldType) {
    case "ph":
      // Phone: strip all non-digits for E.164 format (Meta requirement)
      normalized = value.replace(/[^\d]/g, "");
      break;
    case "em":
      // Email: lowercase + trim
      normalized = value.toLowerCase().trim();
      break;
    case "fn":
    case "ln":
    case "ct":
      // Names/city: lowercase + trim + unicode NFC normalization
      normalized = value.toLowerCase().trim().normalize("NFC");
      break;
    default:
      normalized = value.toLowerCase().trim();
      break;
  }
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
    country: [await sha256("it", "country")],
  };

  if (contact.email) userData.em = [await sha256(contact.email, "em")];
  if (phone) userData.ph = [await sha256(phone, "ph")];
  if (contact.first_name) userData.fn = [await sha256(contact.first_name, "fn")];
  if (contact.last_name) userData.ln = [await sha256(contact.last_name, "ln")];
  if (contact.city) userData.ct = [await sha256(contact.city, "ct")];
  if (contact.cap) userData.zp = [await sha256(contact.cap, "zp")];

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

// H04 FIX: Validate cron secret or verify JWT server-side (not just decode)
async function getAuthMethod(req: Request): Promise<string | null> {
  // 1. Primary: x-cron-secret header — accepts CRON_SECRET or CRON_SECRET_PREVIOUS
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret && cronSecret.length > 0) {
    const current = Deno.env.get("CRON_SECRET");
    const previous = Deno.env.get("CRON_SECRET_PREVIOUS");
    if (current && current.length > 0 && cronSecret === current) {
      return "cron_secret_current";
    }
    if (previous && previous.length > 0 && cronSecret === previous) {
      return "cron_secret_previous";
    }
  }

  // 2. Bearer token: check CRON_ANON_JWT or verify via getClaims
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const cronAnonJwt = Deno.env.get("CRON_ANON_JWT");
    if (cronAnonJwt && token === cronAnonJwt) {
      return "jwt_anon_key";
    }
    try {
      const verifyClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData, error: claimsErr } = await verifyClient.auth.getClaims(token);
      if (!claimsErr && claimsData?.claims) {
        const role = claimsData.claims.role as string;
        if (role === "service_role") return "jwt_service_role";
        if (role === "anon") return "jwt_anon_key";
      }
    } catch {
      // Invalid JWT — fall through
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // H04 FIX: Strict auth validation (now async)
  const authMethod = await getAuthMethod(req);
  if (!authMethod) {
    console.error("[CAPI] Unauthorized: no valid cron secret or service role key");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requestId = crypto.randomUUID();
  // Log auth method only when relevant (non-cron or for audit/debug)
  const logAuthOnSuccess = authMethod !== "cron_secret_current";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const environment = Deno.env.get("ENVIRONMENT") || "development";
  const isProduction = environment === "production";

  try {
    // 0. Auto-DLQ: mark events stuck in processing with exhausted retries
    const { data: dlqCount } = await supabase.rpc("reclaim_stale_capi_events");
    if (dlqCount && dlqCount > 0) {
      console.warn(`[CAPI] ⚠️ Auto-DLQ: ${dlqCount} exhausted events moved to failed`);
    }

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

      if (logAuthOnSuccess) console.log(`[CAPI] No pending events, authorized_via: ${authMethod}`);
      else console.log("[CAPI] No pending events to process");
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

    const logSuffix = (logAuthOnSuccess || results.failed > 0) ? `, authorized_via: ${authMethod}` : "";
    console.log(`[CAPI] Run ${requestId} complete:`, results, logSuffix);

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
