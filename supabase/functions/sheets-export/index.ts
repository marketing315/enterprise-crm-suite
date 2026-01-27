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

  // Create JWT
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key
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

  // Sign
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

  // Exchange for access token
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

async function ensureTabExists(
  accessToken: string,
  spreadsheetId: string,
  tabName: string
): Promise<void> {
  // Get existing sheets
  const getResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const spreadsheet = await getResponse.json();
  
  const existingTabs = spreadsheet.sheets?.map((s: { properties: { title: string } }) => s.properties.title) || [];
  
  if (!existingTabs.includes(tabName)) {
    // Create tab
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
            {
              addSheet: {
                properties: { title: tabName },
              },
            },
          ],
        }),
      }
    );

    // Add header row
    const headers = [
      "timestamp",
      "brand",
      "source",
      "first_name",
      "last_name",
      "phone_primary",
      "email",
      "city",
      "message",
      "campaign_name",
      "ai_priority",
      "archived",
    ];

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}!A1:L1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [headers] }),
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Check feature flag
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

    // Fetch lead event with contact info
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

    // Get contact info if available
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

    // Get service account key
    const serviceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    const spreadsheetId = Deno.env.get("GOOGLE_SHEETS_FILE_ID");

    if (!serviceAccountKey || !spreadsheetId) {
      console.error("Missing Google Sheets configuration");
      return new Response(
        JSON.stringify({ error: "Sheets not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decode service account key if base64 encoded
    let decodedKey = serviceAccountKey;
    try {
      decodedKey = atob(serviceAccountKey);
    } catch {
      // Already decoded
    }

    const accessToken = await getAccessToken(decodedKey);

    // Determine tab name based on source
    const tabName = leadEvent.source_name?.toLowerCase().includes("meta")
      ? "Meta"
      : leadEvent.source_name || "Generic";

    await ensureTabExists(accessToken, spreadsheetId, tabName);

    // Extract message from raw payload
    const payload = leadEvent.raw_payload || {};
    const message = String(payload.message || payload.messaggio || payload.notes || "");
    const campaignName = String(payload.campaign_name || payload.campagna || payload.utm_campaign || "");

    // Build row
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

    await appendRow(accessToken, spreadsheetId, tabName, row);

    // Log success
    await supabaseAdmin.from("sheets_export_logs").insert({
      lead_event_id: leadEvent.id,
      brand_id: leadEvent.brand_id,
      status: "success",
      tab_name: tabName,
    });

    return new Response(
      JSON.stringify({ success: true, tab: tabName }),
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
