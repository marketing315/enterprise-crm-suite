// meta-sheet-reconcile
// ─────────────────────────────────────────────────────────────────────────────
// Hourly cron. Reads MyMed Google Sheet ("Foglio1") and creates lead_events
// for any row whose `id` (Meta leadgen id) is not yet present in lead_events
// for the MyMed brand. Uses Sheet data directly — no Graph API call needed
// (Meta sometimes purges leads quickly, breaking the webhook→fetch flow).
//
// Auth: x-cron-secret OR Bearer service_role JWT OR INTERNAL_SERVICE_TOKEN.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-service-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Hard-coded MyMed sheet (single-brand, single-tab). If we ever extend to
// other brands, externalize to a config table.
const SHEET_ID = "1wuyQpA2r4H94HdW10CYELLetoJWsG-MdknaCdL9z1oA";
const SHEET_RANGE = "Foglio1!A1:Z2000";
const MYMED_BRAND_ID = "4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

interface Norm { normalized: string; countryCode: string; assumedCountry: boolean; raw: string }
function normalizePhone(phone: string, defaultCountry = "IT"): Norm {
  const raw = phone;
  let normalized = phone.replace(/\D/g, "");
  let countryCode = defaultCountry;
  let assumedCountry = true;
  const prefixes: Record<string, string> = {
    "39": "IT", "44": "GB", "49": "DE", "33": "FR", "34": "ES",
    "41": "CH", "43": "AT", "1": "US",
  };
  for (const [p, c] of Object.entries(prefixes).sort((a, b) => b[0].length - a[0].length)) {
    if (normalized.startsWith(p) && normalized.length > 10) {
      normalized = normalized.slice(p.length); countryCode = c; assumedCountry = false; break;
    }
  }
  return { normalized, countryCode, assumedCountry, raw };
}

function strip(prefix: string, v: string | undefined | null): string {
  if (!v) return "";
  return v.startsWith(prefix) ? v.slice(prefix.length) : v;
}

function isPlaceholder(v: string): boolean {
  return v.includes("<test lead:");
}

