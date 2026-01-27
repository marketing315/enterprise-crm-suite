import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface LeadEventRow {
  id: string;
  brand_id: string;
  contact_id: string | null;
  source: string;
  source_name: string | null;
  raw_payload: Record<string, unknown>;
  occurred_at: string;
  received_at: string;
  ai_priority: number | null;
  archived: boolean;
}

interface ContactInfo {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  city: string | null;
}

interface PhoneInfo {
  phone_normalized: string;
}

// Italian headers for C-level presentation
const HEADERS_ITA = [
  "Timestamp",
  "Brand",
  "Fonte",
  "Nome",
  "Cognome",
  "Telefono",
  "Email",
  "Città",
  "Messaggio",
  "Campagna",
  "Priorità AI",
  "Archiviato",
];

// ALL_RAW tab name (aggregates all sources)
const ALL_RAW_TAB = "ALL_RAW";

// Google Sheets API helpers
async function getAccessToken(serviceAccountKey: string): Promise<string> {
  const key = JSON.parse(serviceAccountKey);
  
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
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(unsignedToken));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

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

async function getSheetInfo(accessToken: string, spreadsheetId: string): Promise<{
  sheets: { properties: { sheetId: number; title: string } }[];
}> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.json();
}

async function tabExists(accessToken: string, spreadsheetId: string, title: string): Promise<boolean> {
  const info = await getSheetInfo(accessToken, spreadsheetId);
  return info.sheets?.some((s) => s.properties.title === title) ?? false;
}

async function getSheetIdByTitle(accessToken: string, spreadsheetId: string, title: string): Promise<number | null> {
  const info = await getSheetInfo(accessToken, spreadsheetId);
  const sheet = info.sheets?.find((s) => s.properties.title === title);
  return sheet?.properties.sheetId ?? null;
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

async function writeRange(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: string[][],
  inputOption: "RAW" | "USER_ENTERED" = "RAW"
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

async function appendRow(accessToken: string, spreadsheetId: string, tabName: string, row: string[]): Promise<void> {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}!A:L:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] }),
    }
  );
}

async function applyTabLayout(accessToken: string, spreadsheetId: string, sheetId: number): Promise<void> {
  const requests = [
    // Freeze first row
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    // Set basic filter on all data
    {
      setBasicFilter: {
        filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 12 } },
      },
    },
    // Bold + gray background for header row
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
          },
        },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    },
    // Auto-resize columns
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 12 },
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

async function ensureRawTab(accessToken: string, spreadsheetId: string, rawTabName: string): Promise<number> {
  const exists = await tabExists(accessToken, spreadsheetId, rawTabName);
  if (exists) {
    const sheetId = await getSheetIdByTitle(accessToken, spreadsheetId, rawTabName);
    return sheetId ?? 0;
  }

  const sheetId = await createTab(accessToken, spreadsheetId, rawTabName);
  await writeRange(accessToken, spreadsheetId, `${rawTabName}!A1:L1`, [HEADERS_ITA]);
  return sheetId;
}

async function ensureViewTab(
  accessToken: string,
  spreadsheetId: string,
  viewTabName: string,
  rawTabName: string
): Promise<number> {
  const exists = await tabExists(accessToken, spreadsheetId, viewTabName);
  if (exists) {
    const sheetId = await getSheetIdByTitle(accessToken, spreadsheetId, viewTabName);
    return sheetId ?? 0;
  }

  const sheetId = await createTab(accessToken, spreadsheetId, viewTabName);
  
  // ARRAYFORMULA to mirror RAW data
  const formula = `=ARRAYFORMULA('${rawTabName}'!A:L)`;
  await writeRange(accessToken, spreadsheetId, `${viewTabName}!A1`, [[formula]], "USER_ENTERED");
  
  // Apply layout (freeze, filter, format)
  await applyTabLayout(accessToken, spreadsheetId, sheetId);
  
  return sheetId;
}

async function ensureAllRawTab(accessToken: string, spreadsheetId: string): Promise<number> {
  return ensureRawTab(accessToken, spreadsheetId, ALL_RAW_TAB);
}

