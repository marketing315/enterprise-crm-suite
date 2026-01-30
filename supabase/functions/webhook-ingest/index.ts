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

// AI Gateway for extracting contact data from unstructured payloads
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

interface ExtractedContactData {
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  city: string | null;
  cap: string | null;
  notes: string | null;
}

const AI_EXTRACTION_PROMPT = `Sei un estrattore di dati contatto. Analizza il payload JSON e estrai le informazioni del contatto.

REGOLE:
- Cerca campi che contengono: telefono, nome, cognome, email, città, CAP
- I campi possono avere nomi diversi (phone, telefono, mobile, cellulare, name, nome, ecc.)
- Se non trovi un campo, restituisci null per quel campo
- Il telefono è OBBLIGATORIO: cercalo in qualsiasi campo che possa contenerlo
- Se trovi testo libero, cerca di estrarre i dati da lì
- Per le note, includi qualsiasi informazione aggiuntiva rilevante (messaggio, richiesta, ecc.)

Rispondi SOLO con JSON valido nel formato:
{
  "phone": "numero telefono o null",
  "first_name": "nome o null",
  "last_name": "cognome o null", 
  "email": "email o null",
  "city": "città o null",
  "cap": "CAP o null",
  "notes": "note/messaggio o null"
}`;

async function extractContactDataWithAI(
  payload: Record<string, unknown>,
  apiKey: string
): Promise<ExtractedContactData | null> {
  try {
    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: AI_EXTRACTION_PROMPT },
          { 
            role: "user", 
            content: `Estrai i dati contatto da questo payload:\n${JSON.stringify(payload, null, 2)}` 
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error("No content in AI response");
      return null;
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }

    const result = JSON.parse(jsonStr.trim()) as ExtractedContactData;
    console.log("AI extracted contact data:", JSON.stringify(result));
    return result;
  } catch (error) {
    console.error("AI extraction error:", error);
    return null;
  }
}

