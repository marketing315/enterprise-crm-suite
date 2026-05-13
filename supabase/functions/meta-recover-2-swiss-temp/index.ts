import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

const BRAND_ID = "4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5";
const SOURCE_ID = "d4474a5d-8fd5-4db9-8303-1265f1a86c57";
const PAGE_ID = "103625122097164";
const FORM_ID = "3411906422303840";
const FORM_NAME = "110526 - MODULO";
const CAMPAIGN_ID = "120244978464240783";
const CAMPAIGN_NAME = "Lead generation - 13/04 - 14/04 - Svizzera";
const ADSET_ID = "120244978464190783";
const ADSET_NAME = "Quiz + Modulo";

const LEADS = [
  {
    leadgen_id: "1637716710662561",
    created_time: "2026-05-13T01:20:17-05:00",
    ad_id: "120244978464220783",
    ad_name: "Ginocchio - Video - Ai",
    platform: "ig",
    first_name: "Liliana",
    last_name: "Lo verso",
    email: "lilianaloverso124@gmail.com",
    phone: "+41793451342",
    cap: "6918",
    quiz: "Gambe",
  },
  {
    leadgen_id: "2175957616496043",
    created_time: "2026-05-13T02:49:47-05:00",
    ad_id: "120244978464230783",
    ad_name: "Ginocchio - Video -Samu",
    platform: "fb",
    first_name: "Luana",
    last_name: "Dresti",
    email: "Luana@gmail.ch",
    phone: "+41793311623",
    cap: "6987",
    quiz: "ginocchio",
  },
];

function normalizePhone(phone: string) {
  const raw = phone;
  let normalized = phone.replace(/\D/g, "");
  let countryCode = "IT";
  let assumedCountry = true;
  const prefixes: Record<string, string> = { "39": "IT", "44": "GB", "49": "DE", "33": "FR", "34": "ES", "41": "CH", "43": "AT", "1": "US" };
  for (const [p, c] of Object.entries(prefixes).sort((a, b) => b[0].length - a[0].length)) {
    if (normalized.startsWith(p) && normalized.length > 10) {
      normalized = normalized.slice(p.length); countryCode = c; assumedCountry = false; break;
    }
  }
  return { normalized, countryCode, assumedCountry, raw };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const results: any[] = [];

  for (const L of LEADS) {
    // Check existing lead_event (likely empty shell from failed webhook fetch)
    const { data: existing } = await supabase.from("lead_events").select("id, contact_id").eq("external_id", L.leadgen_id).maybeSingle();
    if (existing && existing.contact_id) { results.push({ leadgen_id: L.leadgen_id, status: "already_complete", lead_event_id: existing.id }); continue; }

    const np = normalizePhone(L.phone);
    const message = `Quiz: ${L.quiz}\nCAP: ${L.cap}`;
    const { data: cId, error: cErr } = await supabase.rpc("find_or_create_contact", {
      p_brand_id: BRAND_ID,
      p_phone_normalized: np.normalized,
      p_phone_raw: np.raw,
      p_country_code: np.countryCode,
      p_assumed_country: np.assumedCountry,
      p_first_name: L.first_name,
      p_last_name: L.last_name,
      p_email: L.email,
      p_city: null,
      p_cap: L.cap,
      p_lead_message: message,
    });
    if (cErr || !cId) { results.push({ leadgen_id: L.leadgen_id, status: "contact_failed", error: cErr?.message }); continue; }
    await supabase.from("contacts").update({ marketing_consent: true }).eq("id", cId);
    const { data: dId } = await supabase.rpc("find_or_create_deal", { p_brand_id: BRAND_ID, p_contact_id: cId });

    // tracking
    await supabase.from("contact_tracking").upsert({
      brand_id: BRAND_ID, contact_id: cId,
      utm_source: "meta", utm_medium: "paid", utm_campaign: CAMPAIGN_NAME,
      first_touch_source: "meta-leads-from-sheet-recover",
      first_touch_at: new Date(L.created_time).toISOString(),
      last_touch_at: new Date().toISOString(),
    }, { onConflict: "contact_id" });

    const field_data = [
      { name: "first_name", values: [L.first_name] },
      { name: "last_name", values: [L.last_name] },
      { name: "email", values: [L.email] },
      { name: "phone_number", values: [L.phone] },
      { name: "zip", values: [L.cap] },
      { name: "quiz", values: [L.quiz] },
    ];

    const raw_payload = {
      meta_leadgen_id: L.leadgen_id, meta_page_id: PAGE_ID, meta_form_id: FORM_ID,
      meta_ad_id: L.ad_id, meta_ad_name: L.ad_name,
      meta_adset_id: ADSET_ID, meta_adset_name: ADSET_NAME,
      meta_campaign_id: CAMPAIGN_ID, meta_campaign_name: CAMPAIGN_NAME,
      platform: L.platform,
      first_name: L.first_name, last_name: L.last_name,
      email: L.email, phone: L.phone, cap: L.cap, quiz: L.quiz,
      field_data,
      recovered: true, recovery_source: "google_sheet_manual",
    };

    let leId: string;
    if (existing) {
      // Enrich the existing empty lead_event
      const { error: upErr } = await supabase.from("lead_events").update({
        contact_id: cId, deal_id: dId ?? null,
        source_name: `Meta: ${CAMPAIGN_NAME}`,
        raw_payload,
      }).eq("id", existing.id);
      if (upErr) { results.push({ leadgen_id: L.leadgen_id, status: "update_failed", error: upErr.message }); continue; }
      leId = existing.id;
    } else {
      const { data: le, error: leErr } = await supabase.from("lead_events").insert({
        brand_id: BRAND_ID, contact_id: cId, deal_id: dId ?? null,
        source: "meta", source_name: `Meta: ${CAMPAIGN_NAME}`,
        external_id: L.leadgen_id,
        occurred_at: new Date(L.created_time).toISOString(),
        raw_payload,
      }).select("id").single();
      if (leErr) { results.push({ leadgen_id: L.leadgen_id, status: "lead_event_failed", error: leErr.message }); continue; }
      leId = le.id;
    }

    // Update existing meta_lead_events row
    await supabase.from("meta_lead_events").update({
      fetched_payload: { field_data, ad_name: L.ad_name, campaign_name: CAMPAIGN_NAME, created_time: L.created_time, platform: L.platform },
      contact_id: cId, lead_event_id: leId,
      status: "ingested", processed_at: new Date().toISOString(),
      error: null,
    }).eq("leadgen_id", L.leadgen_id);

    results.push({ leadgen_id: L.leadgen_id, status: "recovered", contact_id: cId, deal_id: dId, lead_event_id: leId });
  }

  return new Response(JSON.stringify({ results }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
