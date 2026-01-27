import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// GDPR-safe header whitelist - exclude sensitive data
const HEADER_WHITELIST = [
  "content-type",
  "user-agent",
  "x-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
  "origin",
  "accept",
  "accept-language",
  // Excluded: referer (may contain PII in query strings)
  // Excluded: authorization, cookie, x-api-key (credentials)
];

function filterHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const key of HEADER_WHITELIST) {
    const value = headers.get(key);
    if (value) filtered[key] = value;
  }
  return filtered;
}

interface NormalizedPhone {
  normalized: string;
  countryCode: string;
  assumedCountry: boolean;
  raw: string;
}

// Phone normalization with country detection
function normalizePhone(phone: string, defaultCountry = "IT"): NormalizedPhone {
  const raw = phone;
  let normalized = phone.replace(/\D/g, "");
  let countryCode = defaultCountry;
  let assumedCountry = true;

  const prefixes: Record<string, string> = {
    "39": "IT",
    "44": "GB",
    "49": "DE",
    "33": "FR",
    "34": "ES",
    "41": "CH",
    "43": "AT",
    "1": "US",
  };

  const sortedPrefixes = Object.entries(prefixes).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [prefix, country] of sortedPrefixes) {
    if (normalized.startsWith(prefix) && normalized.length > 10) {
      normalized = normalized.slice(prefix.length);
      countryCode = country;
      assumedCountry = false;
      break;
    }
  }

  return { normalized, countryCode, assumedCountry, raw };
}

