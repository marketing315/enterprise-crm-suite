// Recover stuck meta_lead_events: re-fetch Graph API and create contact/deal/lead_event.
// Admin-only. Use for events that webhook-failed (fetched_payload IS NULL).
import { createClient } from "npm:@supabase/supabase-js@2";
import { getMetaAppAccessToken, resolveMetaPageAccessToken } from "../_shared/meta-secrets.ts";
import { safeJson } from "../_shared/safe-json.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FieldData { name?: string; values?: string[] }
interface LeadData {
  id?: string;
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

async function fetchMetaLeadData(leadgenId: string, formId: string | undefined, token: string) {
  const fields = "created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform";
  const directRes = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?fields=${fields}&access_token=${token}`);
  const directParsed = await safeJson<LeadData>(directRes);
  if (directParsed.ok) return { data: directParsed.data, error: null };

  const safeBody = directParsed.body.slice(0, 500).replace(/access_token=[^&"\s]+/gi, "access_token=***");
  const directError = `Graph API ${directParsed.error} status=${directParsed.status} body=${safeBody}`;
  if (!formId) return { data: null, error: directError };

  const leadsUrl = new URL(`https://graph.facebook.com/v21.0/${formId}/leads`);
  leadsUrl.searchParams.set("fields", `id,${fields}`);
  leadsUrl.searchParams.set("limit", "100");
  leadsUrl.searchParams.set("access_token", token);
  const listRes = await fetch(leadsUrl.toString());
  const listParsed = await safeJson<{ data?: LeadData[] }>(listRes);
  if (listParsed.ok) {
    const matched = listParsed.data?.data?.find((lead) => lead.id === leadgenId) ?? null;
    if (matched) return { data: matched, error: null };
    return { data: null, error: `${directError}; form_leads_lookup: lead_not_found` };
  }
  const listSafeBody = listParsed.body.slice(0, 500).replace(/access_token=[^&"\s]+/gi, "access_token=***");
  return { data: null, error: `${directError}; form_leads_lookup: Graph API ${listParsed.error} status=${listParsed.status} body=${listSafeBody}` };
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

    // body: { brand_id?: string, meta_event_ids?: string[], probe?: { source_id: string, form_id: string, page_id?: string } }
    let body: { brand_id?: string; meta_event_ids?: string[]; probe?: { source_id: string; form_id: string; page_id?: string } } = {};
    try { body = await req.json(); } catch (_) { /* allow empty */ }

    // ---- Diagnostic probe mode ----
    if (body.probe) {
      const { data: app } = await supabase
        .from("meta_apps")
        .select("id, brand_id, page_id, access_token")
        .eq("id", body.probe.source_id)
        .single();
      if (!app) {
        return new Response(JSON.stringify({ error: "app_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const stored = (await getMetaAppAccessToken(supabase, app.id)) ?? app.access_token;
      if (!stored) {
        return new Response(JSON.stringify({ error: "no_token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const pageId = body.probe.page_id || app.page_id;
      const pageTok = await resolveMetaPageAccessToken(stored, pageId);
      const probeOne = async (label: string, url: string, tok: string) => {
        try {
          const u = new URL(url);
          u.searchParams.set("access_token", tok);
          const r = await fetch(u.toString());
          const txt = await r.text();
          const safe = txt.slice(0, 600).replace(/access_token=[^&"\s]+/gi, "access_token=***");
          return { label, status: r.status, body: safe };
        } catch (e) {
          return { label, status: 0, body: e instanceof Error ? e.message : String(e) };
        }
      };
      const formId = body.probe.form_id;
      const checks = [
        await probeOne("token_identity (stored)", "https://graph.facebook.com/v21.0/me?fields=id,name", stored),
        await probeOne("page_visible (stored)", `https://graph.facebook.com/v21.0/${pageId}?fields=id,name,access_token`, stored),
        await probeOne("page_visible (page_token)", `https://graph.facebook.com/v21.0/${pageId}?fields=id,name`, pageTok),
        await probeOne("form_visible (stored)", `https://graph.facebook.com/v21.0/${formId}?fields=id,name,status,leads_count,page`, stored),
        await probeOne("form_visible (page_token)", `https://graph.facebook.com/v21.0/${formId}?fields=id,name,status,leads_count,page`, pageTok),
        await probeOne("form_leads_list (page_token)", `https://graph.facebook.com/v21.0/${formId}/leads?fields=id,created_time&limit=3`, pageTok),
        await probeOne("page_leadgen_forms (page_token)", `https://graph.facebook.com/v21.0/${pageId}/leadgen_forms?fields=id,name,status&limit=10`, pageTok),
      ];
      return new Response(JSON.stringify({ page_id: pageId, form_id: formId, page_token_resolved: pageTok !== stored, checks }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      // Verify caller is admin for this brand (skip when called via INTERNAL_SERVICE_TOKEN)
      if (!isInternal) {
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
      }

      // Load meta_app
      const { data: app, error: appErr } = await supabase
        .from("meta_apps")
        .select("id, brand_id, page_id, access_token")
        .eq("id", ev.source_id)
        .single();
      if (appErr || !app) {
        results.push({ id: ev.id, status: "no_app" });
        continue;
      }

      const storedToken = (await getMetaAppAccessToken(supabase, app.id)) ?? app.access_token;
      if (!storedToken) {
        results.push({ id: ev.id, status: "no_token" });
        continue;
      }
      const token = await resolveMetaPageAccessToken(storedToken, ev.page_id || app.page_id);

      // Graph fetch; some production leads only resolve through the form leads endpoint.
      const fetched = await fetchMetaLeadData(ev.leadgen_id, ev.form_id, token);
      if (!fetched.data) {
        const msg = fetched.error ?? "Graph API unknown_error";
        await supabase.from("meta_lead_events").update({ error: msg }).eq("id", ev.id);
        results.push({ id: ev.id, leadgen_id: ev.leadgen_id, status: "graph_failed", error: msg });
        continue;
      }
      const leadData = fetched.data;
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
