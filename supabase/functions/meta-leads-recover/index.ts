// Recover stuck meta_lead_events: re-fetch Graph API and create contact/deal/lead_event.
// Admin-only. Use for events that webhook-failed (fetched_payload IS NULL).
import { createClient } from "npm:@supabase/supabase-js@2";
import { getMetaAppAccessToken } from "../_shared/meta-secrets.ts";
import { safeJson } from "../_shared/safe-json.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FieldData { name?: string; values?: string[] }
interface LeadData {
  created_time?: string;
  field_data?: FieldData[];
  ad_id?: string; ad_name?: string;
  adset_id?: string; adset_name?: string;
  campaign_id?: string; campaign_name?: string;
  form_id?: string; platform?: string;
}

function getField(fd: FieldData[], name: string): string | null {
  return fd.find((f) => f.name?.toLowerCase() === name.toLowerCase())?.values?.[0] || null;
}

function isPlaceholder(v: string | null): boolean {
  return v !== null && v.includes("<test lead:");
}

interface Norm { normalized: string; countryCode: string; assumedCountry: boolean; raw: string }
function normalizePhone(phone: string, defaultCountry = "IT"): Norm {
  const raw = phone;
  let normalized = phone.replace(/\D/g, "");
  let countryCode = defaultCountry;
  let assumedCountry = true;
  const prefixes: Record<string, string> = { "39": "IT", "44": "GB", "49": "DE", "33": "FR", "34": "ES", "41": "CH", "43": "AT", "1": "US" };
  for (const [p, c] of Object.entries(prefixes).sort((a, b) => b[0].length - a[0].length)) {
    if (normalized.startsWith(p) && normalized.length > 10) {
      normalized = normalized.slice(p.length); countryCode = c; assumedCountry = false; break;
    }
  }
  return { normalized, countryCode, assumedCountry, raw };
}