function authOk(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (cronSecret && provided && provided === cronSecret) return true;

  const internalToken = Deno.env.get("INTERNAL_SERVICE_TOKEN");
  if (internalToken && req.headers.get("x-internal-service-token") === internalToken) return true;

  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (serviceKey && token === serviceKey) return true;
    if (internalToken && token === internalToken) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (level: "log" | "error", msg: string, extra?: Record<string, unknown>) =>
    console[level](JSON.stringify({
      ts: new Date().toISOString(),
      correlation_id: correlationId,
      fn: "meta-sheet-reconcile",
      level, msg, ...extra,
    }));

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authOk(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!GOOGLE_SHEETS_API_KEY) throw new Error("GOOGLE_SHEETS_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Read sheet
    const sheetRes = await fetch(
      `${GATEWAY_URL}/spreadsheets/${SHEET_ID}/values/${SHEET_RANGE}`,
      {
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
        },
      },
    );
    if (!sheetRes.ok) {
      const txt = await sheetRes.text();
      throw new Error(`sheets_read_failed [${sheetRes.status}]: ${txt.slice(0, 300)}`);
    }
    const sheetJson = await sheetRes.json() as { values?: string[][] };
    const rows = sheetJson.values ?? [];
    if (rows.length < 2) {
      return new Response(JSON.stringify({ ok: true, sheet_rows: 0, recovered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const header = rows[0].map((h) => h.toLowerCase().trim());
    const idx = (name: string) => header.indexOf(name);
    const iId = idx("id");
    const iCreated = idx("created_time");
    const iAdId = idx("ad_id");
    const iAdName = idx("ad_name");
    const iAdsetId = idx("adset_id");
    const iAdsetName = idx("adset_name");
    const iCampId = idx("campaign_id");
    const iCampName = idx("campaign_name");
    const iFormId = idx("form_id");
    const iFormName = idx("form_name");
    const iPlatform = idx("platform");
    const iPainArea = idx("in_quali_parti_del_corpo_senti_dolore?");
    const iFirstName = idx("first_name");
    const iLastName = idx("last_name");
    const iEmail = idx("email");
    const iPhone = idx("phone_number");
    const iCap = idx("post_code");

    if (iId < 0) throw new Error("sheet_missing_id_column");

    // Parse rows
    type ParsedRow = {
      leadgenId: string; rawId: string; createdAt: string | null;
      firstName: string | null; lastName: string | null;
      email: string | null; phone: string | null; cap: string | null;
      campaignId: string | null; campaignName: string | null;
      adsetId: string | null; adsetName: string | null;
      adId: string | null; adName: string | null;
      formId: string | null; formName: string | null;
      platform: string | null; painArea: string | null;
    };
    const parsed: ParsedRow[] = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rawId = (row[iId] || "").trim();
      if (!rawId) continue;
      const leadgenId = strip("l:", rawId);
      if (!leadgenId) continue;
      const phoneRaw = strip("p:", row[iPhone] || "");
      const capRaw = strip("z:", row[iCap] || "");
      parsed.push({
        leadgenId, rawId,
        createdAt: row[iCreated] || null,
        firstName: row[iFirstName] || null,
        lastName: row[iLastName] || null,
        email: row[iEmail] || null,
        phone: phoneRaw || null,
        cap: capRaw || null,
        campaignId: strip("c:", row[iCampId] || "") || null,
        campaignName: row[iCampName] || null,
        adsetId: strip("as:", row[iAdsetId] || "") || null,
        adsetName: row[iAdsetName] || null,
        adId: strip("ag:", row[iAdId] || "") || null,
        adName: row[iAdName] || null,
        formId: strip("f:", row[iFormId] || "") || null,
        formName: row[iFormName] || null,
        platform: row[iPlatform] || null,
        painArea: row[iPainArea] || null,
      });
    }

    log("log", "sheet parsed", { rows: parsed.length });

    // 2. Find which leadgen ids are missing from lead_events
    const ids = parsed.map((p) => p.leadgenId);
    const { data: existing, error: exErr } = await supabase
      .from("lead_events")
      .select("external_id")
      .eq("brand_id", MYMED_BRAND_ID)
      .eq("source", "meta")
      .in("external_id", ids);
    if (exErr) throw exErr;
    const existingSet = new Set((existing ?? []).map((e) => e.external_id));
    const missing = parsed.filter((p) => !existingSet.has(p.leadgenId));

    log("log", "missing computed", { sheet: parsed.length, existing: existingSet.size, missing: missing.length });

    // 3. For each missing, create contact + deal + lead_event
    const results: Array<Record<string, unknown>> = [];
    for (const row of missing) {
      // Skip Meta test leads
      if (row.firstName && isPlaceholder(row.firstName)) {
        results.push({ leadgen_id: row.leadgenId, status: "skipped_test_lead" });
        continue;
      }
      if (!row.phone) {
        results.push({ leadgen_id: row.leadgenId, status: "skipped_no_phone" });
        continue;
      }

      try {
        const np = normalizePhone(row.phone);
        const message = row.painArea ? `Pain area: ${row.painArea}` : null;
        const { data: cId, error: cErr } = await supabase.rpc("find_or_create_contact", {
          p_brand_id: MYMED_BRAND_ID,
          p_phone_normalized: np.normalized,
          p_phone_raw: np.raw,
          p_country_code: np.countryCode,
          p_assumed_country: np.assumedCountry,
          p_first_name: row.firstName,
          p_last_name: row.lastName,
          p_email: row.email,
          p_city: null,
          p_cap: row.cap,
          p_lead_message: message,
        });
        if (cErr || !cId) {
          results.push({ leadgen_id: row.leadgenId, status: "contact_failed", error: cErr?.message });
          continue;
        }
        const contactId = cId as string;
        await supabase.from("contacts").update({ marketing_consent: true }).eq("id", contactId);

        const { data: dId } = await supabase.rpc("find_or_create_deal", {
          p_brand_id: MYMED_BRAND_ID, p_contact_id: contactId,
        });
        const dealId = (dId as string) ?? null;

        const occurredAt = row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString();
        const { data: le, error: leErr } = await supabase.from("lead_events").insert({
          brand_id: MYMED_BRAND_ID,
          contact_id: contactId,
          deal_id: dealId,
          source: "meta",
          source_name: `Meta: ${row.campaignName || row.adName || "Lead Ads"}`,
          external_id: row.leadgenId,
          occurred_at: occurredAt,
          raw_payload: {
            meta_leadgen_id: row.leadgenId,
            meta_form_id: row.formId,
            meta_form_name: row.formName,
            meta_ad_id: row.adId,
            meta_ad_name: row.adName,
            meta_adset_id: row.adsetId,
            meta_adset_name: row.adsetName,
            meta_campaign_id: row.campaignId,
            meta_campaign_name: row.campaignName,
            platform: row.platform,
            first_name: row.firstName, last_name: row.lastName,
            email: row.email, phone: row.phone, cap: row.cap,
            pain_area: row.painArea,
            recovered_from: "google_sheet_reconcile",
          },
        }).select("id").single();

        if (leErr) {
          if (leErr.code === "23505") {
            results.push({ leadgen_id: row.leadgenId, status: "duplicate_race", contact_id: contactId });
            continue;
          }
          results.push({ leadgen_id: row.leadgenId, status: "lead_event_failed", error: leErr.message });
          continue;
        }

        results.push({
          leadgen_id: row.leadgenId, status: "recovered",
          contact_id: contactId, deal_id: dealId, lead_event_id: le.id,
        });
      } catch (e) {
        results.push({ leadgen_id: row.leadgenId, status: "exception", error: e instanceof Error ? e.message : String(e) });
      }
    }

    const recovered = results.filter((r) => r.status === "recovered").length;
    log("log", "reconciliation done", {
      sheet: parsed.length, missing: missing.length, recovered,
    });

    return new Response(JSON.stringify({
      ok: true,
      sheet_rows: parsed.length,
      already_present: existingSet.size,
      missing: missing.length,
      recovered,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "fatal", { err: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
