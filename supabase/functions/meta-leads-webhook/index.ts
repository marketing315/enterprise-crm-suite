import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

// Phone normalization with country detection (same as webhook-ingest)
interface NormalizedPhone {
  normalized: string;
  countryCode: string;
  assumedCountry: boolean;
  raw: string;
}

function normalizePhone(phone: string, defaultCountry = "IT"): NormalizedPhone {
  const raw = phone;
  let normalized = phone.replace(/\D/g, "");
  let countryCode = defaultCountry;
  let assumedCountry = true;

  const prefixes: Record<string, string> = {
    "39": "IT",
    "44": "GB",
    "49": "DE",
    "33": "FR",
    "34": "ES",
    "41": "CH",
    "43": "AT",
    "1": "US",
  };

  const sortedPrefixes = Object.entries(prefixes).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [prefix, country] of sortedPrefixes) {
    if (normalized.startsWith(prefix) && normalized.length > 10) {
      normalized = normalized.slice(prefix.length);
      countryCode = country;
      assumedCountry = false;
      break;
    }
  }

  return { normalized, countryCode, assumedCountry, raw };
}

// HMAC-SHA256 signature verification
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !signature.startsWith("sha256=")) {
    return false;
  }
  const expectedSig = signature.slice(7); // Remove "sha256=" prefix
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computedSig = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computedSig === expectedSig;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Expected path: /meta-leads-webhook/:brandSlug
  const brandSlug = pathParts[pathParts.length - 1];

  if (!brandSlug || brandSlug === "meta-leads-webhook") {
    console.error("[META] Missing brandSlug in path");
    return new Response(JSON.stringify({ error: "missing_brand_slug" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Initialize Supabase client with service role
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Define MetaApp type
  interface MetaAppConfig {
    id: string;
    brand_id: string;
    brand_slug: string;
    verify_token: string;
    app_secret: string;
    page_id: string | null;
    access_token: string;
    is_active: boolean;
  }

  // Find meta app config by brand slug
  const { data: metaAppData, error: configError } = await supabase
    .rpc("find_meta_app_by_slug", { p_brand_slug: brandSlug })
    .maybeSingle();

  const metaApp = metaAppData as MetaAppConfig | null;

  if (configError || !metaApp) {
    console.error(`[META] Config not found for slug: ${brandSlug}`, configError);
    return new Response(JSON.stringify({ error: "config_not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!metaApp.is_active) {
    console.error(`[META] Config inactive for slug: ${brandSlug}`);
    return new Response(JSON.stringify({ error: "config_inactive" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ============ GET: Webhook Verification ============
  if (req.method === "GET") {
    const hubMode = url.searchParams.get("hub.mode");
    const hubVerifyToken = url.searchParams.get("hub.verify_token");
    const hubChallenge = url.searchParams.get("hub.challenge");

    console.log(`[META-VERIFY] mode=${hubMode}, token=${hubVerifyToken}, challenge=${hubChallenge}`);

    if (hubMode === "subscribe" && hubVerifyToken === metaApp.verify_token) {
      console.log(`[META-VERIFY] Success for ${brandSlug}`);
      return new Response(hubChallenge, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    console.error(`[META-VERIFY] Failed for ${brandSlug}: token mismatch`);
    return new Response("Forbidden", {
      status: 403,
      headers: corsHeaders,
    });
  }

  // ============ POST: Lead Event ============
  if (req.method === "POST") {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256") || "";

    // Verify signature
    const isValid = await verifySignature(rawBody, signature, metaApp.app_secret);
    if (!isValid) {
      console.error(`[META-EVENT] Invalid signature for ${brandSlug}`);
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error(`[META-EVENT] Invalid JSON for ${brandSlug}`);
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[META-EVENT] Received for ${brandSlug}:`, JSON.stringify(payload));

    const results: any[] = [];

    // Process each entry
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;

        const leadgenId = change.value?.leadgen_id;
        const pageId = change.value?.page_id;
        const formId = change.value?.form_id;
        const adId = change.value?.ad_id;
        const createdTime = change.value?.created_time;

        if (!leadgenId) {
          console.warn(`[META-EVENT] Missing leadgen_id in change`);
          continue;
        }

        // Insert into meta_lead_events for audit (dedupe via unique constraint)
        const { data: metaEvent, error: insertError } = await supabase
          .from("meta_lead_events")
          .insert({
            brand_id: metaApp.brand_id,
            source_id: metaApp.id, // Use meta_apps.id as source_id
            leadgen_id: leadgenId,
            page_id: pageId || metaApp.page_id || "unknown",
            form_id: formId,
            ad_id: adId,
            raw_event: change.value,
            status: "received",
          })
          .select("id")
          .single();

        if (insertError) {
          // Check if duplicate
          if (insertError.code === "23505") {
            console.log(`[META-EVENT] Duplicate leadgen_id=${leadgenId}, skipping`);
            results.push({ leadgen_id: leadgenId, status: "duplicate" });
            continue;
          }
          console.error(`[META-EVENT] Insert error:`, insertError);
          results.push({ leadgen_id: leadgenId, status: "error", error: insertError.message });
          continue;
        }

        // Fetch lead details from Graph API
        let leadData: any = null;
        try {
          const graphUrl = `https://graph.facebook.com/v20.0/${leadgenId}?fields=created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform&access_token=${metaApp.access_token}`;
          const graphRes = await fetch(graphUrl);
          if (graphRes.ok) {
            leadData = await graphRes.json();
            console.log(`[META-EVENT] Graph API response for ${leadgenId}:`, JSON.stringify(leadData));
          } else {
            const errText = await graphRes.text();
            console.error(`[META-EVENT] Graph API error for ${leadgenId}:`, errText);
          }
        } catch (graphErr) {
          console.error(`[META-EVENT] Graph API fetch error:`, graphErr);
        }

        // Update meta_lead_events with fetched payload
        if (leadData) {
          await supabase
            .from("meta_lead_events")
            .update({
              fetched_payload: leadData,
              status: "fetched",
            })
            .eq("id", metaEvent.id);
        }

        // Map lead data to contact fields
        const fieldData = leadData?.field_data || [];
        const getField = (name: string): string | null => {
          const field = fieldData.find((f: any) => f.name?.toLowerCase() === name.toLowerCase());
          return field?.values?.[0] || null;
        };

        const fullName = getField("full_name");
        const firstName = getField("first_name") || (fullName ? fullName.split(" ")[0] : null);
        const lastName = getField("last_name") || (fullName ? fullName.split(" ").slice(1).join(" ") : null);
        const email = getField("email");
        const phone = getField("phone_number");
        const city = getField("city");
        const cap = getField("zip") || getField("postal_code");

        // === Contact & Deal Creation (aligned with webhook-ingest) ===
        let contactId: string | null = null;
        let dealId: string | null = null;

        if (phone) {
          const normalizedPhone = normalizePhone(phone);
          console.log(`[META-EVENT] Normalized phone for ${leadgenId}: ${normalizedPhone.normalized} (country: ${normalizedPhone.countryCode})`);

          // Find or create contact
          const { data: contactResult, error: contactError } = await supabase.rpc(
            "find_or_create_contact",
            {
              p_brand_id: metaApp.brand_id,
              p_phone_normalized: normalizedPhone.normalized,
              p_phone_raw: normalizedPhone.raw,
              p_country_code: normalizedPhone.countryCode,
              p_assumed_country: normalizedPhone.assumedCountry,
              p_first_name: firstName,
              p_last_name: lastName,
              p_email: email,
              p_city: city,
              p_cap: cap,
            }
          );

          if (contactError || !contactResult) {
            console.error(`[META-EVENT] Failed to create contact for ${leadgenId}:`, contactError);
          } else {
            contactId = contactResult;
            console.log(`[META-EVENT] Contact created/found for ${leadgenId}: ${contactId}`);

            // Find or create deal
            const { data: dealResult, error: dealError } = await supabase.rpc(
              "find_or_create_deal",
              { p_brand_id: metaApp.brand_id, p_contact_id: contactId }
            );

            if (dealError) {
              console.error(`[META-EVENT] Failed to create deal for ${leadgenId}:`, dealError);
            } else {
              dealId = dealResult;
              console.log(`[META-EVENT] Deal created/found for ${leadgenId}: ${dealId}`);
            }
          }
        } else {
          console.warn(`[META-EVENT] No phone found for ${leadgenId}, skipping contact creation`);
        }

        // Create lead_event with contact_id and deal_id
        const { data: leadEvent, error: leadEventError } = await supabase
          .from("lead_events")
          .insert({
            brand_id: metaApp.brand_id,
            contact_id: contactId,
            deal_id: dealId,
            source: "webhook",
            source_name: leadData?.campaign_name || leadData?.ad_name || "Meta Lead Ads",
            external_id: leadgenId,
            occurred_at: leadData?.created_time ? new Date(parseInt(leadData.created_time) * 1000).toISOString() : new Date().toISOString(),
            raw_payload: {
              meta_leadgen_id: leadgenId,
              meta_page_id: pageId,
              meta_form_id: formId,
              meta_ad_id: adId,
              meta_campaign_id: leadData?.campaign_id,
              meta_campaign_name: leadData?.campaign_name,
              meta_ad_name: leadData?.ad_name,
              first_name: firstName,
              last_name: lastName,
              email,
              phone,
              city,
              cap,
              field_data: fieldData,
              fetched_payload: leadData,
            },
          })
          .select("id")
          .single();

        if (leadEventError) {
          if (leadEventError.code === "23505") {
            console.log(`[META-EVENT] Duplicate lead_event for ${leadgenId}`);
            results.push({ leadgen_id: leadgenId, status: "duplicate_lead_event" });
          } else {
            console.error(`[META-EVENT] lead_event insert error:`, leadEventError);
            results.push({ leadgen_id: leadgenId, status: "error", error: leadEventError.message });
          }
          continue;
        }

        // Update meta_lead_events with lead_event_id and contact_id
        await supabase
          .from("meta_lead_events")
          .update({
            lead_event_id: leadEvent.id,
            contact_id: contactId,
            status: "ingested",
          })
          .eq("id", metaEvent.id);

        results.push({ 
          leadgen_id: leadgenId, 
          status: "ingested", 
          lead_event_id: leadEvent.id,
          contact_id: contactId,
          deal_id: dealId
        });
        console.log(`[META-EVENT] Ingested leadgen_id=${leadgenId} -> lead_event_id=${leadEvent.id}, contact_id=${contactId}, deal_id=${dealId}`);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: corsHeaders,
  });
});