function buildMessage(fd: FieldData[]): string {
  const lm = getField(fd, "message") || getField(fd, "messaggio") || getField(fd, "note") ||
    getField(fd, "richiesta") || getField(fd, "motivo") || getField(fd, "descrizione") || getField(fd, "problema") || getField(fd, "sintomi");
  const std = ['full_name','first_name','last_name','nome','cognome','email','e-mail','phone_number','phone','city','zip','postal_code','codice_postale'];
  const extras: string[] = [];
  for (const f of fd) {
    const n = f.name?.toLowerCase();
    if (n && !std.includes(n) && f.values?.[0] && !isPlaceholder(f.values[0]) && f.values[0].length > 2) {
      extras.push(`${f.name}: ${f.values[0]}`);
    }
  }
  return [lm, ...extras].filter(Boolean).join('\n');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: require admin user OR INTERNAL_SERVICE_TOKEN
    const authHeader = req.headers.get("Authorization") ?? "";
    const internalToken = Deno.env.get("INTERNAL_SERVICE_TOKEN");
    const isInternal = !!internalToken && (
      req.headers.get("x-internal-service-token") === internalToken ||
      authHeader === `Bearer ${internalToken}`
    );

    let internalId: string | null = null;
    if (!isInternal) {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userRes?.user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const r = await supabase.rpc("get_user_id", { p_user_id: userRes.user.id });
      internalId = (r.data as string | null) ?? null;
      if (!internalId) {
        return new Response(JSON.stringify({ error: "no_internal_user" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // body: { brand_id?: string, meta_event_ids?: string[] }
    let body: { brand_id?: string; meta_event_ids?: string[] } = {};
    try { body = await req.json(); } catch (_) { /* allow empty */ }

    // Load stuck events
    let q = supabase.from("meta_lead_events")
      .select("id, brand_id, source_id, leadgen_id, page_id, form_id, ad_id, raw_event")
      .is("fetched_payload", null);
    if (body.meta_event_ids?.length) q = q.in("id", body.meta_event_ids);
    if (body.brand_id) q = q.eq("brand_id", body.brand_id);
    q = q.limit(50);
    const { data: events, error: evErr } = await q;
    if (evErr) throw evErr;

    const results: Array<Record<string, unknown>> = [];

    for (const ev of events ?? []) {
      // Verify caller is admin for this brand
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: internalId, _role: "admin", _brand_id: ev.brand_id,
      });
      const { data: isCeo } = await supabase.rpc("has_role", {
        _user_id: internalId, _role: "ceo", _brand_id: ev.brand_id,
      }).catch(() => ({ data: false }));
      if (!isAdmin && !isCeo) {
        results.push({ id: ev.id, status: "forbidden" });
        continue;
      }

      // Load meta_app
      const { data: app, error: appErr } = await supabase
        .from("meta_apps")
        .select("id, brand_id, access_token")
        .eq("id", ev.source_id)
        .single();
      if (appErr || !app) {
        results.push({ id: ev.id, status: "no_app" });
        continue;
      }

      const token = (await getMetaAppAccessToken(supabase, app.id)) ?? app.access_token;
      if (!token) {
        results.push({ id: ev.id, status: "no_token" });
        continue;
      }

      // Graph fetch
      const url = `https://graph.facebook.com/v20.0/${ev.leadgen_id}?fields=created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform&access_token=${token}`;
      const res = await fetch(url);
      const parsed = await safeJson<LeadData>(res);
      if (!parsed.ok) {
        const safeBody = parsed.body.slice(0, 500).replace(/access_token=[^&"\s]+/gi, "access_token=***");
        const msg = `Graph API ${parsed.error} status=${parsed.status} body=${safeBody}`;
        await supabase.from("meta_lead_events").update({ error: msg }).eq("id", ev.id);
        results.push({ id: ev.id, leadgen_id: ev.leadgen_id, status: "graph_failed", error: msg });
        continue;
      }
      const leadData = parsed.data!;
      await supabase.from("meta_lead_events")
        .update({ fetched_payload: leadData, status: "fetched", error: null })
        .eq("id", ev.id);

      const fd = leadData.field_data || [];
      const fullName = getField(fd, "full_name");
      let firstName = getField(fd, "first_name") || getField(fd, "nome") || (fullName ? fullName.split(" ")[0] : null);
      let lastName = getField(fd, "last_name") || getField(fd, "cognome") || (fullName ? fullName.split(" ").slice(1).join(" ") : null);
      const email = getField(fd, "email") || getField(fd, "e-mail");
      let phone = getField(fd, "phone_number") || getField(fd, "phone");
      const city = getField(fd, "city");
      let cap = getField(fd, "zip") || getField(fd, "postal_code") || getField(fd, "codice_postale");
      const combined = buildMessage(fd);

      if (isPlaceholder(firstName)) firstName = "Test";
      if (isPlaceholder(lastName)) lastName = "Meta Lead";
      if (isPlaceholder(phone)) {
        const suf = (ev.leadgen_id.slice(-9) || "000000000").padStart(9, "0");
        phone = `+39000${suf}`;
      }
      if (isPlaceholder(cap)) cap = "00100";

      let contactId: string | null = null;
      let dealId: string | null = null;

      if (phone) {
        const np = normalizePhone(phone);
        const { data: cId, error: cErr } = await supabase.rpc("find_or_create_contact", {
          p_brand_id: ev.brand_id,
          p_phone_normalized: np.normalized,
          p_phone_raw: np.raw,
          p_country_code: np.countryCode,
          p_assumed_country: np.assumedCountry,
          p_first_name: firstName,
          p_last_name: lastName,
          p_email: email,
          p_city: city,
          p_cap: cap,
          p_lead_message: combined || null,
        });
        if (cErr || !cId) {
          await supabase.from("meta_lead_events").update({
            status: "error", error: `find_or_create_contact: ${cErr?.message ?? "empty"}`,
          }).eq("id", ev.id);
          results.push({ id: ev.id, leadgen_id: ev.leadgen_id, status: "contact_failed", error: cErr?.message });
          continue;
        }
        contactId = cId as string;
        await supabase.from("contacts").update({ marketing_consent: true }).eq("id", contactId);
        const { data: dId } = await supabase.rpc("find_or_create_deal", {
          p_brand_id: ev.brand_id, p_contact_id: contactId,
        });
        dealId = (dId as string) ?? null;
        try {
          await supabase.from("contact_tracking").upsert({
            brand_id: ev.brand_id,
            contact_id: contactId,
            utm_source: "meta",
            utm_medium: "paid",
            utm_campaign: leadData.campaign_name || null,
            first_touch_source: "meta-leads-recover",
            first_touch_at: new Date().toISOString(),
            last_touch_at: new Date().toISOString(),
          }, { onConflict: "contact_id" });
        } catch (_) { /* non-blocking */ }
      }

      // Insert lead_event
      const { data: le, error: leErr } = await supabase.from("lead_events").insert({
        brand_id: ev.brand_id,
        contact_id: contactId,
        deal_id: dealId,
        source: "meta",
        source_name: `Meta: ${leadData.campaign_name || leadData.ad_name || "Lead Ads"}`,
        external_id: ev.leadgen_id,
        occurred_at: leadData.created_time ? new Date(leadData.created_time).toISOString() : new Date().toISOString(),
        raw_payload: {
          meta_leadgen_id: ev.leadgen_id,
          meta_page_id: ev.page_id,
          meta_form_id: ev.form_id,
          meta_ad_id: ev.ad_id,
          meta_campaign_id: leadData.campaign_id,
          meta_campaign_name: leadData.campaign_name,
          meta_ad_name: leadData.ad_name,
          first_name: firstName, last_name: lastName,
          email, phone, city, cap,
          field_data: fd,
          fetched_payload: leadData,
          recovered: true,
        },
      }).select("id").single();

      if (leErr) {
        if (leErr.code === "23505") {
          await supabase.from("meta_lead_events").update({
            contact_id: contactId, status: "ingested", error: "duplicate_lead_event",
          }).eq("id", ev.id);
          results.push({ id: ev.id, leadgen_id: ev.leadgen_id, status: "duplicate_lead_event", contact_id: contactId });
          continue;
        }
        await supabase.from("meta_lead_events").update({
          contact_id: contactId, status: "error", error: `lead_event_insert: ${leErr.message}`,
        }).eq("id", ev.id);
        results.push({ id: ev.id, leadgen_id: ev.leadgen_id, status: "lead_event_failed", error: leErr.message });
        continue;
      }

      await supabase.from("meta_lead_events").update({
        lead_event_id: le.id, contact_id: contactId,
        status: "ingested", processed_at: new Date().toISOString(),
        error: null,
      }).eq("id", ev.id);

      results.push({
        id: ev.id, leadgen_id: ev.leadgen_id, status: "recovered",
        contact_id: contactId, deal_id: dealId, lead_event_id: le.id,
      });
    }

    return new Response(JSON.stringify({ recovered: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[meta-leads-recover] fatal", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
