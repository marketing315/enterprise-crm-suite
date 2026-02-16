import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============ Google Sheets API Helpers ============

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

const LEADS_HEADERS = [
  "Data", "Brand", "Nome", "Cognome", "Numero", "Email",
  "Campagna", "Fonte", "AdSet",
  "Motivo", "Messaggio",
  "CAP", "Città", "Provincia",
  "Tag", "Note",
  "Appuntamento Status", "Appuntamento Data", "Appuntamento Orario",
  "Appuntamento Via", "Appuntamento Civico", "Appuntamento Città", "Appuntamento CAP",
];

const TAB_NAME = "LEADS";

// ============ Data Fetching ============

function extractStreetNumber(address: string | null): { street: string; number: string } {
  if (!address) return { street: "", number: "" };
  // Try patterns like "Via Roma 42", "Via Roma, 42", "Via Roma n. 42"
  const match = address.match(/^(.+?)[,\s]+(?:n\.?\s*)?(\d+\s*\/?[a-zA-Z]?)$/);
  if (match) return { street: match[1].trim(), number: match[2].trim() };
  return { street: address, number: "" };
}

async function fetchLeadsData(
  supabaseAdmin: ReturnType<typeof createClient>,
  dateFrom: string | null,
  dateTo: string | null,
): Promise<string[][]> {
  // Step 1: Fetch lead_events with contacts and brands
  let query = supabaseAdmin
    .from("lead_events")
    .select(`
      id,
      received_at,
      source_name,
      raw_payload,
      contact_id,
      brand_id,
      contacts(
        first_name, last_name, email, phone_normalized,
        lead_reason, lead_message, cap, city, province, notes
      ),
      brands(name)
    `)
    .order("received_at", { ascending: false })
    .limit(5000);

  if (dateFrom) query = query.gte("received_at", dateFrom);
  if (dateTo) query = query.lte("received_at", dateTo + "T23:59:59");

  const { data: events, error } = await query;
  if (error) {
    console.error("Error fetching lead_events:", error);
    return [];
  }
  if (!events || events.length === 0) return [];

  // Step 2: Collect unique contact IDs for phones, tags, appointments
  const contactIds = [...new Set(events.map(e => e.contact_id).filter(Boolean))] as string[];

  // Fetch primary phones
  const { data: phones } = await supabaseAdmin
    .from("contact_phones")
    .select("contact_id, phone_normalized")
    .in("contact_id", contactIds)
    .eq("is_primary", true);

  const phoneMap = new Map<string, string>();
  (phones || []).forEach(p => phoneMap.set(p.contact_id, p.phone_normalized));

  // Fetch tags
  const { data: tagAssignments } = await supabaseAdmin
    .from("tag_assignments")
    .select("entity_id, tags(name)")
    .eq("entity_type", "contact")
    .in("entity_id", contactIds);

  const tagMap = new Map<string, string[]>();
  (tagAssignments || []).forEach((ta: any) => {
    const list = tagMap.get(ta.entity_id) || [];
    if (ta.tags?.name) list.push(ta.tags.name);
    tagMap.set(ta.entity_id, list);
  });

  // Fetch latest appointments per contact
  const { data: appointments } = await supabaseAdmin
    .from("appointments")
    .select("contact_id, status, scheduled_at, address, city, cap")
    .in("contact_id", contactIds)
    .order("scheduled_at", { ascending: false });

  // Keep only the latest appointment per contact
  const apptMap = new Map<string, any>();
  (appointments || []).forEach(a => {
    if (!apptMap.has(a.contact_id)) apptMap.set(a.contact_id, a);
  });

  // Step 3: Build rows
  return events.map(event => {
    const c = event.contacts as any;
    const b = event.brands as any;
    const payload = (event.raw_payload || {}) as Record<string, any>;
    const contactId = event.contact_id as string;

    const phone = phoneMap.get(contactId) || c?.phone_normalized || "";
    const tags = tagMap.get(contactId)?.join(", ") || "";
    const appt = apptMap.get(contactId);

    const { street, number: civico } = extractStreetNumber(appt?.address || null);

    let apptDate = "";
    let apptTime = "";
    if (appt?.scheduled_at) {
      const d = new Date(appt.scheduled_at);
      apptDate = d.toISOString().split("T")[0];
      apptTime = d.toISOString().split("T")[1]?.substring(0, 5) || "";
    }

    return [
      event.received_at ? new Date(event.received_at).toISOString().split("T")[0] : "",
      b?.name || "",
      c?.first_name || "",
      c?.last_name || "",
      phone,
      c?.email || "",
      payload.campaign_name || "",
      event.source_name || "",
      payload.adset_name || "",
      c?.lead_reason || "",
      c?.lead_message || "",
      c?.cap || "",
      c?.city || "",
      c?.province || "",
      tags,
      c?.notes || "",
      appt?.status || "",
      apptDate,
      apptTime,
      street,
      civico,
      appt?.city || "",
      appt?.cap || "",
    ];
  });
}

// ============ Logging ============

async function logExport(
  supabaseAdmin: ReturnType<typeof createClient>,
  brandId: string,
  status: "processing" | "success" | "failed",
  rowsExported: number,
  error?: string
): Promise<string> {
  const { data } = await supabaseAdmin
    .from("sheets_export_logs")
    .insert({
      brand_id: brandId,
      tab_name: "LEADS",
      status,
      rows_exported: rowsExported,
      error: error || null,
    })
    .select("id")
    .single();
  return data?.id || "";
}

async function updateLog(
  supabaseAdmin: ReturnType<typeof createClient>,
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
    const { date_from, date_to } = body as { date_from?: string; date_to?: string };

    // Use a system brand ID for the log entry
    const logBrandId = "00000000-0000-0000-0000-000000000000";

    const spreadsheetId = Deno.env.get("GOOGLE_SHEETS_FILE_ID");
    const serviceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");

    if (!spreadsheetId || !serviceAccountKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Google Sheets not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create processing log
    const logId = await logExport(supabaseAdmin, logBrandId, "processing", 0);

    // Get access token
    const accessToken = await getAccessToken(serviceAccountKey);
    const sheetInfo = await getSheetInfo(accessToken, spreadsheetId);

    // Ensure LEADS tab exists
    const existing = sheetInfo.sheets?.find((s: any) => s.properties.title === TAB_NAME);
    let sheetId: number;

    if (existing) {
      sheetId = existing.properties.sheetId;
      await clearSheet(accessToken, spreadsheetId, TAB_NAME);
      await writeRange(accessToken, spreadsheetId, `${TAB_NAME}!A1:W1`, [LEADS_HEADERS]);
    } else {
      sheetId = await createTab(accessToken, spreadsheetId, TAB_NAME);
      await writeRange(accessToken, spreadsheetId, `${TAB_NAME}!A1:W1`, [LEADS_HEADERS]);
      await applyFormatting(accessToken, spreadsheetId, sheetId, LEADS_HEADERS.length);
    }

    // Fetch data
    const rows = await fetchLeadsData(supabaseAdmin, date_from || null, date_to || null);

    if (rows.length > 0) {
      // Write in batches of 1000
      const BATCH_SIZE = 1000;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const startRow = i + 2; // row 1 is header
        const endRow = startRow + batch.length - 1;
        await writeRange(
          accessToken, spreadsheetId,
          `${TAB_NAME}!A${startRow}:W${endRow}`,
          batch
        );
      }
    }

    // Update log
    await updateLog(supabaseAdmin, logId, "success", rows.length);

    return new Response(
      JSON.stringify({ success: true, rows_exported: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sheets-leads-export error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