async function ensureRiepilogoTab(accessToken: string, spreadsheetId: string): Promise<void> {
  const exists = await tabExists(accessToken, spreadsheetId, "Riepilogo");
  if (exists) return;

  const sheetId = await createTab(accessToken, spreadsheetId, "Riepilogo");

  // KPI formulas working on ALL_RAW
  const kpiData = [
    ["📊 RIEPILOGO LEAD", "", "", ""],
    ["", "", "", ""],
    ["METRICHE GENERALI", "", "", ""],
    ["Metrica", "Valore", "", ""],
    ["Lead Totali", `=MAX(0,COUNTA('${ALL_RAW_TAB}'!A:A)-1)`, "", ""],
    ["Lead Ultime 24h", `=COUNTIFS('${ALL_RAW_TAB}'!A2:A,">="&TEXT(NOW()-1,"yyyy-mm-dd hh:mm:ss"))`, "", ""],
    ["Lead Ultimi 7 giorni", `=COUNTIFS('${ALL_RAW_TAB}'!A2:A,">="&TEXT(NOW()-7,"yyyy-mm-dd"))`, "", ""],
    ["Lead Ultimi 30 giorni", `=COUNTIFS('${ALL_RAW_TAB}'!A2:A,">="&TEXT(NOW()-30,"yyyy-mm-dd"))`, "", ""],
    ["", "", "", ""],
    ["📈 LEAD PER FONTE", "", "", ""],
    ["Fonte", "Conteggio", "", ""],
    // Using QUERY for unique sources with counts
    [`=IFERROR(QUERY('${ALL_RAW_TAB}'!C2:C,"SELECT C, COUNT(C) WHERE C<>'' GROUP BY C LABEL COUNT(C) 'Conteggio'",0),"Nessun dato")`, "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["🎯 LEAD PER CAMPAGNA", "", "", ""],
    ["Campagna", "Conteggio", "", ""],
    [`=IFERROR(QUERY('${ALL_RAW_TAB}'!J2:J,"SELECT J, COUNT(J) WHERE J<>'' GROUP BY J LABEL COUNT(J) 'Conteggio'",0),"Nessun dato")`, "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["📁 STATO ARCHIVIAZIONE", "", "", ""],
    ["Stato", "Conteggio", "%", ""],
    ["Archiviati", `=COUNTIF('${ALL_RAW_TAB}'!L:L,"true")`, `=IFERROR(ROUND(B28/B5*100,1)&"%","0%")`, ""],
    ["Non Archiviati", `=COUNTIF('${ALL_RAW_TAB}'!L:L,"false")`, `=IFERROR(ROUND(B29/B5*100,1)&"%","0%")`, ""],
  ];

  await writeRange(accessToken, spreadsheetId, "Riepilogo!A1:D30", kpiData, "USER_ENTERED");

  // Format Riepilogo
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          // Bold title
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } },
              fields: "userEnteredFormat.textFormat",
            },
          },
          // Bold section headers
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 2 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.8, green: 0.8, blue: 0.8 } } },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 2 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.8, green: 0.8, blue: 0.8 } } },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 17, endRowIndex: 18, startColumnIndex: 0, endColumnIndex: 2 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.8, green: 0.8, blue: 0.8 } } },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 25, endRowIndex: 26, startColumnIndex: 0, endColumnIndex: 3 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.8, green: 0.8, blue: 0.8 } } },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          // Auto-resize
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 4 },
            },
          },
        ],
      }),
    }
  );
}

