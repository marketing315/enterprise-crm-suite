import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-webhook-secret, x-signature, x-timestamp",
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
  // Excluded: authorization, cookie, x-api-key, x-signature (credentials)
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

// Hash a string using SHA-256 (for API key and HMAC secret verification)
async function hashSha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compute HMAC-SHA256 signature
async function computeHmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time string comparison to prevent timing attacks
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Verify API key using constant-time comparison
async function verifyApiKey(
  providedKey: string,
  storedHash: string
): Promise<boolean> {
  const providedHash = await hashSha256(providedKey);
  return constantTimeCompare(providedHash, storedHash);
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

  // 3. Find webhook source (include HMAC fields)
  const { data: source, error: sourceError } = await supabaseAdmin
    .from("webhook_sources")
    .select("id, name, brand_id, api_key_hash, rate_limit_per_min, mapping, is_active, hmac_enabled, hmac_secret_hash, replay_window_seconds")
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

  // 7. HMAC Signature verification (if enabled for this source)
  if (source.hmac_enabled && source.hmac_secret_hash) {
    const signatureHeader = req.headers.get("x-signature");
    const timestampHeader = req.headers.get("x-timestamp");
    const webhookSecret = req.headers.get("x-webhook-secret");

    // 7a. Missing webhook secret header
    if (!webhookSecret) {
      console.log(JSON.stringify({ ...logContext, outcome: "missing_webhook_secret", status: 401 }));
      await createAuditRecord("rejected", "missing_webhook_secret", sourceId, brandId);
      return new Response(
        JSON.stringify({ error: "missing_webhook_secret", message: "X-Webhook-Secret header required for this source" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7b. Verify webhook secret matches stored hash
    const providedSecretHash = await hashSha256(webhookSecret);
    if (!constantTimeCompare(providedSecretHash, source.hmac_secret_hash)) {
      console.log(JSON.stringify({ ...logContext, outcome: "invalid_webhook_secret", status: 401 }));
      await createAuditRecord("rejected", "invalid_webhook_secret", sourceId, brandId);
      return new Response(
        JSON.stringify({ error: "invalid_webhook_secret", message: "Invalid webhook secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7c. Missing signature header
    if (!signatureHeader) {
      console.log(JSON.stringify({ ...logContext, outcome: "missing_signature", status: 401 }));
      await createAuditRecord("rejected", "missing_signature", sourceId, brandId);
      return new Response(
        JSON.stringify({ error: "missing_signature", message: "X-Signature header required for HMAC verification" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7d. Missing timestamp header
    if (!timestampHeader) {
      console.log(JSON.stringify({ ...logContext, outcome: "missing_timestamp", status: 401 }));
      await createAuditRecord("rejected", "missing_timestamp", sourceId, brandId);
      return new Response(
        JSON.stringify({ error: "missing_timestamp", message: "X-Timestamp header required for HMAC verification" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7e. Validate timestamp format (Unix seconds)
    const timestamp = parseInt(timestampHeader, 10);
    if (isNaN(timestamp)) {
      console.log(JSON.stringify({ ...logContext, outcome: "invalid_timestamp_format", status: 400 }));
      await createAuditRecord("rejected", "invalid_timestamp_format", sourceId, brandId);
      return new Response(
        JSON.stringify({ error: "invalid_timestamp", message: "X-Timestamp must be Unix timestamp in seconds" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7f. Anti-replay check: timestamp within window
    const nowSeconds = Math.floor(Date.now() / 1000);
    const replayWindow = source.replay_window_seconds || 300; // Default 5 minutes
    const timeDiff = Math.abs(nowSeconds - timestamp);

    if (timeDiff > replayWindow) {
      console.log(JSON.stringify({ 
        ...logContext, 
        outcome: "replay_detected", 
        status: 401,
        timestamp,
        now: nowSeconds,
        diff: timeDiff,
        window: replayWindow
      }));
      await createAuditRecord("rejected", `replay_detected: timestamp=${timestamp}, now=${nowSeconds}, diff=${timeDiff}s, window=${replayWindow}s`, sourceId, brandId);
      return new Response(
        JSON.stringify({ 
          error: "replay_detected", 
          message: `Request timestamp outside allowed window (${replayWindow}s)` 
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7g. Verify HMAC signature
    // Signature format: sha256=<hex>
    // Message format: {timestamp}.{body}
    const signatureMatch = signatureHeader.match(/^sha256=([a-f0-9]+)$/i);
    if (!signatureMatch) {
      console.log(JSON.stringify({ ...logContext, outcome: "invalid_signature_format", status: 400 }));
      await createAuditRecord("rejected", "invalid_signature_format", sourceId, brandId);
      return new Response(
        JSON.stringify({ error: "invalid_signature", message: "X-Signature must be in format: sha256=<hex>" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const providedSignature = signatureMatch[1].toLowerCase();
    
    // Compute expected signature using the webhook secret
    const signedMessage = `${timestampHeader}.${bodyText}`;
    const expectedSignature = await computeHmacSha256(webhookSecret, signedMessage);

    if (!constantTimeCompare(providedSignature, expectedSignature)) {
      console.log(JSON.stringify({ ...logContext, outcome: "invalid_signature", status: 401 }));
      await createAuditRecord("rejected", "invalid_signature", sourceId, brandId);
      return new Response(
        JSON.stringify({ error: "invalid_signature", message: "HMAC signature verification failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(JSON.stringify({ ...logContext, hmac_verified: true, timestamp }));
  }

  // 8. Rate limit - full audit
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

  // 9. Invalid JSON body - full audit (raw_body will be null)
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

    // STEP 2B: Check contact status for opt-out handling
    const { data: contactData, error: contactFetchError } = await supabaseAdmin
      .from("contacts")
      .select("status")
      .eq("id", contactId)
      .single();

    const isOptedOut = contactData?.status === "archived";
    
    // Find or create deal (SKIP if opted out - no automatic deal operations)
    let dealId: string | null = null;
    if (!isOptedOut) {
      const { data: dealResult, error: dealError } = await supabaseAdmin.rpc(
        "find_or_create_deal",
        { p_brand_id: brandId, p_contact_id: contactId }
      );

      if (dealError) {
        console.error("Failed to find/create deal:", dealError);
      } else {
        dealId = dealResult;
      }
    }

    // Create lead event (ALWAYS append-only, but mark archived if opt-out)
    const { data: leadEvent, error: leadEventError } = await supabaseAdmin
      .from("lead_events")
      .insert({
        brand_id: brandId,
        contact_id: contactId,
        deal_id: dealId,
        source: "webhook",
        source_name: source.name,
        raw_payload: rawBody,
        occurred_at: new Date().toISOString(),
        received_at: new Date().toISOString(),
        archived: isOptedOut, // STEP 2B: Auto-archive if opted out
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
      archived: isOptedOut,
      hmac_enabled: source.hmac_enabled,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        contact_id: contactId,
        deal_id: dealId,
        lead_event_id: leadEvent?.id || null,
        archived: isOptedOut,
        contact_status: contactData?.status || "new",
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
