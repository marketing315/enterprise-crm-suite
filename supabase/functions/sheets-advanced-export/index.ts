import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Types
interface ExportRequest {
  sheet_id?: string;
  brand_id?: string;
  export_type: "full" | "sales" | "deals" | "kpi";
  date_from?: string;
  date_to?: string;
  filters?: {
    seller_id?: string;
    status?: string;
  };
}

interface SheetProperties {
  sheetId: number;
  title: string;
}

interface SheetInfo {
  sheets: { properties: SheetProperties }[];
}

// Sheet column configs
const SALES_HEADERS = [
  "Data", "Contatto", "Venditore", "Brand", "Importo", "Metodo Pagamento", "Stato", "Note"
];

const DEALS_HEADERS = [
  "Data Creazione", "Contatto", "Venditore", "Brand", "Stage", "Valore", "Stato", "Data Chiusura"
];

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

async function getSheetInfo(accessToken: string, spreadsheetId: string): Promise<SheetInfo> {
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

async function applyFormatting(accessToken: string, spreadsheetId: string, sheetId: number, columnCount: number): Promise<void> {
  const requests = [
    // Freeze header row
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    // Auto filter
    {
      setBasicFilter: {
        filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: columnCount } },
      },
    },
    // Bold header
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.2, green: 0.4, blue: 0.6 },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)",
      },
    },
    // Header text color white
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
        cell: {
          userEnteredFormat: {
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } },
          },
        },
        fields: "userEnteredFormat.textFormat.foregroundColor",
      },
    },
    // Auto-resize columns
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

async function ensureTab(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  headers: string[],
  sheetInfo: SheetInfo
): Promise<number> {
  const existing = sheetInfo.sheets?.find(s => s.properties.title === tabName);
  
  if (existing) {
    // Clear existing data
    await clearSheet(accessToken, spreadsheetId, tabName);
    // Write headers
    await writeRange(accessToken, spreadsheetId, `${tabName}!A1:${String.fromCharCode(64 + headers.length)}1`, [headers]);
    return existing.properties.sheetId;
  }
  
  // Create new tab
  const sheetId = await createTab(accessToken, spreadsheetId, tabName);
  await writeRange(accessToken, spreadsheetId, `${tabName}!A1:${String.fromCharCode(64 + headers.length)}1`, [headers]);
  await applyFormatting(accessToken, spreadsheetId, sheetId, headers.length);
  return sheetId;
}

// ============ Data Fetching ============

async function fetchSalesData(
  supabaseAdmin: ReturnType<typeof createClient>,
  brandId: string | null,
  dateFrom: string | null,
  dateTo: string | null,
  sellerId: string | null
): Promise<string[][]> {
  let query = supabaseAdmin
    .from("sales_orders")
    .select(`
      id,
      created_at,
      total_amount,
      payment_method,
      status,
      notes,
      contact_id,
      user_id,
      brand_id,
      contacts!inner(first_name, last_name),
      users!sales_orders_user_id_fkey(full_name),
      brands!inner(name)
    `)
    .order("created_at", { ascending: false });

  if (brandId && brandId !== "00000000-0000-0000-0000-000000000000") {
    query = query.eq("brand_id", brandId);
  }
  
  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }
  
  if (dateTo) {
    query = query.lte("created_at", dateTo + "T23:59:59");
  }
  
  if (sellerId) {
    query = query.eq("user_id", sellerId);
  }

  const { data, error } = await query.limit(5000);
  
  if (error) {
    console.error("Error fetching sales:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => {
    const contacts = row.contacts as { first_name?: string; last_name?: string } | null;
    const users = row.users as { full_name?: string } | null;
    const brands = row.brands as { name?: string } | null;
    
    return [
      new Date(row.created_at as string).toISOString().split("T")[0],
      [contacts?.first_name, contacts?.last_name].filter(Boolean).join(" ") || "-",
      users?.full_name || "-",
      brands?.name || "-",
      String(row.total_amount || 0),
      String(row.payment_method || "-"),
      String(row.status || "-"),
      String(row.notes || ""),
    ];
  });
}