function getSourceTabNames(sourceName: string | null): { raw: string; view: string } {
  const isMeta = sourceName?.toLowerCase().includes("meta");
  const baseName = isMeta ? "Meta" : (sourceName || "Generic");
  // Clean tab name (remove special chars)
  const cleanName = baseName.replace(/[^\w\s-]/g, "").substring(0, 50);
  return {
    raw: `${cleanName}_RAW`,
    view: cleanName,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sheetsEnabled = Deno.env.get("GOOGLE_SHEETS_ENABLED") === "true";
  if (!sheetsEnabled) {
    return new Response(
      JSON.stringify({ success: false, error: "Sheets export is disabled" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { lead_event_id, force = false } = await req.json();

    if (!lead_event_id) {
      return new Response(
        JSON.stringify({ error: "lead_event_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // IDEMPOTENCY CHECK: skip if already exported successfully
    if (!force) {
      const { data: existingLogs, error: checkError } = await supabaseAdmin
        .from("sheets_export_logs")
        .select("id, status")
        .eq("lead_event_id", lead_event_id)
        .eq("status", "success")
        .limit(1);

      console.log(`Idempotency check for ${lead_event_id}: found=${existingLogs?.length ?? 0}, error=${checkError?.message ?? 'none'}`);

      if (existingLogs && existingLogs.length > 0) {
        console.log(`Lead event ${lead_event_id} already exported successfully, skipping`);
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "already_exported" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch lead event
    const { data: event, error: eventError } = await supabaseAdmin
      .from("lead_events")
      .select(`
        id, brand_id, contact_id, source, source_name, 
        raw_payload, occurred_at, received_at, ai_priority, archived
      `)
      .eq("id", lead_event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: "Lead event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leadEvent = event as LeadEventRow;

    // Get brand name
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("name")
      .eq("id", leadEvent.brand_id)
      .single();

    // Get contact info
    let contact: ContactInfo | null = null;
    let phone: PhoneInfo | null = null;

    if (leadEvent.contact_id) {
      const { data: contactData } = await supabaseAdmin
        .from("contacts")
        .select("first_name, last_name, email, city")
        .eq("id", leadEvent.contact_id)
        .single();
      contact = contactData as ContactInfo | null;

      const { data: phoneData } = await supabaseAdmin
        .from("contact_phones")
        .select("phone_normalized")
        .eq("contact_id", leadEvent.contact_id)
        .eq("is_primary", true)
        .single();
      phone = phoneData as PhoneInfo | null;
    }

    // Get Google credentials
    const serviceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    const spreadsheetId = Deno.env.get("GOOGLE_SHEETS_FILE_ID");

    if (!serviceAccountKey || !spreadsheetId) {
      console.error("Missing Google Sheets configuration");
      return new Response(
        JSON.stringify({ error: "Sheets not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let decodedKey = serviceAccountKey;
    try {
      decodedKey = atob(serviceAccountKey);
    } catch {
      // Already decoded
    }

    const accessToken = await getAccessToken(decodedKey);

    // Get source-specific tab names
    const { raw: sourceRawTab, view: sourceViewTab } = getSourceTabNames(leadEvent.source_name);

    // Build row data
    const payload = leadEvent.raw_payload || {};
    const message = String(payload.message || payload.messaggio || payload.notes || "");
    const campaignName = String(payload.campaign_name || payload.campagna || payload.utm_campaign || "");

    const row = [
      leadEvent.received_at,
      brand?.name || "",
      leadEvent.source_name || leadEvent.source,
      contact?.first_name || "",
      contact?.last_name || "",
      phone?.phone_normalized || "",
      contact?.email || "",
      contact?.city || "",
      message,
      campaignName,
      leadEvent.ai_priority?.toString() || "",
      leadEvent.archived ? "true" : "false",
    ];

    // 1. Ensure ALL_RAW exists and append there (aggregate)
    await ensureAllRawTab(accessToken, spreadsheetId);
    await appendRow(accessToken, spreadsheetId, ALL_RAW_TAB, row);

    // 2. Ensure source-specific RAW tab and append
    await ensureRawTab(accessToken, spreadsheetId, sourceRawTab);
    await appendRow(accessToken, spreadsheetId, sourceRawTab, row);

    // 3. Ensure source-specific VIEW tab with ARRAYFORMULA + layout
    const viewSheetId = await ensureViewTab(accessToken, spreadsheetId, sourceViewTab, sourceRawTab);

    // 4. Ensure Riepilogo tab with KPIs (works on ALL_RAW)
    await ensureRiepilogoTab(accessToken, spreadsheetId);

    // Log success
    await supabaseAdmin.from("sheets_export_logs").insert({
      lead_event_id: leadEvent.id,
      brand_id: leadEvent.brand_id,
      status: "success",
      tab_name: sourceRawTab,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        all_raw_tab: ALL_RAW_TAB,
        source_raw_tab: sourceRawTab, 
        source_view_tab: sourceViewTab 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Sheets export error:", error);
    
    // Try to log failure
    try {
      const body = await new Response(req.body).text();
      const { lead_event_id } = JSON.parse(body || "{}");
      if (lead_event_id) {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabaseAdmin.from("sheets_export_logs").insert({
          lead_event_id,
          brand_id: "00000000-0000-0000-0000-000000000000", // placeholder
          status: "failed",
          error: message,
        });
      }
    } catch {
      // Ignore logging errors
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
