import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

async function writeRange(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: string[][],
  inputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED"
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

async function tabExists(accessToken: string, spreadsheetId: string, tabName: string): Promise<boolean> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await response.json();
  return data.sheets?.some((s: { properties: { title: string } }) => s.properties.title === tabName) ?? false;
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

/**
 * Scheduled job to refresh the "Riepilogo" KPI tab with live formulas
 * Can be triggered via cron or manual invocation
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Allow service role or anon key (for cron jobs)
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  const isAnonKey = authHeader === `Bearer ${anonKey}`;
  
  if (!isServiceRole && !isAnonKey) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
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

  try {
    const serviceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    const spreadsheetId = Deno.env.get("GOOGLE_SHEETS_FILE_ID");

    if (!serviceAccountKey || !spreadsheetId) {
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

    // Ensure Riepilogo tab exists
    const riepilogoExists = await tabExists(accessToken, spreadsheetId, "Riepilogo");
    if (!riepilogoExists) {
      await createTab(accessToken, spreadsheetId, "Riepilogo");
    }

    // Write comprehensive KPIs with live formulas
    // These formulas will auto-update as data changes in ALL_RAW
    const kpiData = [
      ["📊 RIEPILOGO KPI ENTERPRISE", "", "", "", ""],
      ["Ultimo aggiornamento:", "=NOW()", "", "", ""],
      ["", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      ["📈 KPI 1-5: VOLUME & VELOCITÀ", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      ["KPI", "Valore", "Trend", "Dettaglio", ""],
      ["1. Lead Totali", `=MAX(0,COUNTA('${ALL_RAW_TAB}'!A:A)-1)`, "", "", ""],
      ["2. Lead Ultime 24h", `=SUMPRODUCT(('${ALL_RAW_TAB}'!A2:A<>"")*((DATEVALUE(LEFT('${ALL_RAW_TAB}'!A2:A,10))+IFERROR(TIMEVALUE(MID('${ALL_RAW_TAB}'!A2:A,12,8)),0))>=NOW()-1))`, "", "", ""],
      ["3. Lead Ultimi 7 giorni", `=SUMPRODUCT(('${ALL_RAW_TAB}'!A2:A<>"")*((DATEVALUE(LEFT('${ALL_RAW_TAB}'!A2:A,10)))>=TODAY()-7))`, "", "", ""],
      ["4. Lead Ultimi 30 giorni", `=SUMPRODUCT(('${ALL_RAW_TAB}'!A2:A<>"")*((DATEVALUE(LEFT('${ALL_RAW_TAB}'!A2:A,10)))>=TODAY()-30))`, "", "", ""],
      ["5. Media Giornaliera (30gg)", `=IFERROR(ROUND(B11/30,1),0)`, "", "", ""],
      ["", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      ["🎯 KPI 6-7: CONVERSIONE", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      ["6. Appuntamenti Totali", `=COUNTIF('${ALL_RAW_TAB}'!P:P,"<>")`, "", "", ""],
      ["   - Scheduled", `=COUNTIF('${ALL_RAW_TAB}'!P:P,"scheduled")`, "", "", ""],
      ["   - Completed", `=COUNTIF('${ALL_RAW_TAB}'!P:P,"completed")`, "", "", ""],
      ["   - Cancelled", `=COUNTIF('${ALL_RAW_TAB}'!P:P,"cancelled")`, "", "", ""],
      ["7. Vendite Chiuse", `=COUNTIF('${ALL_RAW_TAB}'!R:R,"won")+COUNTIF('${ALL_RAW_TAB}'!R:R,"lost")`, "", "", ""],
      ["   - Won", `=COUNTIF('${ALL_RAW_TAB}'!R:R,"won")`, "", "", ""],
      ["   - Lost", `=COUNTIF('${ALL_RAW_TAB}'!R:R,"lost")`, "", "", ""],
      ["   - Win Rate", `=IFERROR(ROUND(B22/B21*100,1)&"%","N/A")`, "", "", ""],
      ["   - Valore Totale Won", `=IFERROR(SUMIF('${ALL_RAW_TAB}'!R:R,"won",'${ALL_RAW_TAB}'!S:S),0)`, "", "", ""],
      ["", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      ["📊 KPI 8: DISTRIBUZIONE PRIORITÀ AI", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      ["Priorità", "Conteggio", "%", "", ""],
      ["5 - Urgente", `=COUNTIF('${ALL_RAW_TAB}'!M:M,"5")`, `=IFERROR(ROUND(B31/B8*100,1)&"%","0%")`, "", ""],
      ["4 - Alta", `=COUNTIF('${ALL_RAW_TAB}'!M:M,"4")`, `=IFERROR(ROUND(B32/B8*100,1)&"%","0%")`, "", ""],
      ["3 - Media", `=COUNTIF('${ALL_RAW_TAB}'!M:M,"3")`, `=IFERROR(ROUND(B33/B8*100,1)&"%","0%")`, "", ""],
      ["2 - Bassa", `=COUNTIF('${ALL_RAW_TAB}'!M:M,"2")`, `=IFERROR(ROUND(B34/B8*100,1)&"%","0%")`, "", ""],
      ["1 - Minima", `=COUNTIF('${ALL_RAW_TAB}'!M:M,"1")`, `=IFERROR(ROUND(B35/B8*100,1)&"%","0%")`, "", ""],
      ["", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      ["📈 KPI 9: LEAD PER FONTE", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      [`=IFERROR(QUERY('${ALL_RAW_TAB}'!C2:C,"SELECT C, COUNT(C) WHERE C<>'' GROUP BY C ORDER BY COUNT(C) DESC LABEL COUNT(C) 'Conteggio'",0),"Nessun dato")`, "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      ["🎯 KPI 10: TOP 10 CAMPAGNE", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      [`=IFERROR(QUERY('${ALL_RAW_TAB}'!D2:D,"SELECT D, COUNT(D) WHERE D<>'' GROUP BY D ORDER BY COUNT(D) DESC LIMIT 10 LABEL COUNT(D) 'Conteggio'",0),"Nessun dato")`, "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      ["📊 STAGE PIPELINE", "", "", "", ""],
      ["═══════════════════════════════════════════════════════", "", "", "", ""],
      [`=IFERROR(QUERY('${ALL_RAW_TAB}'!N2:N,"SELECT N, COUNT(N) WHERE N<>'' GROUP BY N ORDER BY COUNT(N) DESC LABEL COUNT(N) 'Conteggio'",0),"Nessun dato")`, "", "", "", ""],
    ];

    await writeRange(accessToken, spreadsheetId, "Riepilogo!A1:E70", kpiData, "USER_ENTERED");

    console.log("KPI Riepilogo tab refreshed successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Riepilogo KPI tab refreshed",
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("KPI refresh error:", error);

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