async function fetchDealsData(
  supabaseAdmin: ReturnType<typeof createClient>,
  brandId: string | null,
  dateFrom: string | null,
  dateTo: string | null,
  sellerId: string | null,
  status: string | null
): Promise<string[][]> {
  let query = supabaseAdmin
    .from("deals")
    .select(`
      id,
      created_at,
      value,
      status,
      closed_at,
      contact_id,
      assigned_user_id,
      brand_id,
      current_stage_id,
      contacts!inner(first_name, last_name),
      users!deals_assigned_user_id_fkey(full_name),
      brands!inner(name),
      pipeline_stages(name)
    `)
    .order("created_at", { ascending: false });

  if (brandId && brandId !== "00000000-0000-0000-0000-000000000000") {
    query = query.eq("brand_id", brandId);
  }
  
  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }
  
  if (dateTo) {
    query = query.lte("created_at", dateTo + "T23:59:59");
  }
  
  if (sellerId) {
    query = query.eq("assigned_user_id", sellerId);
  }
  
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query.limit(5000);
  
  if (error) {
    console.error("Error fetching deals:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => {
    const contacts = row.contacts as { first_name?: string; last_name?: string } | null;
    const users = row.users as { full_name?: string } | null;
    const brands = row.brands as { name?: string } | null;
    const stages = row.pipeline_stages as { name?: string } | null;
    
    return [
      new Date(row.created_at as string).toISOString().split("T")[0],
      [contacts?.first_name, contacts?.last_name].filter(Boolean).join(" ") || "-",
      users?.full_name || "-",
      brands?.name || "-",
      stages?.name || "-",
      String(row.value || 0),
      String(row.status || "-"),
      row.closed_at ? new Date(row.closed_at as string).toISOString().split("T")[0] : "",
    ];
  });
}

// ============ KPI Tab Creation ============

async function createKpiTab(
  accessToken: string,
  spreadsheetId: string,
  sheetInfo: SheetInfo
): Promise<void> {
  const tabName = "KPI";
  const existing = sheetInfo.sheets?.find(s => s.properties.title === tabName);
  
  let sheetId: number;
  if (existing) {
    sheetId = existing.properties.sheetId;
    await clearSheet(accessToken, spreadsheetId, tabName);
  } else {
    sheetId = await createTab(accessToken, spreadsheetId, tabName);
  }

  // KPI formulas that reference SALES and DEALS tabs
  const kpiData = [
    ["📊 DASHBOARD KPI", "", ""],
    ["Ultimo aggiornamento:", "=NOW()", ""],
    ["", "", ""],
    ["═══════════════════════════════════════", "", ""],
    ["📈 VENDITE", "", ""],
    ["═══════════════════════════════════════", "", ""],
    ["Totale Vendite", "=COUNTA(SALES!A:A)-1", ""],
    ["Valore Totale", "=SUM(SALES!E:E)", "€"],
    ["Media per Vendita", "=IFERROR(AVERAGE(SALES!E:E),0)", "€"],
    ["", "", ""],
    ["═══════════════════════════════════════", "", ""],
    ["🎯 PIPELINE", "", ""],
    ["═══════════════════════════════════════", "", ""],
    ["Deal Totali", "=COUNTA(DEALS!A:A)-1", ""],
    ["Deal Aperti", '=COUNTIF(DEALS!G:G,"open")', ""],
    ["Deal Vinti", '=COUNTIF(DEALS!G:G,"won")', ""],
    ["Deal Persi", '=COUNTIF(DEALS!G:G,"lost")', ""],
    ["Valore Pipeline", "=SUM(DEALS!F:F)", "€"],
    ["Win Rate", '=IFERROR(COUNTIF(DEALS!G:G,"won")/(COUNTIF(DEALS!G:G,"won")+COUNTIF(DEALS!G:G,"lost"))*100,0)', "%"],
    ["", "", ""],
    ["═══════════════════════════════════════", "", ""],
    ["📊 PER VENDITORE (Top 5)", "", ""],
    ["═══════════════════════════════════════", "", ""],
    ["=IFERROR(QUERY(SALES!C2:E,\"SELECT C, COUNT(C), SUM(E) WHERE C<>'' GROUP BY C ORDER BY SUM(E) DESC LIMIT 5 LABEL COUNT(C) 'N. Vendite', SUM(E) 'Totale €'\",0),\"Nessun dato\")", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["═══════════════════════════════════════", "", ""],
    ["📈 PER BRAND", "", ""],
    ["═══════════════════════════════════════", "", ""],
    ["=IFERROR(QUERY(SALES!D2:E,\"SELECT D, COUNT(D), SUM(E) WHERE D<>'' GROUP BY D ORDER BY SUM(E) DESC LABEL COUNT(D) 'N. Vendite', SUM(E) 'Totale €'\",0),\"Nessun dato\")", "", ""],
  ];

  await writeRange(accessToken, spreadsheetId, `${tabName}!A1:C40`, kpiData, "USER_ENTERED");

  // Format KPI tab
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } },
              fields: "userEnteredFormat.textFormat",
            },
          },
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

// ============ Logging ============