// Try to extract phone from payload using common field names
function tryExtractPhone(payload: Record<string, unknown>): string | null {
  const phoneFields = [
    "phone", "telefono", "mobile", "cellulare", "tel", 
    "Phone", "Telefono", "Mobile", "Cellulare", "Tel",
    "phone_number", "phoneNumber", "numero_telefono", "numeroTelefono",
    "contact_phone", "contactPhone"
  ];
  
  for (const field of phoneFields) {
    const value = payload[field];
    if (value && typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

// Try to extract other contact fields from payload
function tryExtractContactFields(payload: Record<string, unknown>): Partial<ExtractedContactData> {
  const result: Partial<ExtractedContactData> = {};
  
  // First name
  const firstNameFields = ["first_name", "firstName", "nome", "name", "Nome", "Name"];
  for (const field of firstNameFields) {
    const value = payload[field];
    if (value && typeof value === "string" && value.trim()) {
      result.first_name = value.trim();
      break;
    }
  }
  
  // Last name
  const lastNameFields = ["last_name", "lastName", "cognome", "surname", "Cognome", "Surname"];
  for (const field of lastNameFields) {
    const value = payload[field];
    if (value && typeof value === "string" && value.trim()) {
      result.last_name = value.trim();
      break;
    }
  }
  
  // Email
  const emailFields = ["email", "Email", "e-mail", "mail"];
  for (const field of emailFields) {
    const value = payload[field];
    if (value && typeof value === "string" && value.trim()) {
      result.email = value.trim().toLowerCase();
      break;
    }
  }
  
  // City
  const cityFields = ["city", "citta", "città", "City", "Citta"];
  for (const field of cityFields) {
    const value = payload[field];
    if (value && typeof value === "string" && value.trim()) {
      result.city = value.trim();
      break;
    }
  }
  
  // CAP
  const capFields = ["cap", "zip", "postal_code", "postalCode", "CAP", "Zip"];
  for (const field of capFields) {
    const value = payload[field];
    if (value && typeof value === "string" && value.trim()) {
      result.cap = value.trim();
      break;
    }
  }
  
  // Notes/Message
  const notesFields = ["notes", "note", "message", "messaggio", "richiesta", "Notes", "Message"];
  for (const field of notesFields) {
    const value = payload[field];
    if (value && typeof value === "string" && value.trim()) {
      result.notes = value.trim();
      break;
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

  // DLQ reason mapping
  type DlqReason = 
    | "invalid_json"
    | "mapping_error"
    | "missing_required"
    | "signature_failed"
    | "rate_limited"
    | "ai_extraction_failed"
    | "contact_creation_failed"
    | "unknown_error";

  function mapErrorToDlqReason(errorMessage: string | null): DlqReason | null {
    if (!errorMessage) return null;
    if (errorMessage === "invalid_json") return "invalid_json";
    if (errorMessage.includes("signature") || errorMessage === "invalid_signature" || errorMessage === "invalid_signature_format") return "signature_failed";
    if (errorMessage === "rate_limited") return "rate_limited";
    if (errorMessage.includes("mapping")) return "mapping_error";
    if (errorMessage.includes("ai_extraction") || errorMessage === "phone_required") return "ai_extraction_failed";
    if (errorMessage.includes("contact_creation")) return "contact_creation_failed";
    if (errorMessage === "missing_phone" || errorMessage.includes("missing_required")) return "missing_required";
    return null; // Don't set dlq_reason for auth failures like invalid_api_key, source_not_found, etc.
  }

  // Helper to create audit record with DLQ support
  async function createAuditRecord(
    status: "pending" | "success" | "rejected" | "failed",
    errorMessage: string | null,
    resolvedSourceId: string | null,
    resolvedBrandId: string | null,
    leadEventId: string | null = null
  ): Promise<string | null> {
    const dlqReason = mapErrorToDlqReason(errorMessage);
    
    const { data, error } = await supabaseAdmin
      .from("incoming_requests")
      .insert({
        source_id: resolvedSourceId,
        brand_id: resolvedBrandId,
        raw_body: rawBody, // null if JSON invalid
        raw_body_text: jsonParseError ? bodyText : null, // Save raw text only if JSON parse failed
        headers: filteredHeaders,
        ip_address: ipAddress,
        user_agent: userAgent,
        status,
        processed: status !== "pending",
        error_message: errorMessage,
        lead_event_id: leadEventId,
        dlq_reason: dlqReason,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create audit record:", error);
      return null;
    }
    return data?.id || null;
  }

  // Helper to update existing audit record with DLQ support
  async function updateAuditRecord(
    auditId: string,
    status: "success" | "rejected" | "failed",
    errorMessage: string | null,
    leadEventId: string | null = null
  ) {
    const dlqReason = mapErrorToDlqReason(errorMessage);
    
    await supabaseAdmin
      .from("incoming_requests")
      .update({
        status,
        processed: true,
        error_message: errorMessage,
        lead_event_id: leadEventId,
        dlq_reason: dlqReason,
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

  // 2. Find webhook source first to check authentication mode
  const { data: source, error: sourceError } = await supabaseAdmin
    .from("webhook_sources")
    .select("id, name, brand_id, api_key_hash, rate_limit_per_min, mapping, is_active, hmac_enabled, hmac_secret, replay_window_seconds")
    .eq("id", sourceId)
    .maybeSingle();

  // 3. Source not found - audit with source_id but no brand_id
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

  // 4. Source inactive - full audit possible
  if (!source.is_active) {
    console.log(JSON.stringify({ ...logContext, outcome: "inactive_source", status: 409 }));
    await createAuditRecord("rejected", "inactive_source", sourceId, brandId);
    return new Response(
      JSON.stringify({ error: "inactive_source", message: "Webhook source is not active" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 5. Authentication: API Key is ONLY required if HMAC is NOT enabled
  //    If HMAC is enabled, authentication is done via signature verification
  const apiKey = req.headers.get("x-api-key");
  
  if (!source.hmac_enabled) {
    // HMAC disabled: require API key
    if (!apiKey) {
      console.log(JSON.stringify({ ...logContext, outcome: "missing_api_key", status: 401 }));
      await createAuditRecord("rejected", "missing_api_key", sourceId, brandId);
      return new Response(JSON.stringify({ error: "Missing X-API-Key header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isValidKey = await verifyApiKey(apiKey, source.api_key_hash);
    if (!isValidKey) {
      console.log(JSON.stringify({ ...logContext, outcome: "invalid_api_key", status: 401 }));
      await createAuditRecord("rejected", "invalid_api_key", sourceId, brandId);
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  // If HMAC is enabled, API key is optional - authentication will be done via HMAC signature below

  // 6. HMAC Signature verification (if enabled for this source)
  // Standard HMAC: caller sends X-Signature and X-Timestamp, server verifies using stored secret
  if (source.hmac_enabled && source.hmac_secret) {
    const signatureHeader = req.headers.get("x-signature");
    const timestampHeader = req.headers.get("x-timestamp");

    // 6a. Missing signature header
    if (!signatureHeader) {
      console.log(JSON.stringify({ ...logContext, outcome: "missing_signature", status: 401 }));
      await createAuditRecord("rejected", "missing_signature", sourceId, brandId);
      return new Response(
        JSON.stringify({ error: "missing_signature", message: "X-Signature header required for HMAC verification" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6b. Missing timestamp header
    if (!timestampHeader) {
      console.log(JSON.stringify({ ...logContext, outcome: "missing_timestamp", status: 401 }));
      await createAuditRecord("rejected", "missing_timestamp", sourceId, brandId);
      return new Response(
        JSON.stringify({ error: "missing_timestamp", message: "X-Timestamp header required for HMAC verification" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6c. Validate timestamp format (Unix seconds)
    const timestamp = parseInt(timestampHeader, 10);
    if (isNaN(timestamp)) {
      console.log(JSON.stringify({ ...logContext, outcome: "invalid_timestamp_format", status: 400 }));
      await createAuditRecord("rejected", "invalid_timestamp_format", sourceId, brandId);
      return new Response(
        JSON.stringify({ error: "invalid_timestamp", message: "X-Timestamp must be Unix timestamp in seconds" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6d. Anti-replay check: timestamp within window
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

    // 6e. Verify HMAC signature
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
    
    // Compute expected signature using the stored secret
    const signedMessage = `${timestampHeader}.${bodyText}`;
    const expectedSignature = await computeHmacSha256(source.hmac_secret, signedMessage);

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

    // Try to extract contact data from standard fields first
    let phoneRaw = tryExtractPhone(mappedPayload);
    let extractedFields = tryExtractContactFields(mappedPayload);
    let usedAI = false;

    // If no phone found in standard fields, use AI to extract
    if (!phoneRaw) {
      console.log(JSON.stringify({ ...logContext, action: "using_ai_extraction" }));
      
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (lovableApiKey) {
        const aiResult = await extractContactDataWithAI(mappedPayload, lovableApiKey);
        if (aiResult) {
          usedAI = true;
          phoneRaw = aiResult.phone;
          // Merge AI results with any existing extracted fields (AI fills gaps)
          extractedFields = {
            first_name: extractedFields.first_name || aiResult.first_name,
            last_name: extractedFields.last_name || aiResult.last_name,
            email: extractedFields.email || aiResult.email,
            city: extractedFields.city || aiResult.city,
            cap: extractedFields.cap || aiResult.cap,
            notes: extractedFields.notes || aiResult.notes,
          };
        }
      } else {
        console.warn("LOVABLE_API_KEY not configured, cannot use AI extraction");
      }
    }

    // Still no phone after AI extraction
    if (!phoneRaw) {
      if (auditId) {
        await updateAuditRecord(auditId, "rejected", "missing_phone");
      }
      return new Response(
        JSON.stringify({ error: "Phone number is required and could not be extracted from payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedPhone = normalizePhone(phoneRaw);

    // Use extracted fields
    const firstName = extractedFields.first_name || null;
    const lastName = extractedFields.last_name || null;
    const email = extractedFields.email || null;
    const city = extractedFields.city || null;
    const cap = extractedFields.cap || null;

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

    // Update contact notes if AI extracted any
    if (extractedFields.notes) {
      await supabaseAdmin
        .from("contacts")
        .update({ notes: extractedFields.notes })
        .eq("id", contactId)
        .is("notes", null); // Only update if notes are empty
    }

    // Check contact status for opt-out handling
    const { data: contactData } = await supabaseAdmin
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
        archived: isOptedOut, // Auto-archive if opted out
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
      used_ai_extraction: usedAI,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        contact_id: contactId,
        deal_id: dealId,
        lead_event_id: leadEvent?.id || null,
        archived: isOptedOut,
        contact_status: contactData?.status || "new",
        used_ai_extraction: usedAI,
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
