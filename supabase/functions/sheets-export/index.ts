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

// Google Sheets API helpers
async function getAccessToken(serviceAccountKey: string): Promise<string> {
  const key = JSON.parse(serviceAccountKey);
  
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  
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

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );
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

async function getSheetIdByTitle(
  accessToken: string,
  spreadsheetId: string,
  title: string
): Promise<number | null> {
  const info = await getSheetInfo(accessToken, spreadsheetId);
  const sheet = info.sheets?.find((s) => s.properties.title === title);
  return sheet?.properties.sheetId ?? null;
}

async function ensureRawTabExists(
  accessToken: string,
  spreadsheetId: string,
  rawTabName: string
): Promise<number> {
  const info = await getSheetInfo(accessToken, spreadsheetId);
  const existingTab = info.sheets?.find((s) => s.properties.title === rawTabName);
  
  if (existingTab) {
    return existingTab.properties.sheetId;
  }

  // Create the RAW tab
  const createResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: rawTabName } } }],
      }),
    }
  );
  const createResult = await createResponse.json();
  const newSheetId = createResult.replies?.[0]?.addSheet?.properties?.sheetId;

  // Add header row to RAW tab (English for internal use, or keep consistent)
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rawTabName)}!A1:L1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [HEADERS_ITA] }),
    }
  );

  return newSheetId;
}

async function ensureViewTabExists(
  accessToken: string,
  spreadsheetId: string,
  viewTabName: string,
  rawTabName: string
): Promise<number> {
  const info = await getSheetInfo(accessToken, spreadsheetId);
  const existingTab = info.sheets?.find((s) => s.properties.title === viewTabName);
  
  if (existingTab) {
    return existingTab.properties.sheetId;
  }

  // Create view tab
  const createResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: viewTabName } } }],
      }),
    }
  );
  const createResult = await createResponse.json();
  const newSheetId = createResult.replies?.[0]?.addSheet?.properties?.sheetId;

  // Add ARRAYFORMULA to mirror RAW data with Italian headers
  const formula = `=ARRAYFORMULA('${rawTabName}'!A:L)`;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(viewTabName)}!A1?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [[formula]] }),
    }
  );

  return newSheetId;
}

async function applyTabLayout(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number
): Promise<void> {
  // Apply freeze + filter + formatting
  const requests = [
    // Freeze first row
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 1 },
        },
        fields: "gridProperties.frozenRowCount",
      },
    },
    // Set basic filter on all data
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId,
            startRowIndex: 0,
            startColumnIndex: 0,
            endColumnIndex: 12, // Columns A-L
          },
        },
      },
    },
    // Bold header row
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 12,
        },
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
        dimensions: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: 12,
        },
      },
    },
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  );
}

async function ensureRiepilogoTab(
  accessToken: string,
  spreadsheetId: string,
  rawTabName: string
): Promise<void> {
  const info = await getSheetInfo(accessToken, spreadsheetId);
  const existingTab = info.sheets?.find((s) => s.properties.title === "Riepilogo");
  
  if (existingTab) {
    return; // Already exists
  }

  // Create Riepilogo tab
  const createResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: "Riepilogo" } } }],
      }),
    }
  );
  const createResult = await createResponse.json();
  const sheetId = createResult.replies?.[0]?.addSheet?.properties?.sheetId;

  // Add KPI formulas
  const kpiData = [
    ["📊 RIEPILOGO LEAD", "", ""],
    ["", "", ""],
    ["Metrica", "Valore", ""],
    ["Lead Totali", `=COUNTA('${rawTabName}'!A:A)-1`, ""],
    ["Lead Ultime 24h", `=COUNTIF('${rawTabName}'!A:A,">="&(NOW()-1))`, ""],
    ["Lead Ultimi 7 giorni", `=COUNTIF('${rawTabName}'!A:A,">="&(NOW()-7))`, ""],
    ["Lead Ultimi 30 giorni", `=COUNTIF('${rawTabName}'!A:A,">="&(NOW()-30))`, ""],
    ["", "", ""],
    ["📈 PER FONTE", "", ""],
    ["Fonte", "Conteggio", ""],
    [`=UNIQUE(FILTER('${rawTabName}'!C2:C,'${rawTabName}'!C2:C<>""))`, `=COUNTIF('${rawTabName}'!C:C,A11)`, ""],
    ["", "", ""],
    ["🎯 PER CAMPAGNA", "", ""],
    ["Campagna", "Conteggio", ""],
    [`=UNIQUE(FILTER('${rawTabName}'!J2:J,'${rawTabName}'!J2:J<>""))`, `=COUNTIF('${rawTabName}'!J:J,A15)`, ""],
    ["", "", ""],
    ["📁 STATO", "", ""],
    ["Archiviati", `=COUNTIF('${rawTabName}'!L:L,"true")`, ""],
    ["Non Archiviati", `=COUNTIF('${rawTabName}'!L:L,"false")`, ""],
    ["% Archiviati", `=IFERROR(B18/(B18+B19)*100,0)&"%"`, ""],
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Riepilogo!A1:C20?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: kpiData }),
    }
  );

  // Format Riepilogo
  if (sheetId) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            // Bold title
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } },
                fields: "userEnteredFormat.textFormat",
              },
            },
            // Bold section headers
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 2 },
                cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 } } },
                fields: "userEnteredFormat(textFormat,backgroundColor)",
              },
            },
            // Auto-resize
            {
              autoResizeDimensions: {
                dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 3 },
              },
            },
          ],
        }),
      }
    );
  }
}

async function appendRow(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  row: string[]
): Promise<void> {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}!A:L:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    }
  );
}

function getSourceTabNames(sourceName: string | null): { raw: string; view: string } {
  const isMeta = sourceName?.toLowerCase().includes("meta");
  const baseName = isMeta ? "Meta" : (sourceName || "Generic");
  return {
    raw: `${baseName}_RAW`,
    view: baseName,
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

    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("name")
      .eq("id", leadEvent.brand_id)
      .single();

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

    // Get tab names based on source
    const { raw: rawTabName, view: viewTabName } = getSourceTabNames(leadEvent.source_name);

    // Ensure RAW tab exists (append-only)
    const rawSheetId = await ensureRawTabExists(accessToken, spreadsheetId, rawTabName);

    // Ensure View tab exists (with ARRAYFORMULA)
    const viewSheetId = await ensureViewTabExists(accessToken, spreadsheetId, viewTabName, rawTabName);

    // Apply layout to View tab (freeze, filter, formatting)
    await applyTabLayout(accessToken, spreadsheetId, viewSheetId);

    // Ensure Riepilogo tab exists with KPI formulas
    await ensureRiepilogoTab(accessToken, spreadsheetId, rawTabName);

    // Extract data from payload
    const payload = leadEvent.raw_payload || {};
    const message = String(payload.message || payload.messaggio || payload.notes || "");
    const campaignName = String(payload.campaign_name || payload.campagna || payload.utm_campaign || "");

    // Build row for RAW tab
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

    // Append to RAW tab (View tab auto-updates via formula)
    await appendRow(accessToken, spreadsheetId, rawTabName, row);

    // Log success
    await supabaseAdmin.from("sheets_export_logs").insert({
      lead_event_id: leadEvent.id,
      brand_id: leadEvent.brand_id,
      status: "success",
      tab_name: rawTabName,
    });

    return new Response(
      JSON.stringify({ success: true, raw_tab: rawTabName, view_tab: viewTabName }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Sheets export error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