async function logExport(
  supabaseAdmin: ReturnType<typeof createClient>,
  brandId: string,
  exportType: string,
  status: "processing" | "success" | "failed",
  rowsExported: number,
  error?: string
): Promise<string> {
  const { data } = await supabaseAdmin
    .from("sheets_export_logs")
    .insert({
      brand_id: brandId,
      tab_name: exportType.toUpperCase(),
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
    .update({
      status,
      rows_exported: rowsExported,
      error: error || null,
    })
    .eq("id", logId);
}

// ============ Main Handler ============

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check: service role OR cron secret
  const authHeader = req.headers.get("Authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  
  const isServiceRole = !!serviceRoleKey && timingSafeEqual(authHeader || "", `Bearer ${serviceRoleKey}`);
  const isCronJob = !!(cronSecret && expectedCronSecret && timingSafeEqual(cronSecret, expectedCronSecret));
  
  if (!isServiceRole && !isCronJob) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Check if sheets enabled
  const sheetsEnabled = Deno.env.get("GOOGLE_SHEETS_ENABLED") === "true";
  if (!sheetsEnabled) {
    return new Response(
      JSON.stringify({ success: false, error: "Sheets export disabled" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Parse request
  let payload: ExportRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const {
    sheet_id,
    brand_id,
    export_type,
    date_from,
    date_to,
    filters,
  } = payload;

  // Get spreadsheet ID
  const spreadsheetId = sheet_id || Deno.env.get("GOOGLE_SHEETS_FILE_ID");
  if (!spreadsheetId) {
    return new Response(
      JSON.stringify({ error: "No spreadsheet ID configured" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get service account key
  const serviceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!serviceAccountKey) {
    return new Response(
      JSON.stringify({ error: "Service account not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Create Supabase admin client
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Default brand_id for logging
  const logBrandId = brand_id || "00000000-0000-0000-0000-000000000000";
  let logId = "";

  try {
    // Log start
    logId = await logExport(supabaseAdmin, logBrandId, export_type, "processing", 0);

    // Get access token
    console.log("Getting Google access token...");
    const accessToken = await getAccessToken(serviceAccountKey);

    // Get sheet info
    console.log("Fetching sheet info...");
    const sheetInfo = await getSheetInfo(accessToken, spreadsheetId);

    let totalRows = 0;

    // Export based on type
    if (export_type === "sales" || export_type === "full") {
      console.log("Exporting SALES...");
      await ensureTab(accessToken, spreadsheetId, "SALES", SALES_HEADERS, sheetInfo);
      const salesData = await fetchSalesData(
        supabaseAdmin,
        brand_id || null,
        date_from || null,
        date_to || null,
        filters?.seller_id || null
      );
      if (salesData.length > 0) {
        await writeRange(
          accessToken,
          spreadsheetId,
          `SALES!A2:${String.fromCharCode(64 + SALES_HEADERS.length)}${salesData.length + 1}`,
          salesData
        );
      }
      totalRows += salesData.length;
      console.log(`SALES exported: ${salesData.length} rows`);
    }

    if (export_type === "deals" || export_type === "full") {
      console.log("Exporting DEALS...");
      // Refresh sheet info if we added a tab
      const refreshedInfo = await getSheetInfo(accessToken, spreadsheetId);
      await ensureTab(accessToken, spreadsheetId, "DEALS", DEALS_HEADERS, refreshedInfo);
      const dealsData = await fetchDealsData(
        supabaseAdmin,
        brand_id || null,
        date_from || null,
        date_to || null,
        filters?.seller_id || null,
        filters?.status || null
      );
      if (dealsData.length > 0) {
        await writeRange(
          accessToken,
          spreadsheetId,
          `DEALS!A2:${String.fromCharCode(64 + DEALS_HEADERS.length)}${dealsData.length + 1}`,
          dealsData
        );
      }
      totalRows += dealsData.length;
      console.log(`DEALS exported: ${dealsData.length} rows`);
    }

    if (export_type === "kpi" || export_type === "full") {
      console.log("Creating KPI tab...");
      const refreshedInfo = await getSheetInfo(accessToken, spreadsheetId);
      await createKpiTab(accessToken, spreadsheetId, refreshedInfo);
      console.log("KPI tab created");
    }

    // Update log
    await updateLog(supabaseAdmin, logId, "success", totalRows);

    return new Response(
      JSON.stringify({
        success: true,
        rows_exported: totalRows,
        export_type,
        spreadsheet_id: spreadsheetId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Export error:", error);
    
    if (logId) {
      await updateLog(supabaseAdmin, logId, "failed", 0, String(error));
    }

    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
