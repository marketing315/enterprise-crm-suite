import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(phone: string) {
  const raw = phone;
  let normalized = phone.replace(/\D/g, "");
  let countryCode = "IT";
  let assumedCountry = true;
  const prefixes: Record<string, string> = { "39": "IT", "44": "GB", "49": "DE", "33": "FR", "34": "ES", "41": "CH", "43": "AT", "1": "US" };
  for (const [prefix, country] of Object.entries(prefixes).sort((a, b) => b[0].length - a[0].length)) {
    if (normalized.startsWith(prefix) && normalized.length > 10) {
      normalized = normalized.slice(prefix.length);
      countryCode = country;
      assumedCountry = false;
      break;
    }
  }
  return { normalized, countryCode, assumedCountry, raw };
}

function getField(fieldData: any[], name: string): string | null {
  const field = fieldData.find((f: any) => f.name?.toLowerCase() === name.toLowerCase());
  return field?.values?.[0] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Auth check
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const brandId = "2dc052de-26b5-48ef-8dee-917ea591a681";

  // Get all error events with fetched_payload
  const { data: errorEvents, error: fetchErr } = await supabase
    .from("meta_lead_events")
    .select("*")
    .eq("brand_id", brandId)
    .eq("status", "error")
    .order("received_at", { ascending: true });

  if (fetchErr) return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers: corsHeaders });

  const results: any[] = [];

  for (const evt of errorEvents || []) {
    const leadgenId = evt.leadgen_id;
    const leadData = evt.fetched_payload as any;
    if (!leadData?.field_data) {
      results.push({ leadgen_id: leadgenId, status: "skipped_no_data" });
      continue;
    }

    const fieldData = leadData.field_data;
    const firstName = getField(fieldData, "nome") || getField(fieldData, "first_name");
    const lastName = getField(fieldData, "cognome") || getField(fieldData, "last_name");
    const email = getField(fieldData, "e-mail") || getField(fieldData, "email");
    const phone = getField(fieldData, "phone") || getField(fieldData, "phone_number");
    const city = getField(fieldData, "city");
    const cap = getField(fieldData, "codice_postale") || getField(fieldData, "zip");

    // Build message from extra fields
    const standardFields = ['full_name', 'first_name', 'last_name', 'nome', 'cognome', 'email', 'e-mail', 'phone_number', 'phone', 'city', 'zip', 'postal_code', 'codice_postale'];
    const extraMessages: string[] = [];
    for (const field of fieldData) {
      const fn = field.name?.toLowerCase();
      if (fn && !standardFields.includes(fn) && field.values?.[0]) {
        extraMessages.push(`${field.name}: ${field.values[0]}`);
      }
    }
    const combinedMessage = extraMessages.join('\n') || null;

    let contactId: string | null = null;
    let dealId: string | null = null;

    if (phone) {
      const np = normalizePhone(phone);
      console.log(`[REPROCESS] ${leadgenId}: ${firstName} ${lastName}, phone=${np.normalized}`);

      const { data: cResult, error: cErr } = await supabase.rpc("find_or_create_contact", {
        p_brand_id: brandId,
        p_phone_normalized: np.normalized,
        p_phone_raw: np.raw,
        p_country_code: np.countryCode,
        p_assumed_country: np.assumedCountry,
        p_first_name: firstName,
        p_last_name: lastName,
        p_email: email,
        p_city: city,
        p_cap: cap,
        p_lead_message: combinedMessage,
      });

      if (cErr) {
        console.error(`[REPROCESS] Contact error for ${leadgenId}:`, cErr);
        results.push({ leadgen_id: leadgenId, status: "contact_error", error: cErr.message });
        continue;
      }
      contactId = cResult;

      // Set marketing consent
      await supabase.from("contacts").update({ marketing_consent: true }).eq("id", contactId);

      // Find or create deal
      const { data: dResult } = await supabase.rpc("find_or_create_deal", { p_brand_id: brandId, p_contact_id: contactId });
      dealId = dResult;
    }

    // Create lead_event
    const { data: le, error: leErr } = await supabase.from("lead_events").insert({
      brand_id: brandId,
      contact_id: contactId,
      deal_id: dealId,
      source: "meta",
      source_name: `Meta: ${leadData.campaign_name || leadData.ad_name || "Lead Ads"}`,
      external_id: leadgenId,
      occurred_at: leadData.created_time ? new Date(leadData.created_time).toISOString() : new Date().toISOString(),
      raw_payload: {
        meta_leadgen_id: leadgenId,
        meta_page_id: evt.page_id,
        meta_form_id: evt.form_id,
        meta_ad_id: evt.ad_id,
        meta_campaign_id: leadData.campaign_id,
        meta_campaign_name: leadData.campaign_name,
        first_name: firstName, last_name: lastName,
        email, phone, city, cap,
        field_data: fieldData,
        reprocessed: true,
      },
    }).select("id").single();

    if (leErr) {
      console.error(`[REPROCESS] lead_event error for ${leadgenId}:`, leErr);
      // Update meta_lead_events anyway
      await supabase.from("meta_lead_events").update({
        contact_id: contactId,
        status: leErr.code === "23505" ? "ingested" : "error",
        error: leErr.code === "23505" ? "duplicate_lead_event_reprocess" : `reprocess: ${leErr.message}`,
      }).eq("id", evt.id);
      results.push({ leadgen_id: leadgenId, status: leErr.code === "23505" ? "duplicate" : "lead_event_error" });
      continue;
    }

    // Update meta_lead_events
    await supabase.from("meta_lead_events").update({
      lead_event_id: le.id,
      contact_id: contactId,
      status: "ingested",
      processed_at: new Date().toISOString(),
      error: null,
    }).eq("id", evt.id);

    // Tracking
    if (contactId) {
      await supabase.from("contact_tracking").upsert({
        brand_id: brandId, contact_id: contactId,
        utm_source: "meta", utm_medium: "paid",
        utm_campaign: leadData.campaign_name || null,
        first_touch_source: "meta-leads-webhook",
        first_touch_at: new Date().toISOString(),
        last_touch_at: new Date().toISOString(),
      }, { onConflict: "contact_id" });
    }

    results.push({ leadgen_id: leadgenId, status: "reprocessed", contact_id: contactId, deal_id: dealId, lead_event_id: le.id });
    console.log(`[REPROCESS] OK: ${leadgenId} → contact=${contactId}, deal=${dealId}`);
  }

  return new Response(JSON.stringify({ total: results.length, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
