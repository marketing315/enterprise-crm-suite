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
  deal_id: string | null;
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

interface DealInfo {
  id: string;
  status: string;
  value: number | null;
  current_stage_id: string | null;
  closed_at: string | null;
}

interface StageInfo {
  name: string;
}

interface AppointmentInfo {
  status: string;
  scheduled_at: string;
}

interface SheetProperties {
  sheetId: number;
  title: string;
}

interface SheetInfo {
  sheets: { properties: SheetProperties }[];
}

// PRD-aligned Italian headers (20 columns)
const HEADERS_ITA = [
  "Timestamp",           // A - received_at
  "Brand",               // B - brand name
  "Fonte",               // C - source_name
  "Campagna",            // D - campaign_name
  "AdSet",               // E - adset_name  
  "Ad",                  // F - ad_name
  "Nome",                // G - first_name
  "Cognome",             // H - last_name
  "Telefono",            // I - phone
  "Email",               // J - email
  "Città",               // K - city
  "Messaggio/Pain Area", // L - message or pain_area
  "Priorità AI",         // M - ai_priority (1-5)
  "Stage Pipeline",      // N - current stage name
  "Tags",                // O - comma-separated tags
  "Appuntamento Status", // P - appointment status
  "Appuntamento Data",   // Q - appointment scheduled_at
  "Vendita Outcome",     // R - deal status (won/lost/open)
  "Vendita Valore",      // S - deal value
  "Operatore Ultima Azione", // T - last operator action timestamp
];

const COLUMN_COUNT = HEADERS_ITA.length;
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

class SheetInfoCache {
  cachedInfo: SheetInfo | null = null;
  
  async get(accessToken: string, spreadsheetId: string): Promise<SheetInfo> {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    this.cachedInfo = await response.json();
    return this.cachedInfo!;
  }
  
  invalidate(): void {
    this.cachedInfo = null;
  }
  
  getExistingTabNames(): string[] {
    return this.cachedInfo?.sheets?.map(s => s.properties.title) || [];
  }
  
  tabExists(title: string): boolean {
    return this.cachedInfo?.sheets?.some((s) => s.properties.title === title) ?? false;
  }
  
  getSheetId(title: string): number | null {
    const sheet = this.cachedInfo?.sheets?.find((s) => s.properties.title === title);
    return sheet?.properties.sheetId ?? null;
  }
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
  const colLetter = String.fromCharCode(64 + COLUMN_COUNT); // T for 20 columns
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}!A:${colLetter}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
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
        filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: COLUMN_COUNT } },
      },
    },
    // Bold + gray background for header row
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLUMN_COUNT },
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
        dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: COLUMN_COUNT },
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

async function ensureRawTab(
  accessToken: string,
  spreadsheetId: string,
  rawTabName: string,
  cache: SheetInfoCache
): Promise<{ sheetId: number; created: boolean }> {
  await cache.get(accessToken, spreadsheetId);
  
  if (cache.tabExists(rawTabName)) {
    const sheetId = cache.getSheetId(rawTabName);
    return { sheetId: sheetId ?? 0, created: false };
  }

  const sheetId = await createTab(accessToken, spreadsheetId, rawTabName);
  const colLetter = String.fromCharCode(64 + COLUMN_COUNT);
  await writeRange(accessToken, spreadsheetId, `${rawTabName}!A1:${colLetter}1`, [HEADERS_ITA]);
  cache.invalidate();
  return { sheetId, created: true };
}

async function ensureViewTab(
  accessToken: string,
  spreadsheetId: string,
  viewTabName: string,
  rawTabName: string,
  cache: SheetInfoCache
): Promise<{ sheetId: number; created: boolean }> {
  await cache.get(accessToken, spreadsheetId);
  
  if (cache.tabExists(viewTabName)) {
    const sheetId = cache.getSheetId(viewTabName);
    return { sheetId: sheetId ?? 0, created: false };
  }

  const sheetId = await createTab(accessToken, spreadsheetId, viewTabName);
  
  const colLetter = String.fromCharCode(64 + COLUMN_COUNT);
  const formula = `=ARRAYFORMULA('${rawTabName}'!A:${colLetter})`;
  await writeRange(accessToken, spreadsheetId, `${viewTabName}!A1`, [[formula]], "USER_ENTERED");
  
  await applyTabLayout(accessToken, spreadsheetId, sheetId);
  
  cache.invalidate();
  return { sheetId, created: true };
}