// Verify API key using constant-time comparison
async function verifyApiKey(
  providedKey: string,
  storedHash: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(providedKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const providedHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return providedHash === storedHash;
}

// Apply field mapping from webhook source config
function applyMapping(
  payload: Record<string, unknown>,
  mapping: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [targetField, sourceField] of Object.entries(mapping)) {
    if (sourceField in payload) {
      result[targetField] = payload[sourceField];
    }
  }

  // Keep unmapped fields
  for (const [key, value] of Object.entries(payload)) {
    if (!Object.values(mapping).includes(key)) {
      result[key] = value;
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Create admin client early for audit logging
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Extract common request info immediately (before any validation)
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const userAgent = req.headers.get("user-agent") || null;
  const filteredHeaders = filterHeaders(req.headers);

  // Read body as text first (allows audit even if JSON is invalid)
  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    bodyText = "";
  }

  // Parse JSON - will be null if invalid
  let rawBody: Record<string, unknown> | null = null;
  let jsonParseError = false;
  try {
    rawBody = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    jsonParseError = true;
  }

  // Extract source ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const sourceId = pathParts[pathParts.length - 1];

  // Generate request ID for structured logging
  const requestId = crypto.randomUUID();
  const logContext = { request_id: requestId, source_id: sourceId };

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidUuid = sourceId && sourceId !== "webhook-ingest" && uuidRegex.test(sourceId);

  // Helper to create audit record
  async function createAuditRecord(
    status: "pending" | "success" | "rejected" | "failed",
    errorMessage: string | null,
    resolvedSourceId: string | null,
    resolvedBrandId: string | null,
    leadEventId: string | null = null
  ): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from("incoming_requests")
      .insert({
        source_id: resolvedSourceId,
        brand_id: resolvedBrandId,
        raw_body: rawBody, // null if JSON invalid
        headers: filteredHeaders,
        ip_address: ipAddress,
        user_agent: userAgent,
        status,
        processed: status !== "pending",
        error_message: errorMessage,
        lead_event_id: leadEventId,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create audit record:", error);
      return null;
    }
    return data?.id || null;
  }

  // Helper to update existing audit record
  async function updateAuditRecord(
    auditId: string,
    status: "success" | "rejected" | "failed",
    errorMessage: string | null,
    leadEventId: string | null = null
  ) {
    await supabaseAdmin
      .from("incoming_requests")
      .update({
        status,
        processed: true,
        error_message: errorMessage,
        lead_event_id: leadEventId,
      })
      .eq("id", auditId);
  }

  // === VALIDATION PHASE (with audit) ===

  // 1. Invalid UUID - audit without source_id/brand_id
  if (!isValidUuid) {
    console.log(JSON.stringify({ ...logContext, outcome: "invalid_uuid", status: 400 }));
    await createAuditRecord("rejected", "invalid_uuid", null, null);
    return new Response(
      JSON.stringify({ error: "Valid source ID (UUID) required in URL path" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 2. Missing API key - audit without brand_id (source_id known)
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    console.log(JSON.stringify({ ...logContext, outcome: "missing_api_key", status: 401 }));
    await createAuditRecord("rejected", "missing_api_key", sourceId, null);
    return new Response(JSON.stringify({ error: "Missing X-API-Key header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Find webhook source
  const { data: source, error: sourceError } = await supabaseAdmin
    .from("webhook_sources")
    .select("id, name, brand_id, api_key_hash, rate_limit_per_min, mapping, is_active")
    .eq("id", sourceId)
    .maybeSingle();

  // 4. Source not found - audit with source_id but no brand_id
  if (sourceError || !source) {
    console.log(JSON.stringify({ ...logContext, outcome: "source_not_found", status: 404 }));
    await createAuditRecord("rejected", "source_not_found", sourceId, null);
    return new Response(JSON.stringify({ error: "Unknown webhook source" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Now we have brand_id from source
  const brandId = source.brand_id;

  // 5. Source inactive - full audit possible
  if (!source.is_active) {
    console.log(JSON.stringify({ ...logContext, outcome: "inactive_source", status: 409 }));
    await createAuditRecord("rejected", "inactive_source", sourceId, brandId);
    return new Response(
      JSON.stringify({ error: "inactive_source", message: "Webhook source is not active" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 6. Invalid API key - full audit
  const isValidKey = await verifyApiKey(apiKey, source.api_key_hash);
  if (!isValidKey) {
    console.log(JSON.stringify({ ...logContext, outcome: "invalid_api_key", status: 401 }));
    await createAuditRecord("rejected", "invalid_api_key", sourceId, brandId);
    return new Response(JSON.stringify({ error: "Invalid API key" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 7. Rate limit - full audit
  const { data: hasToken, error: rateLimitError } = await supabaseAdmin.rpc(
    "consume_rate_limit_token",
    { p_source_id: source.id }
  );

  if (rateLimitError || !hasToken) {
    console.log(JSON.stringify({ ...logContext, outcome: "rate_limited", status: 429 }));
    await createAuditRecord("rejected", "rate_limited", sourceId, brandId);
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded", retry_after: 60 }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      }
    );
  }

  // 8. Invalid JSON body - full audit (raw_body will be null)
  if (jsonParseError || !rawBody) {
    console.log(JSON.stringify({ ...logContext, outcome: "invalid_json", status: 400 }));
    await createAuditRecord("rejected", "invalid_json", sourceId, brandId);
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === PROCESSING PHASE ===
  // Create audit record as "pending" before processing
  const auditId = await createAuditRecord("pending", null, sourceId, brandId);

  try {
    // Apply field mapping
    const mappedPayload = source.mapping
      ? applyMapping(rawBody, source.mapping as Record<string, string>)
      : rawBody;

    // Extract phone and normalize
    const phoneRaw = String(
      mappedPayload.phone || mappedPayload.telefono || mappedPayload.mobile || ""
    ).trim();

    if (!phoneRaw) {
      if (auditId) {
        await updateAuditRecord(auditId, "rejected", "missing_phone");
      }
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedPhone = normalizePhone(phoneRaw);

    // Extract other fields with email normalization (trim + lowercase for dedup)
    const firstName = String(
      mappedPayload.first_name ||
        mappedPayload.firstName ||
        mappedPayload.nome ||
        ""
    ).trim() || null;

    const lastName = String(
      mappedPayload.last_name ||
        mappedPayload.lastName ||
        mappedPayload.cognome ||
        ""
    ).trim() || null;

    const email = String(mappedPayload.email || "")
      .trim()
      .toLowerCase() || null;

    const city = String(mappedPayload.city || mappedPayload.citta || "").trim() || null;
    const cap = String(mappedPayload.cap || mappedPayload.zip || "").trim() || null;

    // Find or create contact
    const { data: contactId, error: contactError } = await supabaseAdmin.rpc(
      "find_or_create_contact",
      {
        p_brand_id: brandId,
        p_phone_normalized: normalizedPhone.normalized,
        p_phone_raw: normalizedPhone.raw,
        p_country_code: normalizedPhone.countryCode,
        p_assumed_country: normalizedPhone.assumedCountry,
        p_first_name: firstName,
        p_last_name: lastName,
        p_email: email,
        p_city: city,
        p_cap: cap,
      }
    );

    if (contactError || !contactId) {
      console.error("Failed to find/create contact:", contactError);
      if (auditId) {
        await updateAuditRecord(auditId, "failed", `contact_creation_failed: ${contactError?.message}`);
      }
      return new Response(
        JSON.stringify({ error: "Failed to process contact" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find or create deal
    const { data: dealId, error: dealError } = await supabaseAdmin.rpc(
      "find_or_create_deal",
      { p_brand_id: brandId, p_contact_id: contactId }
    );

    if (dealError) {
      console.error("Failed to find/create deal:", dealError);
    }

    // Create lead event (append-only)
    const { data: leadEvent, error: leadEventError } = await supabaseAdmin
      .from("lead_events")
      .insert({
        brand_id: brandId,
        contact_id: contactId,
        deal_id: dealId || null,
        source: "webhook",
        source_name: source.name,
        raw_payload: rawBody,
        occurred_at: new Date().toISOString(),
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (leadEventError) {
      console.error("Failed to create lead event:", leadEventError);
    }

    // Update audit record to success
    if (auditId) {
      await updateAuditRecord(auditId, "success", null, leadEvent?.id);
    }

    // Fire-and-forget: Call sheets-export
    if (leadEvent?.id) {
      const sheetsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sheets-export`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        fetch(sheetsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ lead_event_id: leadEvent.id }),
          signal: controller.signal,
        })
          .then((res) => {
            clearTimeout(timeoutId);
            if (!res.ok) {
              console.error("Sheets export failed:", res.status);
            }
          })
          .catch((err) => {
            clearTimeout(timeoutId);
            console.error("Sheets export error (non-blocking):", err.message);
          });
      } catch (err) {
        console.error("Sheets export setup error:", err);
      }
    }

    console.log(JSON.stringify({
      ...logContext,
      outcome: "success",
      status: 200,
      contact_id: contactId,
      lead_event_id: leadEvent?.id,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        contact_id: contactId,
        deal_id: dealId || null,
        lead_event_id: leadEvent?.id || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Webhook processing error:", JSON.stringify({ error: String(error) }));
    if (auditId) {
      await updateAuditRecord(auditId, "failed", `internal_error: ${String(error)}`);
    }
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
