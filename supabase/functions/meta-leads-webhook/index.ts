import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

// Phone normalization with country detection
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
    "39": "IT", "44": "GB", "49": "DE", "33": "FR",
    "34": "ES", "41": "CH", "43": "AT", "1": "US",
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
  const expectedSig = signature.slice(7);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computedSig = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(computedSig, expectedSig);
}

// Helper to detect Meta test lead placeholder data
function isTestPlaceholder(value: string | null): boolean {
  return value !== null && value.includes("<test lead:");
}

// Extract field from Meta field_data array
function getField(fieldData: any[], name: string): string | null {
  const field = fieldData.find((f: any) => f.name?.toLowerCase() === name.toLowerCase());
  return field?.values?.[0] || null;
}

// Build combined message from non-standard fields
function buildLeadMessage(fieldData: any[]): string {
  const leadMessage = getField(fieldData, "message") || getField(fieldData, "messaggio") || 
    getField(fieldData, "note") || getField(fieldData, "notes") ||
    getField(fieldData, "additional_info") || getField(fieldData, "informazioni_aggiuntive") || 
    getField(fieldData, "richiesta") || getField(fieldData, "motivo") || 
    getField(fieldData, "descrizione") || getField(fieldData, "problema") || 
    getField(fieldData, "sintomi");

  const standardFields = ['full_name', 'first_name', 'last_name', 'nome', 'cognome', 'email', 'e-mail',
    'phone_number', 'phone', 'city', 'zip', 'postal_code', 'codice_postale'];
  const additionalMessages: string[] = [];
  for (const field of fieldData) {
    const fieldName = field.name?.toLowerCase();
    if (fieldName && !standardFields.includes(fieldName) && field.values?.[0]) {
      const value = field.values[0];
      if (!isTestPlaceholder(value) && value.length > 2) {
        additionalMessages.push(`${field.name}: ${value}`);
      }
    }
  }
  return [leadMessage, ...additionalMessages].filter(Boolean).join('\n');
}

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