async function ensureAllRawTab(
  accessToken: string,
  spreadsheetId: string,
  cache: SheetInfoCache
): Promise<{ sheetId: number; created: boolean }> {
  return ensureRawTab(accessToken, spreadsheetId, ALL_RAW_TAB, cache);
}

async function ensureRiepilogoTab(
  accessToken: string,
  spreadsheetId: string,
  cache: SheetInfoCache
): Promise<boolean> {
  await cache.get(accessToken, spreadsheetId);
  
  if (cache.tabExists("Riepilogo")) {
    return false;
  }

  const sheetId = await createTab(accessToken, spreadsheetId, "Riepilogo");

  // PRD KPIs 1-10 with formulas working on ALL_RAW
  const kpiData = [
    ["📊 RIEPILOGO KPI ENTERPRISE", "", "", "", ""],
    ["Ultimo aggiornamento:", "=NOW()", "", "", ""],
    ["", "", "", "", ""],
    ["═══════════════════════════════════════", "", "", "", ""],
    ["📈 KPI 1-5: VOLUME & VELOCITÀ", "", "", "", ""],
    ["═══════════════════════════════════════", "", "", "", ""],
    ["KPI", "Valore", "Trend/Note", "", ""],
    ["1. Lead Totali", `=MAX(0,COUNTA('${ALL_RAW_TAB}'!A:A)-1)`, "", "", ""],
    ["2. Lead Ultime 24h", `=SUMPRODUCT(('${ALL_RAW_TAB}'!A2:A<>"")*((DATEVALUE(LEFT('${ALL_RAW_TAB}'!A2:A,10))+IFERROR(TIMEVALUE(MID('${ALL_RAW_TAB}'!A2:A,12,8)),0))>=NOW()-1))`, "", "", ""],
    ["3. Lead Ultimi 7 giorni", `=SUMPRODUCT(('${ALL_RAW_TAB}'!A2:A<>"")*((DATEVALUE(LEFT('${ALL_RAW_TAB}'!A2:A,10)))>=TODAY()-7))`, "", "", ""],
    ["4. Lead Ultimi 30 giorni", `=SUMPRODUCT(('${ALL_RAW_TAB}'!A2:A<>"")*((DATEVALUE(LEFT('${ALL_RAW_TAB}'!A2:A,10)))>=TODAY()-30))`, "", "", ""],
    ["5. Media Giornaliera (30gg)", `=IFERROR(ROUND(B11/30,1),0)`, "", "", ""],
    ["", "", "", "", ""],
    ["═══════════════════════════════════════", "", "", "", ""],
    ["🎯 KPI 6-7: CONVERSIONE", "", "", "", ""],
    ["═══════════════════════════════════════", "", "", "", ""],
    ["6. Appuntamenti Schedulati", `=COUNTIF('${ALL_RAW_TAB}'!P:P,"scheduled")`, "", "", ""],
    ["7. Vendite Chiuse (Won)", `=COUNTIF('${ALL_RAW_TAB}'!R:R,"won")`, "", "", ""],
    ["   Conversion Rate", `=IFERROR(ROUND(B18/B8*100,1)&"%","0%")`, "", "", ""],
    ["", "", "", "", ""],
    ["═══════════════════════════════════════", "", "", "", ""],
    ["📊 KPI 8: DISTRIBUZIONE PRIORITÀ AI", "", "", "", ""],
    ["═══════════════════════════════════════", "", "", "", ""],
    ["Priorità 5 (Urgente)", `=COUNTIF('${ALL_RAW_TAB}'!M:M,"5")`, "", "", ""],
    ["Priorità 4", `=COUNTIF('${ALL_RAW_TAB}'!M:M,"4")`, "", "", ""],
    ["Priorità 3", `=COUNTIF('${ALL_RAW_TAB}'!M:M,"3")`, "", "", ""],
    ["Priorità 2", `=COUNTIF('${ALL_RAW_TAB}'!M:M,"2")`, "", "", ""],
    ["Priorità 1 (Bassa)", `=COUNTIF('${ALL_RAW_TAB}'!M:M,"1")`, "", "", ""],
    ["", "", "", "", ""],
    ["═══════════════════════════════════════", "", "", "", ""],
    ["📈 KPI 9: PER FONTE", "", "", "", ""],
    ["═══════════════════════════════════════", "", "", "", ""],
    [`=IFERROR(QUERY('${ALL_RAW_TAB}'!C2:C,"SELECT C, COUNT(C) WHERE C<>'' GROUP BY C ORDER BY COUNT(C) DESC LABEL COUNT(C) 'Conteggio'",0),"Nessun dato")`, "", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
    ["═══════════════════════════════════════", "", "", "", ""],
    ["🎯 KPI 10: PER CAMPAGNA (Top 10)", "", "", "", ""],
    ["═══════════════════════════════════════", "", "", "", ""],
    [`=IFERROR(QUERY('${ALL_RAW_TAB}'!D2:D,"SELECT D, COUNT(D) WHERE D<>'' GROUP BY D ORDER BY COUNT(D) DESC LIMIT 10 LABEL COUNT(D) 'Conteggio'",0),"Nessun dato")`, "", "", "", ""],
  ];

  await writeRange(accessToken, spreadsheetId, "Riepilogo!A1:E50", kpiData, "USER_ENTERED");

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
          // Auto-resize
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 5 },
            },
          },
        ],
      }),
    }
  );

  cache.invalidate();
  return true;
}

