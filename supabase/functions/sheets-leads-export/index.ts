import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============ Google Sheets API Helpers ============

async function getAccessToken(serviceAccountKey: string): Promise<string> {
  let rawJson = serviceAccountKey;
  try {
    JSON.parse(rawJson);
  } catch {
    rawJson = new TextDecoder().decode(Uint8Array.from(atob(serviceAccountKey), c => c.charCodeAt(0)));
  }
  const key = JSON.parse(rawJson);

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const pemContents = key.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(unsignedToken));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${unsignedToken}.${signatureB64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

async function getSheetInfo(accessToken: string, spreadsheetId: string) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.json();
}

async function createTab(accessToken: string, spreadsheetId: string, title: string): Promise<number> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
    }
  );
  const result = await response.json();
  return result.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
}

async function clearSheet(accessToken: string, spreadsheetId: string, tabName: string): Promise<void> {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}:clear`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    }
  );
}

async function writeRange(
  accessToken: string, spreadsheetId: string, range: string,
  values: string[][], inputOption: "RAW" | "USER_ENTERED" = "RAW"
): Promise<void> {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${inputOption}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );
}

async function appendRows(
  accessToken: string, spreadsheetId: string, tabName: string, values: string[][]
): Promise<void> {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName + "!A:X")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );
}

async function applyFormatting(accessToken: string, spreadsheetId: string, sheetId: number, columnCount: number): Promise<void> {
  const requests = [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      setBasicFilter: {
        filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: columnCount } },
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            backgroundColor: { red: 0.2, green: 0.4, blue: 0.6 },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)",
      },
    },
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: columnCount },
      },
    },
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  );
}

// ============ Constants ============

export const LEADS_HEADERS = [
  "Data e Ora", "Brand", "Nome", "Cognome", "Numero", "Email",
  "Campagna", "Fonte", "AdSet",
  "Motivo", "Messaggio",
  "CAP", "Città", "Provincia",
  "Tag", "Note",
  "Appuntamento Status", "Appuntamento Data", "Appuntamento Orario",
  "Appuntamento Via", "Appuntamento Civico", "Appuntamento Città", "Appuntamento CAP",
  "Fase Pipeline",
];

const TAB_NAME = "LEADS";

/** Index of the "Numero" (phone) column in LEADS_HEADERS. Tests pin this to column E (index 4). */
export const PHONE_COLUMN_INDEX = LEADS_HEADERS.indexOf("Numero");

/**
 * Build the contact_id → phone_normalized map.
 * Prefers `is_primary === true`, falls back to any non-empty phone for the contact.
 * Exported for unit tests (chunking / no-primary / missing-phone scenarios).
 */
export function buildPhoneMap(rows: Array<{ contact_id: string; phone_normalized: string | null; is_primary: boolean | null }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of rows) {
    if (p.is_primary && p.phone_normalized) map.set(p.contact_id, p.phone_normalized);
  }
  for (const p of rows) {
    if (!map.has(p.contact_id) && p.phone_normalized) map.set(p.contact_id, p.phone_normalized);
  }
  return map;
}

// ============ Data Helpers ============

function formatQuizAnswers(qa: Record<string, any>): string {
  return Object.entries(qa)
    .filter(([_, v]) => v !== null && v !== undefined && v !== "")
    .map(([q, a]) => `${q}: ${Array.isArray(a) ? a.join(", ") : a}`)
    .join(" | ");
}

function extractStreetNumber(address: string | null): { street: string; number: string } {
  if (!address) return { street: "", number: "" };
  const match = address.match(/^(.+?)[,\s]+(?:n\.?\s*)?(\d+\s*\/?[a-zA-Z]?)$/);
  if (match) return { street: match[1].trim(), number: match[2].trim() };
  return { street: address, number: "" };
}

export function buildRow(event: any, contact: any, brandName: string, phone: string, tags: string, appt: any, pipelineStageName?: string): string[] {
  const payload = (event.raw_payload || {}) as Record<string, any>;
  const { street, number: civico } = extractStreetNumber(appt?.address || null);

  let apptDate = "";
  let apptTime = "";
  if (appt?.scheduled_at) {
    const d = new Date(appt.scheduled_at);
    apptDate = d.toISOString().split("T")[0];
    apptTime = d.toISOString().split("T")[1]?.substring(0, 5) || "";
  }

  return [
    event.received_at ? new Date(event.received_at).toISOString().replace("T", " ").substring(0, 16) : "",
    brandName,
    contact?.first_name || "",
    contact?.last_name || "",
    phone,
    contact?.email || "",
    payload.campaign || payload.campaign_name || payload.meta_campaign_name || payload.utm_campaign || "",
    event.source_name || "",
    payload.adset || payload.adset_name || payload.meta_adset_name || "",
    contact?.lead_reason || "",
    [contact?.lead_message, contact?.quiz_answers ? formatQuizAnswers(contact.quiz_answers) : ""].filter(Boolean).join(" | ") || "",
    contact?.cap || "",
    contact?.city || "",
    contact?.province || "",
    tags,
    contact?.notes || "",
    appt?.status || "",
    apptDate,
    apptTime,
    street,
    civico,
    appt?.city || "",
    appt?.cap || "",
    pipelineStageName || "",
  ];
}

// ============ Fetch single lead ============

async function fetchSingleLeadRow(
  supabaseAdmin: any,
  leadEventId: string,
): Promise<string[] | null> {
  const { data: event, error } = await supabaseAdmin
    .from("lead_events")
    .select(`
      id, received_at, source_name, raw_payload, contact_id, brand_id,
      contacts(first_name, last_name, email, phone_normalized, lead_reason, lead_message, quiz_answers, cap, city, province, notes),
      brands(name)
    `)
    .eq("id", leadEventId)
    .single();

  if (error || !event) {
    console.error("Error fetching lead_event:", error);
    return null;
  }

  const ev = event as any;
  const contactId = ev.contact_id as string;
  const contact = ev.contacts as any;
  const brandName = (ev.brands as any)?.name || "";

  // Fetch phone, tags, appointment in parallel
  const [phonesRes, tagsRes, apptsRes, stageRes] = await Promise.all([
    contactId
      ? supabaseAdmin.from("contact_phones").select("phone_normalized").eq("contact_id", contactId).eq("is_primary", true).limit(1)
      : Promise.resolve({ data: [] }),
    contactId
      ? supabaseAdmin.from("tag_assignments").select("tags(name)").eq("entity_type", "contact").eq("entity_id", contactId)
      : Promise.resolve({ data: [] }),
    contactId
      ? supabaseAdmin.from("appointments").select("status, scheduled_at, address, city, cap").eq("contact_id", contactId).order("scheduled_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] }),
    contactId
      ? supabaseAdmin.from("deals").select("current_stage_id, pipeline_stages(name)").eq("contact_id", contactId).eq("status", "open").order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] }),
  ]);

  const phone = (phonesRes.data as any)?.[0]?.phone_normalized || contact?.phone_normalized || "";
  const tags = (tagsRes.data as any[] || []).map((t: any) => t.tags?.name).filter(Boolean).join(", ");
  const appt = (apptsRes.data as any[])?.[0] || null;
  const pipelineStageName = (stageRes.data as any[])?.[0]?.pipeline_stages?.name || "";

  return buildRow(event, contact, brandName, phone, tags, appt, pipelineStageName);
}

// ============ Fetch all leads (full export) ============

async function fetchAllLeadsRows(
  supabaseAdmin: any,
  dateFrom: string | null,
  dateTo: string | null,
): Promise<string[][]> {
  const events: any[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    let query = supabaseAdmin
      .from("lead_events")
      .select(`
        id, received_at, source_name, raw_payload, contact_id, brand_id,
        contacts(first_name, last_name, email, phone_normalized, lead_reason, lead_message, quiz_answers, cap, city, province, notes),
        brands(name)
      `)
      .order("received_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (dateFrom) query = query.gte("received_at", dateFrom);
    if (dateTo) query = query.lte("received_at", dateTo + "T23:59:59");

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    events.push(...data);
    if (data.length < pageSize) break;
  }

  if (!events.length) return [];

  const contactIds = [...new Set(events.map(e => e.contact_id).filter(Boolean))] as string[];

  // Chunk IN() queries to avoid URL length limits (with 1000+ IDs the URL exceeds 30KB and the request fails silently)
  const CHUNK = 200;
  const chunks: string[][] = [];
  for (let i = 0; i < contactIds.length; i += CHUNK) chunks.push(contactIds.slice(i, i + CHUNK));

  const phonesData: any[] = [];
  const tagsData: any[] = [];
  const apptsData: any[] = [];
  const dealsData: any[] = [];
  for (const ids of chunks) {
    const [pRes, tRes, aRes, dRes] = await Promise.all([
      supabaseAdmin.from("contact_phones").select("contact_id, phone_normalized, is_primary").in("contact_id", ids),
      supabaseAdmin.from("tag_assignments").select("entity_id, tags(name)").eq("entity_type", "contact").in("entity_id", ids),
      supabaseAdmin.from("appointments").select("contact_id, status, scheduled_at, address, city, cap").in("contact_id", ids).order("scheduled_at", { ascending: false }),
      supabaseAdmin.from("deals").select("contact_id, current_stage_id, pipeline_stages(name)").in("contact_id", ids).eq("status", "open").order("created_at", { ascending: false }),
    ]);
    if (pRes.error) console.error("phones chunk error:", pRes.error);
    if (tRes.error) console.error("tags chunk error:", tRes.error);
    if (aRes.error) console.error("appts chunk error:", aRes.error);
    if (dRes.error) console.error("deals chunk error:", dRes.error);
    phonesData.push(...(pRes.data || []));
    tagsData.push(...(tRes.data || []));
    apptsData.push(...(aRes.data || []));
    dealsData.push(...(dRes.data || []));
  }

  const phoneMap = buildPhoneMap(phonesData);

  const tagMap = new Map<string, string[]>();
  tagsData.forEach((ta: any) => {
    const list = tagMap.get(ta.entity_id) || [];
    if (ta.tags?.name) list.push(ta.tags.name);
    tagMap.set(ta.entity_id, list);
  });

  const apptMap = new Map<string, any>();
  apptsData.forEach((a: any) => {
    if (!apptMap.has(a.contact_id)) apptMap.set(a.contact_id, a);
  });

  const stageMap = new Map<string, string>();
  dealsData.forEach((d: any) => {
    if (!stageMap.has(d.contact_id) && d.pipeline_stages?.name) {
      stageMap.set(d.contact_id, d.pipeline_stages.name);
    }
  });

  return events.map(event => {
    const c = event.contacts as any;
    const contactId = event.contact_id as string;
    return buildRow(
      event, c, (event.brands as any)?.name || "",
      phoneMap.get(contactId) || c?.phone_normalized || "",
      tagMap.get(contactId)?.join(", ") || "",
      apptMap.get(contactId) || null,
      stageMap.get(contactId) || "",
    );
  });
}

// ============ Ensure sheet setup ============

async function ensureLeadsTab(accessToken: string, spreadsheetId: string): Promise<number> {
  const sheetInfo = await getSheetInfo(accessToken, spreadsheetId);
  const allSheets = sheetInfo.sheets || [];
  const existing = allSheets.find((s: any) => s.properties.title === TAB_NAME);

  if (existing) return existing.properties.sheetId;

  // Create LEADS tab, delete others
  const sheetId = await createTab(accessToken, spreadsheetId, TAB_NAME);
  const deleteRequests = allSheets.map((s: any) => ({ deleteSheet: { sheetId: s.properties.sheetId } }));
  if (deleteRequests.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: deleteRequests }),
      }
    );
  }
  await writeRange(accessToken, spreadsheetId, `${TAB_NAME}!A1:X1`, [LEADS_HEADERS]);
  await applyFormatting(accessToken, spreadsheetId, sheetId, LEADS_HEADERS.length);
  return sheetId;
}

// ============ Main Handler ============

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { date_from, date_to, lead_event_id, verify_phones } = body as {
      date_from?: string;
      date_to?: string;
      lead_event_id?: string;
      verify_phones?: boolean;
    };

    const spreadsheetId = Deno.env.get("GOOGLE_SHEETS_FILE_ID");
    const serviceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");

    if (!spreadsheetId || !serviceAccountKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Google Sheets not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getAccessToken(serviceAccountKey);

    // ---- VERIFY MODE: read column E (Numero) and report fill ratio ----
    if (verify_phones) {
      const resp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!E2:E10000`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await resp.json();
      const values: string[][] = data.values || [];
      const total = values.length;
      const filled = values.filter(r => (r[0] || "").trim() !== "").length;
      const samples = values.slice(0, 5).map(r => r[0] || "");
      const lastSamples = values.slice(-5).map(r => r[0] || "");
      return new Response(
        JSON.stringify({ success: true, total_rows: total, with_phone: filled, empty: total - filled, first5: samples, last5: lastSamples }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- APPEND MODE: single lead ----
    if (lead_event_id) {
      await ensureLeadsTab(accessToken, spreadsheetId);
      const row = await fetchSingleLeadRow(supabaseAdmin, lead_event_id);
      if (row) {
        await appendRows(accessToken, spreadsheetId, TAB_NAME, [row]);
      }
      return new Response(
        JSON.stringify({ success: true, rows_exported: row ? 1 : 0, mode: "append" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- FULL MODE: rewrite everything in chronological order ----
    const logBrandId = "00000000-0000-0000-0000-000000000000";
    const logId = await logExport(supabaseAdmin, logBrandId, "processing", 0);

    const sheetId = await ensureLeadsTab(accessToken, spreadsheetId);
    await clearSheet(accessToken, spreadsheetId, TAB_NAME);
    await writeRange(accessToken, spreadsheetId, `${TAB_NAME}!A1:X1`, [LEADS_HEADERS]);
    await applyFormatting(accessToken, spreadsheetId, sheetId, LEADS_HEADERS.length);

    const rows = await fetchAllLeadsRows(supabaseAdmin, date_from || null, date_to || null);

    if (rows.length > 0) {
      const BATCH_SIZE = 1000;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const startRow = i + 2;
        const endRow = startRow + batch.length - 1;
        await writeRange(accessToken, spreadsheetId, `${TAB_NAME}!A${startRow}:X${endRow}`, batch);
      }
    }

    await updateLog(supabaseAdmin, logId, "success", rows.length);

    return new Response(
      JSON.stringify({ success: true, rows_exported: rows.length, mode: "full" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sheets-leads-export error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============ Logging ============

async function logExport(
  supabaseAdmin: any,
  brandId: string,
  status: "processing" | "success" | "failed",
  rowsExported: number,
  error?: string
): Promise<string> {
  const { data } = await supabaseAdmin
    .from("sheets_export_logs")
    .insert({ brand_id: brandId, tab_name: "LEADS", status, rows_exported: rowsExported, error: error || null })
    .select("id")
    .single();
  return data?.id || "";
}

async function updateLog(
  supabaseAdmin: any,
  logId: string,
  status: "success" | "failed",
  rowsExported: number,
  error?: string
): Promise<void> {
  await supabaseAdmin
    .from("sheets_export_logs")
    .update({ status, rows_exported: rowsExported, error: error || null })
    .eq("id", logId);
}