async function processLeadChange(
  supabase: any,
  metaApp: MetaAppConfig,
  change: any,
  brandSlug: string,
): Promise<{ leadgen_id: string; status: string; lead_event_id?: string; contact_id?: string | null; deal_id?: string | null }> {
  const leadgenId = change.value?.leadgen_id;
  const pageId = change.value?.page_id;
  const formId = change.value?.form_id;
  const adId = change.value?.ad_id;

  if (!leadgenId) {
    console.warn(`[META-EVENT] Missing leadgen_id in change`);
    return { leadgen_id: "unknown", status: "skipped_no_leadgen_id" };
  }

  // 1. Insert meta_lead_events (dedupe via unique constraint)
  const { data: metaEvent, error: insertError } = await supabase
    .from("meta_lead_events")
    .insert({
      brand_id: metaApp.brand_id,
      source_id: metaApp.id,
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
    if (insertError.code === "23505") {
      console.log(`[META-EVENT] Duplicate leadgen_id=${leadgenId}, skipping`);
      return { leadgen_id: leadgenId, status: "duplicate" };
    }
    console.error(`[META-EVENT] Insert error:`, insertError);
    return { leadgen_id: leadgenId, status: "error" };
  }

  const metaEventId = metaEvent.id;

  // 2. Fetch lead details from Graph API
  let leadData: any = null;
  try {
    const graphUrl = `https://graph.facebook.com/v20.0/${leadgenId}?fields=created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform&access_token=${metaApp.access_token}`;
    const graphRes = await fetch(graphUrl);
    if (graphRes.ok) {
      leadData = await graphRes.json();
      console.log(`[META-EVENT] Graph API OK for ${leadgenId}`);
    } else {
      const errText = await graphRes.text();
      // Redact access_token from error logs
      console.error(`[META-EVENT] Graph API error for ${leadgenId}: status=${graphRes.status}`);
    }
  } catch (graphErr) {
    console.error(`[META-EVENT] Graph API fetch error:`, graphErr);
  }

  // Update meta_lead_events with fetched payload
  if (leadData) {
    const { error: fetchUpdateErr } = await supabase
      .from("meta_lead_events")
      .update({ fetched_payload: leadData, status: "fetched" })
      .eq("id", metaEventId);
    if (fetchUpdateErr) {
      console.error(`[META-EVENT] Failed to update fetched_payload for ${metaEventId}:`, fetchUpdateErr);
    }
  }

  // 3. Extract contact fields
  const fieldData = leadData?.field_data || [];
  const fullName = getField(fieldData, "full_name");
  let firstName = getField(fieldData, "first_name") || getField(fieldData, "nome") || (fullName ? fullName.split(" ")[0] : null);
  let lastName = getField(fieldData, "last_name") || getField(fieldData, "cognome") || (fullName ? fullName.split(" ").slice(1).join(" ") : null);
  let email = getField(fieldData, "email") || getField(fieldData, "e-mail");
  let phone = getField(fieldData, "phone_number") || getField(fieldData, "phone");
  const city = getField(fieldData, "city");
  let cap = getField(fieldData, "zip") || getField(fieldData, "postal_code") || getField(fieldData, "codice_postale");
  const combinedMessage = buildLeadMessage(fieldData);

  // Handle Meta test lead placeholders
  if (isTestPlaceholder(firstName)) firstName = "Test";
  if (isTestPlaceholder(lastName)) lastName = "Meta Lead";
  if (isTestPlaceholder(phone)) {
    const leadSuffix = leadgenId.slice(-6);
    phone = `3331234${leadSuffix}`;
    console.log(`[META-EVENT] Generated synthetic phone for test lead: ${phone}`);
  }
  if (isTestPlaceholder(cap)) cap = "00100";

  // 4. Create/find contact and deal
  let contactId: string | null = null;
  let dealId: string | null = null;

  if (phone) {
    const normalizedPhone = normalizePhone(phone);
    console.log(`[META-EVENT] Normalized phone: ${normalizedPhone.normalized} (${normalizedPhone.countryCode})`);

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
        p_lead_message: combinedMessage || null,
      }
    );

    if (contactError || !contactResult) {
      console.error(`[META-EVENT] Failed to create contact for ${leadgenId}:`, contactError);
    } else {
      contactId = contactResult;
      console.log(`[META-EVENT] Contact: ${contactId}`);

      // Enable marketing consent
      const { error: consentError } = await supabase
        .from("contacts")
        .update({ marketing_consent: true })
        .eq("id", contactId);
      if (consentError) {
        console.error(`[META-EVENT] Failed marketing consent for ${contactId}:`, consentError);
      }

      // Find or create deal
      const { data: dealResult, error: dealError } = await supabase.rpc(
        "find_or_create_deal",
        { p_brand_id: metaApp.brand_id, p_contact_id: contactId }
      );
      if (dealError) {
        console.error(`[META-EVENT] Failed to create deal for ${leadgenId}:`, dealError);
      } else {
        dealId = dealResult;
        console.log(`[META-EVENT] Deal: ${dealId}`);
      }

      // Upsert contact_tracking for CAPI attribution
      try {
        await supabase
          .from("contact_tracking")
          .upsert({
            brand_id: metaApp.brand_id,
            contact_id: contactId,
            utm_source: "meta",
            utm_medium: "paid",
            utm_campaign: leadData?.campaign_name || null,
            first_touch_source: "meta-leads-webhook",
            first_touch_at: new Date().toISOString(),
            last_touch_at: new Date().toISOString(),
          }, { onConflict: "contact_id" });
      } catch (trackingErr) {
        console.error(`[META-EVENT] Tracking error (non-blocking):`, trackingErr);
      }
    }
  } else {
    console.warn(`[META-EVENT] No phone for ${leadgenId}, skipping contact creation`);
  }

  // 5. Create lead_event
  const { data: leadEvent, error: leadEventError } = await supabase
    .from("lead_events")
    .insert({
      brand_id: metaApp.brand_id,
      contact_id: contactId,
      deal_id: dealId,
      source: "meta",
      source_name: `Meta: ${leadData?.campaign_name || leadData?.ad_name || "Lead Ads"}`,
      external_id: leadgenId,
      occurred_at: leadData?.created_time ? new Date(leadData.created_time).toISOString() : new Date().toISOString(),
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
        email, phone, city, cap,
        field_data: fieldData,
        fetched_payload: leadData,
      },
    })
    .select("id")
    .single();

  if (leadEventError) {
    if (leadEventError.code === "23505") {
      console.log(`[META-EVENT] Duplicate lead_event for ${leadgenId}`);
      // Still update meta_lead_events with contact_id even on duplicate
      await supabase.from("meta_lead_events").update({
        contact_id: contactId,
        status: "ingested",
        error: "duplicate_lead_event",
      }).eq("id", metaEventId);
      return { leadgen_id: leadgenId, status: "duplicate_lead_event" };
    }
    console.error(`[META-EVENT] lead_event insert error:`, leadEventError);
    // Mark meta_lead_events as error with details
    await supabase.from("meta_lead_events").update({
      contact_id: contactId,
      status: "error",
      error: `lead_event_insert: ${leadEventError.message || leadEventError.code}`,
    }).eq("id", metaEventId);
    return { leadgen_id: leadgenId, status: "error" };
  }

  // 6. Update meta_lead_events with final linking
  const { error: finalUpdateErr } = await supabase
    .from("meta_lead_events")
    .update({
      lead_event_id: leadEvent.id,
      contact_id: contactId,
      status: "ingested",
      processed_at: new Date().toISOString(),
    })
    .eq("id", metaEventId);

  if (finalUpdateErr) {
    console.error(`[META-EVENT] CRITICAL: Failed to update meta_lead_events ${metaEventId}:`, finalUpdateErr);
  }

  const resultStatus = contactId ? "ingested" : "ingested_no_contact";
  if (!contactId) {
    console.warn(`[META-EVENT] Lead ingested WITHOUT contact for ${leadgenId}`);
  }
  
  console.log(`[META-EVENT] Done: leadgen=${leadgenId}, lead_event=${leadEvent.id}, contact=${contactId}, deal=${dealId}`);
  return { leadgen_id: leadgenId, status: resultStatus, lead_event_id: leadEvent.id, contact_id: contactId, deal_id: dealId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const brandSlug = pathParts[pathParts.length - 1];

  if (!brandSlug || brandSlug === "meta-leads-webhook") {
    console.error("[META] Missing brandSlug in path");
    return new Response(JSON.stringify({ error: "missing_brand_slug" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Find meta app config
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

    // B13 FIX: Redact verify_token from logs
    console.log(`[META-VERIFY] mode=${hubMode}, token=***REDACTED***, challenge=${hubChallenge}`);

    if (hubMode === "subscribe" && hubVerifyToken === metaApp.verify_token) {
      console.log(`[META-VERIFY] Success for ${brandSlug}`);
      return new Response(hubChallenge, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    console.error(`[META-VERIFY] Failed for ${brandSlug}: token mismatch`);
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // ============ POST: Lead Event ============
  if (req.method === "POST") {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256") || "";

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

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;
        try {
          const result = await processLeadChange(supabase, metaApp, change, brandSlug);
          results.push(result);
        } catch (err) {
          console.error(`[META-EVENT] Unhandled error processing change:`, err);
          results.push({ leadgen_id: change.value?.leadgen_id || "unknown", status: "unhandled_error" });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