function getSourceTabNames(
  sourceName: string | null,
  existingTabs: string[]
): { raw: string; view: string } {
  const isMeta = sourceName?.toLowerCase().includes("meta");
  const baseName = isMeta ? "Meta" : (sourceName || "Generic");
  const cleanName = baseName.replace(/[^\w\s-]/g, "").substring(0, 50);
  
  let rawName = `${cleanName}_RAW`;
  let viewName = cleanName;
  
  const rawExists = existingTabs.includes(rawName);
  const viewExists = existingTabs.includes(viewName);
  
  if ((rawExists && !viewExists) || (!rawExists && viewExists)) {
    const hash = sourceName ? 
      Array.from(sourceName).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0).toString(16).slice(-4) :
      Date.now().toString(16).slice(-4);
    rawName = `${cleanName}_${hash}_RAW`;
    viewName = `${cleanName}_${hash}`;
  }
  
  return { raw: rawName, view: viewName };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: Only allow internal calls (service role or internal token)
  const authHeader = req.headers.get("Authorization");
  const internalToken = req.headers.get("X-Internal-Token");
  const expectedInternalToken = Deno.env.get("SHEETS_INTERNAL_TOKEN");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  const isInternalToken = expectedInternalToken && internalToken === expectedInternalToken;
  
  if (!isServiceRole && !isInternalToken) {
    console.error("Unauthorized sheets-export call - missing valid auth");
    return new Response(
      JSON.stringify({ error: "Unauthorized - internal only" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const sheetsEnabled = Deno.env.get("GOOGLE_SHEETS_ENABLED") === "true";
  if (!sheetsEnabled) {
    return new Response(
      JSON.stringify({ success: false, error: "Sheets export is disabled" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let bodyText = "";
  let payload: { lead_event_id?: string; force?: boolean } = {};
  
  try {
    bodyText = await req.text();
    payload = JSON.parse(bodyText || "{}");
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { lead_event_id, force = false } = payload;

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

  try {
    // RACE-SAFE IDEMPOTENCY
    if (!force) {
      const { error: insertError } = await supabaseAdmin
        .from("sheets_export_logs")
        .insert({
          lead_event_id,
          brand_id: "00000000-0000-0000-0000-000000000000",
          status: "processing",
        });

      if (insertError) {
        if (insertError.code === "23505") {
          const { data: existingLog } = await supabaseAdmin
            .from("sheets_export_logs")
            .select("status")
            .eq("lead_event_id", lead_event_id)
            .single();

          if (existingLog?.status === "success") {
            return new Response(
              JSON.stringify({ success: true, skipped: true, reason: "already_exported" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } else if (existingLog?.status === "processing") {
            return new Response(
              JSON.stringify({ success: true, skipped: true, reason: "in_progress" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ success: true, skipped: true, reason: existingLog?.status }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error("Insert processing log error:", insertError);
      }
    }

    // Fetch lead event with deal_id
    const { data: event, error: eventError } = await supabaseAdmin
      .from("lead_events")
      .select(`
        id, brand_id, contact_id, deal_id, source, source_name, 
        raw_payload, occurred_at, received_at, ai_priority, archived
      `)
      .eq("id", lead_event_id)
      .single();

    if (eventError || !event) {
      await supabaseAdmin
        .from("sheets_export_logs")
        .update({ status: "failed", error: "Lead event not found" })
        .eq("lead_event_id", lead_event_id);
        
      return new Response(
        JSON.stringify({ error: "Lead event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leadEvent = event as LeadEventRow;

    // SYSTEME.IO DEDUPLICATION
    const isSystemeIo = (leadEvent.source_name || "").toLowerCase().includes("systeme");
    
    if (isSystemeIo && leadEvent.contact_id && !force) {
      const eventTime = new Date(leadEvent.received_at).getTime();
      const windowStart = new Date(eventTime - 5000).toISOString();
      const windowEnd = new Date(eventTime + 5000).toISOString();

      const { data: siblingEvents } = await supabaseAdmin
        .from("lead_events")
        .select("id, received_at")
        .eq("contact_id", leadEvent.contact_id)
        .eq("source", leadEvent.source)
        .gte("received_at", windowStart)
        .lte("received_at", windowEnd)
        .neq("id", lead_event_id)
        .order("received_at", { ascending: true });

      if (siblingEvents && siblingEvents.length > 0) {
        const earlierSiblings = siblingEvents.filter(
          s => new Date(s.received_at).getTime() < eventTime
        );

        if (earlierSiblings.length > 0) {
          const earlierIds = earlierSiblings.map(e => e.id);
          const { data: exportedEarlier } = await supabaseAdmin
            .from("sheets_export_logs")
            .select("lead_event_id")
            .eq("status", "success")
            .in("lead_event_id", earlierIds)
            .limit(1);

          if (exportedEarlier && exportedEarlier.length > 0) {
            await supabaseAdmin
              .from("sheets_export_logs")
              .upsert({
                lead_event_id,
                brand_id: leadEvent.brand_id,
                status: "skipped",
                error: "systeme_duplicate_within_5s",
              }, { onConflict: "lead_event_id" });

            return new Response(
              JSON.stringify({ success: true, skipped: true, reason: "systeme_duplicate_within_5s" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }

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

    // Get deal + stage info
    let deal: DealInfo | null = null;
    let stage: StageInfo | null = null;
    
    if (leadEvent.deal_id) {
      const { data: dealData } = await supabaseAdmin
        .from("deals")
        .select("id, status, value, current_stage_id, closed_at")
        .eq("id", leadEvent.deal_id)
        .single();
      deal = dealData as DealInfo | null;
      
      if (deal?.current_stage_id) {
        const { data: stageData } = await supabaseAdmin
          .from("pipeline_stages")
          .select("name")
          .eq("id", deal.current_stage_id)
          .single();
        stage = stageData as StageInfo | null;
      }
    }

    // Get tags for lead event
    let tagsFlat = "";
    const { data: tagAssignments } = await supabaseAdmin
      .from("tag_assignments")
      .select("tag_id, tags(name)")
      .eq("lead_event_id", lead_event_id);
    
    if (tagAssignments && tagAssignments.length > 0) {
      tagsFlat = tagAssignments
        .map((ta) => {
          const tags = ta.tags as unknown as { name: string } | { name: string }[] | null;
          if (Array.isArray(tags)) return tags[0]?.name;
          return tags?.name;
        })
        .filter(Boolean)
        .join(", ");
    }

    // Get appointment info (most recent for contact)
    let appointment: AppointmentInfo | null = null;
    if (leadEvent.contact_id) {
      const { data: apptData } = await supabaseAdmin
        .from("appointments")
        .select("status, scheduled_at")
        .eq("contact_id", leadEvent.contact_id)
        .eq("brand_id", leadEvent.brand_id)
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .single();
      appointment = apptData as AppointmentInfo | null;
    }

    // Get last operator action (most recent ticket update)
    let lastOperatorAction = "";
    if (leadEvent.contact_id) {
      const { data: auditData } = await supabaseAdmin
        .from("ticket_audit_logs")
        .select("created_at")
        .eq("brand_id", leadEvent.brand_id)
        .not("user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (auditData) {
        lastOperatorAction = auditData.created_at;
      }
    }

    // Get Google credentials
    const serviceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    const spreadsheetId = Deno.env.get("GOOGLE_SHEETS_FILE_ID");

    if (!serviceAccountKey || !spreadsheetId) {
      await supabaseAdmin
        .from("sheets_export_logs")
        .update({ status: "failed", error: "Sheets not configured" })
        .eq("lead_event_id", lead_event_id);
        
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
    const cache = new SheetInfoCache();
    
    await cache.get(accessToken, spreadsheetId);
    const existingTabs = cache.getExistingTabNames();

    const { raw: sourceRawTab, view: sourceViewTab } = getSourceTabNames(leadEvent.source_name, existingTabs);

    // Build PRD-aligned row data (20 columns)
    const rawPayload = leadEvent.raw_payload || {};
    const message = String(rawPayload.message || rawPayload.messaggio || rawPayload.notes || rawPayload.pain_area || "");
    const campaignName = String(rawPayload.campaign_name || rawPayload.campagna || rawPayload.utm_campaign || "");
    const adsetName = String(rawPayload.adset_name || rawPayload.adset || rawPayload.utm_content || "");
    const adName = String(rawPayload.ad_name || rawPayload.ad || rawPayload.creative || "");

    const row = [
      leadEvent.received_at,                              // A - Timestamp
      brand?.name || "",                                  // B - Brand
      leadEvent.source_name || leadEvent.source,          // C - Fonte
      campaignName,                                       // D - Campagna
      adsetName,                                          // E - AdSet
      adName,                                             // F - Ad
      contact?.first_name || "",                          // G - Nome
      contact?.last_name || "",                           // H - Cognome
      phone?.phone_normalized || "",                      // I - Telefono
      contact?.email || "",                               // J - Email
      contact?.city || "",                                // K - Città
      message,                                            // L - Messaggio/Pain Area
      leadEvent.ai_priority?.toString() || "",            // M - Priorità AI
      stage?.name || "",                                  // N - Stage Pipeline
      tagsFlat,                                           // O - Tags
      appointment?.status || "",                          // P - Appuntamento Status
      appointment?.scheduled_at || "",                    // Q - Appuntamento Data
      deal?.status || "",                                 // R - Vendita Outcome
      deal?.value?.toString() || "",                      // S - Vendita Valore
      lastOperatorAction,                                 // T - Operatore Ultima Azione
    ];

    // Ensure tabs exist and append data
    await ensureAllRawTab(accessToken, spreadsheetId, cache);
    await appendRow(accessToken, spreadsheetId, ALL_RAW_TAB, row);

    await ensureRawTab(accessToken, spreadsheetId, sourceRawTab, cache);
    await appendRow(accessToken, spreadsheetId, sourceRawTab, row);

    await ensureViewTab(accessToken, spreadsheetId, sourceViewTab, sourceRawTab, cache);
    await ensureRiepilogoTab(accessToken, spreadsheetId, cache);

    // Update log to success
    await supabaseAdmin
      .from("sheets_export_logs")
      .update({ 
        status: "success",
        brand_id: leadEvent.brand_id,
        tab_name: sourceRawTab,
      })
      .eq("lead_event_id", lead_event_id);

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
    
    if (lead_event_id) {
      try {
        await supabaseAdmin
          .from("sheets_export_logs")
          .update({ 
            status: "failed", 
            error: message,
          })
          .eq("lead_event_id", lead_event_id);
      } catch {
        // Ignore logging errors
      }
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
