// webhook-ingest — orchestrator only.
// All pure logic (HMAC, auth, dedup, validation, extraction, Systeme.io
// mapping) lives in `../_shared/webhook-ingest/*` and has dedicated unit
// tests. This file is the HTTP boundary + DB I/O + downstream dispatch.
//
// Behavioural contract (preserved 1:1 from previous monolith):
//   - same accepted headers, query params, path shapes
//   - same response status codes / JSON error shapes
//   - same audit / DLQ semantics on `incoming_requests`
//   - same dedup window, same first-touch contact_tracking insert rules
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  computeHmacSha256,
  constantTimeCompare,
  hashSha256,
  verifyHmacSignature,
} from "../_shared/webhook-ingest/hmac.ts";
import {
  checkReplayTimestamp,
  extractApiKey,
  verifyApiKey,
} from "../_shared/webhook-ingest/auth.ts";
import {
  computeFingerprint,
  mapErrorToDlqReason,
} from "../_shared/webhook-ingest/dedup.ts";
import {
  applyMapping,
  filterHeaders,
  validatePayloadSchema,
} from "../_shared/webhook-ingest/validate.ts";
import {
  extractContactDataWithAI,
  normalizePhone,
  tryExtractContactFields,
  tryExtractPhone,
} from "../_shared/webhook-ingest/extract.ts";
import { tryFlattenSystemeIoPayload } from "../_shared/webhook-ingest/mappers/systeme.ts";
import type { PayloadSchema } from "../_shared/webhook-ingest/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-webhook-secret, x-signature, x-timestamp, x-webhook-signature, x-webhook-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


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

  // B07 fix: validate required env vars before use
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("FATAL: Missing required env vars SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response(
      JSON.stringify({ error: "Internal server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Create admin client early for audit logging
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // B04 fix: prefer platform-injected headers over client-controlled ones
  // Priority: cf-connecting-ip (Cloudflare edge) > x-real-ip (reverse proxy) > x-forwarded-for (spoofable)
  const cfIp = req.headers.get("cf-connecting-ip");
  const realIp = req.headers.get("x-real-ip");
  const xffFirst = req.headers.get("x-forwarded-for")?.split(",").shift()?.trim(); // leftmost = original client IP
  const ipAddress = cfIp || realIp || xffFirst || "unknown";
  const ipSource = cfIp ? "cf-connecting-ip" : realIp ? "x-real-ip" : xffFirst ? "x-forwarded-for" : "none";
  const userAgent = req.headers.get("user-agent") || null;
  const filteredHeaders = filterHeaders(req.headers);

  // B03 fix: enforce max body size (256 KB) to prevent DoS via oversized payloads
  const MAX_BODY_BYTES = 256 * 1024;
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ error: "Payload too large", max_bytes: MAX_BODY_BYTES }),
      { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Read body as text first (allows audit even if JSON is invalid)
  let bodyText: string;
  try {
    bodyText = await req.text();
    // B05 FIX: Measure actual byte length, not UTF-16 char count, to prevent
    // multibyte characters bypassing the size limit
    const actualByteLength = new TextEncoder().encode(bodyText).byteLength;
    if (actualByteLength > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({ error: "Payload too large", max_bytes: MAX_BODY_BYTES, actual_bytes: actualByteLength }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
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

  // Extract source ID (and optional inline API key) from URL
  // Supports: /webhook-ingest/{source_id}
  //           /webhook-ingest/{source_id}/{api_key}  (for platforms like systeme.io that don't support custom headers)
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Find the index of "webhook-ingest" to parse relative segments
  const ingestIdx = pathParts.indexOf("webhook-ingest");
  const afterIngest = ingestIdx >= 0 ? pathParts.slice(ingestIdx + 1) : [pathParts[pathParts.length - 1]];
  const sourceId = afterIngest[0] || "";
  const apiKeyFromPath = afterIngest.length > 1 ? afterIngest[1] : null;
  
  // B06: Also check query string for api_key (supported for platforms without custom header support)
  const apiKeyFromQuery = url.searchParams.get("api_key");

  // Google Ads Lead Forms: extract google_key from body as API key
  const apiKeyFromBody = rawBody && typeof rawBody === "object" && typeof (rawBody as Record<string, unknown>).google_key === "string"
    ? (rawBody as Record<string, unknown>).google_key as string
    : null;

  // Generate request ID for structured logging
  const requestId = crypto.randomUUID();
  // E2E correlation: accept caller-provided id (header) or fallback to a fresh UUID.
  // This id is propagated to: structured logs, incoming_requests row, audit_events payload, DLQ entries.
  const incomingCorrelationId = req.headers.get("x-correlation-id") || req.headers.get("x-request-id");
  const correlationId = (incomingCorrelationId && incomingCorrelationId.length <= 128)
    ? incomingCorrelationId
    : crypto.randomUUID();
  const logContext = {
    request_id: requestId,
    correlation_id: correlationId,
    source_id: sourceId,
    ip: ipAddress,
    ip_source: ipSource,
  };

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidUuid = sourceId && sourceId !== "webhook-ingest" && uuidRegex.test(sourceId);

  // DLQ reason mapping
  type DlqReason = 
    | "invalid_json"
    | "mapping_error"
    | "missing_required"
    | "schema_validation_failed"
    | "signature_failed"
    | "rate_limited"
    | "ai_extraction_failed"
    | "contact_creation_failed"
    | "unknown_error";

  function mapErrorToDlqReason(errorMessage: string | null): DlqReason | null {
    if (!errorMessage) return null;
    if (errorMessage === "invalid_json") return "invalid_json";
    if (errorMessage.startsWith("schema_validation_failed")) return "schema_validation_failed";
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
        correlation_id: correlationId,
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
    
    // B09 fix: check update result and log failures explicitly
    const { error: updateError } = await supabaseAdmin
      .from("incoming_requests")
      .update({
        status,
        processed: true,
        error_message: errorMessage,
        lead_event_id: leadEventId,
        dlq_reason: dlqReason,
      })
      .eq("id", auditId);

    if (updateError) {
      console.error(JSON.stringify({
        ...logContext,
        audit_update_failed: true,
        audit_id: auditId,
        target_status: status,
        db_error: updateError.message,
      }));
    }
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

  // 2. Early auth gate — reject requests with NO credentials before source lookup
  //    This prevents source enumeration via 404 responses (B01 fix)
  //    Also accept api_key as query parameter for platforms that don't support custom headers (e.g. systeme.io)
  const hasApiKey = !!(req.headers.get("x-api-key") || apiKeyFromQuery || apiKeyFromPath || apiKeyFromBody);
  const hasSignature = !!req.headers.get("x-signature") || !!req.headers.get("x-webhook-signature");
  if (!hasApiKey && !hasSignature) {
    console.log(JSON.stringify({ ...logContext, outcome: "missing_credentials", status: 401 }));
    await createAuditRecord("rejected", "missing_credentials", sourceId, null);
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 3. Find webhook source to check authentication mode
  const { data: source, error: sourceError } = await supabaseAdmin
    .from("webhook_sources")
    .select("id, name, brand_id, api_key_hash, rate_limit_per_min, mapping, is_active, hmac_enabled, hmac_secret, replay_window_seconds, handler, default_pipeline_stage_id, payload_schema")
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

  // 4. Source inactive - full audit possible
  if (!source.is_active) {
    console.log(JSON.stringify({ ...logContext, outcome: "inactive_source", status: 409 }));
    await createAuditRecord("rejected", "inactive_source", sourceId, brandId);
    return new Response(
      JSON.stringify({ error: "inactive_source", message: "Webhook source is not active" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // B06 FIX: If HMAC is enabled but hmac_secret is missing, reject as misconfigured
  if (source.hmac_enabled && !source.hmac_secret) {
    console.log(JSON.stringify({ ...logContext, outcome: "hmac_misconfigured", status: 500 }));
    await createAuditRecord("rejected", "hmac_enabled_without_secret", sourceId, brandId);
    return new Response(
      JSON.stringify({ error: "Webhook source HMAC is misconfigured (missing secret)" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 5. Authentication: API Key is ONLY required if HMAC is NOT enabled
  //    If HMAC is enabled, authentication is done via signature verification
  //    Accept API key from header OR query parameter (for platforms without custom header support)
  const apiKey = req.headers.get("x-api-key") || apiKeyFromQuery || apiKeyFromPath || apiKeyFromBody;
  
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
  // hmac_enabled + missing secret is already rejected above (early return at line ~560)
  // so here hmac_secret is guaranteed to be non-null
  if (source.hmac_enabled) {
    // Accept both standard header (X-Signature) and systeme.io header (X-Webhook-Signature)
    const signatureHeader = req.headers.get("x-signature") || req.headers.get("x-webhook-signature");
    // Timestamp is optional: present in standard flow, absent in systeme.io flow
    const timestampHeader = req.headers.get("x-timestamp") || req.headers.get("x-webhook-timestamp") || req.headers.get("x-webhook-delivery-attempt-timestamp");
    // systeme.io mode: uses X-Webhook-Signature without timestamp-based signing
    const isSystemeIo = !req.headers.get("x-signature") && !!req.headers.get("x-webhook-signature");

    // 6a. Missing signature header
    if (!signatureHeader) {
      console.log(JSON.stringify({ ...logContext, outcome: "missing_signature", status: 401 }));
      await createAuditRecord("rejected", "missing_signature", sourceId, brandId);
      return new Response(
        JSON.stringify({ error: "missing_signature", message: "X-Signature or X-Webhook-Signature header required for HMAC verification" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6b-6d: Timestamp checks only for non-systeme.io flows
    let timestamp: number | null = null;
    if (!isSystemeIo) {
      if (!timestampHeader) {
        console.log(JSON.stringify({ ...logContext, outcome: "missing_timestamp", status: 401 }));
        await createAuditRecord("rejected", "missing_timestamp", sourceId, brandId);
        return new Response(
          JSON.stringify({ error: "missing_timestamp", message: "X-Timestamp header required for HMAC verification" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      timestamp = parseInt(timestampHeader, 10);
      if (isNaN(timestamp)) {
        console.log(JSON.stringify({ ...logContext, outcome: "invalid_timestamp_format", status: 400 }));
        await createAuditRecord("rejected", "invalid_timestamp_format", sourceId, brandId);
        return new Response(
          JSON.stringify({ error: "invalid_timestamp", message: "X-Timestamp must be Unix timestamp in seconds" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Anti-replay check: timestamp within window
      const nowSeconds = Math.floor(Date.now() / 1000);
      const replayWindow = source.replay_window_seconds || 300;
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
    }

    // 6e. Verify HMAC signature
    // systeme.io: signs raw payload body, signature is plain hex (no sha256= prefix)
    // Standard: signature format sha256=<hex>, message is {timestamp}.{body}
    let providedSignature: string;
    let expectedSignature: string;

    if (isSystemeIo) {
      // systeme.io signs the raw JSON body directly with HMAC-SHA256
      providedSignature = signatureHeader.toLowerCase();
      expectedSignature = await computeHmacSha256(source.hmac_secret, bodyText);
    } else {
      const signatureMatch = signatureHeader.match(/^sha256=([a-f0-9]{64})$/i);
      if (!signatureMatch) {
        console.log(JSON.stringify({ ...logContext, outcome: "invalid_signature_format", status: 400 }));
        await createAuditRecord("rejected", "invalid_signature_format", sourceId, brandId);
        return new Response(
          JSON.stringify({ error: "invalid_signature", message: "X-Signature must be in format: sha256=<hex>" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      providedSignature = signatureMatch[1].toLowerCase();
      // Standard flow: sign {timestamp}.{body}
      const signedMessage = `${timestampHeader}.${bodyText}`;
      expectedSignature = await computeHmacSha256(source.hmac_secret, signedMessage);
    }

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

  // B08 fix: validate JSON BEFORE consuming rate-limit token
  // This prevents malformed requests from exhausting the source's quota
  if (jsonParseError || !rawBody) {
    console.log(JSON.stringify({ ...logContext, outcome: "invalid_json", status: 400 }));
    await createAuditRecord("rejected", "invalid_json", sourceId, brandId);
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // B09: Per-source payload schema validation (optional)
  // Runs BEFORE dedup/rate-limit so malformed payloads don't burn quota or dedup slots
  if (source.payload_schema) {
    const validationResult = validatePayloadSchema(
      rawBody as Record<string, unknown>,
      source.payload_schema as PayloadSchema,
    );
    if (!validationResult.valid) {
      const errorDetails = validationResult.errors.join("; ");
      console.log(JSON.stringify({
        ...logContext,
        outcome: "schema_validation_failed",
        status: 422,
        errors: validationResult.errors,
      }));
      await createAuditRecord(
        "rejected",
        `schema_validation_failed: ${errorDetails}`,
        sourceId,
        brandId,
      );
      return new Response(
        JSON.stringify({
          error: "schema_validation_failed",
          message: "Payload does not match the expected schema",
          details: validationResult.errors,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // B10: Replay/duplicate detection (idempotency)
  // Computes a fingerprint of the request and rejects if the same fingerprint
  // was already processed within the source's replay_window_seconds.
  // Fingerprint priority:
  //   1. HMAC signature (when present) — strongest, includes timestamp+body
  //   2. SHA-256 of bodyText — works for any source
  // Runs BEFORE rate-limit so retries don't burn quota.
  try {
    const replayWindow = source.replay_window_seconds || 300;
    const sigHeader =
      req.headers.get("x-signature") ||
      req.headers.get("x-webhook-signature") ||
      "";
    const fingerprintInput = sigHeader
      ? `sig:${sigHeader}`
      : `body:${await hashSha256(bodyText)}`;
    const fingerprint = fingerprintInput.slice(0, 256);

    const expiresAt = new Date(Date.now() + replayWindow * 1000).toISOString();

    const { error: dedupError } = await supabaseAdmin
      .from("webhook_request_dedup")
      .insert({
        source_id: source.id,
        fingerprint,
        expires_at: expiresAt,
      });

    if (dedupError) {
      // 23505 = unique_violation → duplicate request within window
      if (dedupError.code === "23505") {
        console.log(JSON.stringify({
          ...logContext,
          outcome: "duplicate_request",
          status: 409,
          fingerprint_prefix: fingerprint.slice(0, 16),
        }));
        await createAuditRecord(
          "rejected",
          `duplicate_request: fingerprint already seen within ${replayWindow}s window`,
          sourceId,
          brandId,
        );
        return new Response(
          JSON.stringify({
            error: "duplicate_request",
            message: `Identical request already processed within the last ${replayWindow} seconds`,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      // Non-fatal: log and continue (dedup is defense-in-depth, not a hard gate)
      console.error(JSON.stringify({
        ...logContext,
        warning: "dedup_insert_failed",
        db_error: dedupError.message,
      }));
    }
  } catch (e) {
    console.error(JSON.stringify({
      ...logContext,
      warning: "dedup_check_exception",
      error: String(e),
    }));
    // Continue — dedup failure must not block legitimate traffic
  }

  // 8. Rate limit - full audit (only well-formed and schema-valid requests consume tokens)
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

  // Create audit record as "pending" before processing or forwarding
  const auditId = await createAuditRecord("pending", null, sourceId, brandId);

  // === HANDLER ROUTING: forward to specialized edge functions ===
  if (source.handler === "keplero") {
    console.log(JSON.stringify({ ...logContext, action: "forwarding_to_keplero_webhook", brand_id: brandId }));
    
    // Resolve brand slug for keplero-webhook
    const { data: brandData } = await supabaseAdmin
      .from("brands")
      .select("slug")
      .eq("id", brandId)
      .single();
    
    const brandSlug = brandData?.slug || "";
    const kepleroUrl = `${supabaseUrl}/functions/v1/keplero-webhook?brand=${brandSlug}`;
    // Use dedicated internal service token for inter-function auth (never pass service role key in headers)
    const internalToken = Deno.env.get("INTERNAL_SERVICE_TOKEN") || "";
    
    try {
      const kepleroResponse = await fetch(kepleroUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Forward": internalToken,
        },
        body: bodyText,
      });
      
      const kepleroText = await kepleroResponse.text();
      let kepleroResult: Record<string, unknown>;
      try {
        kepleroResult = JSON.parse(kepleroText);
      } catch {
        kepleroResult = { error: kepleroText, raw: true };
      }
      
      if (auditId) {
        await updateAuditRecord(
          auditId,
          kepleroResponse.ok ? "success" : "failed",
          kepleroResponse.ok ? null : `keplero_handler_error: ${JSON.stringify(kepleroResult)}`,
          kepleroResult?.lead_event_id || null
        );
      }
      
      console.log(JSON.stringify({
        ...logContext,
        outcome: kepleroResponse.ok ? "keplero_forwarded_success" : "keplero_forwarded_error",
        status: kepleroResponse.status,
        keplero_result: kepleroResult,
      }));
      
      return new Response(JSON.stringify(kepleroResult), {
        status: kepleroResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[webhook-ingest] Keplero forwarding failed:", err);
      if (auditId) await updateAuditRecord(auditId, "failed", `keplero_forward_error: ${String(err)}`);
      return new Response(
        JSON.stringify({ error: "Handler forwarding failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // === STANDARD PROCESSING PHASE ===

  try {
    // Apply field mapping (flat)
    const mappedPayload = source.mapping
      ? applyMapping(rawBody, source.mapping as Record<string, string>)
      : rawBody;

    // Try to flatten Systeme.io nested payload BEFORE standard extraction
    // This avoids falling back to AI for a well-known, parseable format
    const systemeFlat = tryFlattenSystemeIoPayload(mappedPayload);
    const effectivePayload = systemeFlat ?? mappedPayload;
    const isSystemePayload = systemeFlat !== null;
    if (isSystemePayload) {
      console.log(JSON.stringify({ ...logContext, action: "systeme_io_payload_flattened" }));
    }

    // Try to extract contact data from standard fields first
    let phoneRaw = tryExtractPhone(effectivePayload);
    let extractedFields = tryExtractContactFields(effectivePayload);
    let usedAI = false;

    // If no phone found in standard fields, use AI to extract
    if (!phoneRaw) {
      console.log(JSON.stringify({ ...logContext, action: "using_ai_extraction" }));
      
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (lovableApiKey) {
        const aiResult = await extractContactDataWithAI(effectivePayload, lovableApiKey);
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
            address: extractedFields.address || aiResult.address,
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
        JSON.stringify({ error: "Phone number is required" }),
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
    const address = extractedFields.address || null;

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
        p_lead_message: extractedFields.notes || null,
        p_address: address,
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

    // Save quiz answers if present in payload
    const quizAnswers = effectivePayload.answers;
    if (quizAnswers && typeof quizAnswers === "object" && !Array.isArray(quizAnswers)) {
      await supabaseAdmin
        .from("contacts")
        .update({ quiz_answers: quizAnswers })
        .eq("id", contactId);
      console.log(JSON.stringify({ ...logContext, action: "quiz_answers_saved", contact_id: contactId }));
    }

    // Notes are now passed to find_or_create_contact via p_lead_message

    // Extract and save tracking parameters for CAPI attribution
    // Bug fix: use effectivePayload (post-flatten) not mappedPayload (pre-flatten)
    // so UTM/fbp params embedded in systeme.io fields are also captured
    const trackingParams = {
      fbp: (effectivePayload._fbp || effectivePayload.fbp || null) as string | null,
      fbc: (effectivePayload._fbc || effectivePayload.fbc || null) as string | null,
      gclid: (effectivePayload.gclid || null) as string | null,
      wbraid: (effectivePayload.wbraid || null) as string | null,
      gbraid: (effectivePayload.gbraid || null) as string | null,
      utm_source: (effectivePayload.utm_source || null) as string | null,
      utm_medium: (effectivePayload.utm_medium || null) as string | null,
      utm_campaign: (effectivePayload.utm_campaign || null) as string | null,
      utm_content: (effectivePayload.utm_content || null) as string | null,
      utm_term: (effectivePayload.utm_term || null) as string | null,
    };

    const hasAnyTracking = Object.values(trackingParams).some(v => v !== null);
    if (hasAnyTracking) {
      try {
        const now = new Date().toISOString();
        // B04 fix: insert first-touch row only if none exists (DO NOTHING on conflict).
        // first_touch_at is set ONLY here and never overwritten.
        const { error: insertErr } = await supabaseAdmin
          .from("contact_tracking")
          .insert({
            brand_id: brandId,
            contact_id: contactId,
            ...trackingParams,
            client_ip: ipAddress !== "unknown" ? ipAddress : null,
            client_user_agent: userAgent,
            first_touch_source: "webhook-ingest",
            first_touch_at: now,
            last_touch_at: now,
          })
          .select("contact_id")
          .maybeSingle();

        // 23505 = unique_violation → row already exists, first_touch preserved
        if (insertErr && !insertErr.code?.startsWith("23505")) {
          console.error("contact_tracking insert error:", insertErr.message);
        }

        // Update last-touch fields on every hit (including first)
        await supabaseAdmin
          .from("contact_tracking")
          .update({
            last_touch_at: now,
            client_ip: ipAddress !== "unknown" ? ipAddress : null,
            client_user_agent: userAgent,
            ...trackingParams,
          })
          .eq("contact_id", contactId);
      } catch (trackingErr) {
        console.error("Failed to save tracking params (non-blocking):", trackingErr);
      }
    }

    // Check contact status for opt-out handling
    const { data: contactData } = await supabaseAdmin
      .from("contacts")
      .select("status")
      .eq("id", contactId)
      .single();

    const isOptedOut = contactData?.status === "archived";

    // === DEDUPLICATION CHECK ===
    // Moved BEFORE find_or_create_deal to avoid a useless DB call for duplicates.
    // Window is 300s (5 min) to handle Systeme.io which sends tags one-by-one with up to ~2min gap.
    // We use contactId (not email) because email may be nested in complex payloads.
    const DEDUP_WINDOW_SECONDS = 300;
    let isDuplicate = false;
    let firstEventId: string | null = null;

    if (contactId && !isOptedOut) {
      const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_SECONDS * 1000).toISOString();
      const { data: recentEvents } = await supabaseAdmin
        .from("lead_events")
        .select("id, raw_payload")
        .eq("contact_id", contactId)
        .eq("source_name", source.name)
        .gte("received_at", dedupCutoff)
        .eq("archived", false)
        .order("received_at", { ascending: true })
        .limit(1);

      if (recentEvents && recentEvents.length > 0) {
        isDuplicate = true;
        firstEventId = recentEvents[0].id;

        // === TAG AGGREGATION: Systeme.io sends tags as separate webhooks. 
        // Instead of discarding duplicates, we append the tag to the first event's lead_message.
        if (isSystemePayload && effectivePayload._systeme_tag) {
          const newTag = String(effectivePayload._systeme_tag);
          // Append tag to the contact's lead_message to preserve all tag info
          const { data: currentContact } = await supabaseAdmin
            .from("contacts")
            .select("lead_message")
            .eq("id", contactId)
            .single();
          
          const currentMsg = currentContact?.lead_message || "";
          const tagLabel = `Tags: ${newTag}`;
          
          // Only append if tag not already present
          if (!currentMsg.includes(newTag)) {
            const updatedMsg = currentMsg 
              ? `${currentMsg}; ${tagLabel}` 
              : tagLabel;
            await supabaseAdmin
              .from("contacts")
              .update({ lead_message: updatedMsg })
              .eq("id", contactId);
            console.log(JSON.stringify({ ...logContext, action: "systeme_tag_appended", tag: newTag, first_event_id: firstEventId }));
          }
        }

        console.log(JSON.stringify({
          ...logContext,
          outcome: "duplicate_suppressed",
          contact_id: contactId,
          source_name: source.name,
          existing_event_id: firstEventId,
          dedup_window_seconds: DEDUP_WINDOW_SECONDS,
        }));
      }
    }

    // Find or create deal (SKIP if opted out OR duplicate - no unnecessary DB calls)
    let dealId: string | null = null;
    if (!isOptedOut && !isDuplicate) {
      const { data: dealResult, error: dealError } = await supabaseAdmin.rpc(
        "find_or_create_deal",
        { 
          p_brand_id: brandId, 
          p_contact_id: contactId,
          p_stage_id: source.default_pipeline_stage_id || null,
        }
      );

      if (dealError) {
        console.error("Failed to find/create deal:", dealError);
      } else {
        dealId = dealResult;
      }
    } else if (!isOptedOut && isDuplicate) {
      // Retrieve existing deal_id from the first event to keep the lead_event consistent
      const { data: firstEvent } = await supabaseAdmin
        .from("lead_events")
        .select("deal_id")
        .eq("id", firstEventId)
        .maybeSingle();
      dealId = firstEvent?.deal_id || null;
    }

    // Create lead event (ALWAYS append-only, but mark archived if opt-out or duplicate)
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
        archived: isOptedOut || isDuplicate, // Auto-archive if opted out OR duplicate
      })
      .select("id")
      .single();

    if (leadEventError) {
      console.error("Failed to create lead event:", leadEventError);
      if (auditId) {
        await updateAuditRecord(auditId, "failed", `lead_event_failed: ${leadEventError.message}`);
      }
      return new Response(
        JSON.stringify({ success: false, error: "Failed to process lead event" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update audit record: duplicates are "rejected" (not success) so dashboards are accurate
    if (auditId) {
      await updateAuditRecord(
        auditId,
        isDuplicate ? "rejected" : "success",
        isDuplicate ? "duplicate_suppressed" : null,
        leadEvent?.id
      );
    }

    // Fire-and-forget downstream integrations ONLY for non-duplicate, non-archived leads
    if (leadEvent?.id && !isDuplicate && !isOptedOut) {
      // Google Sheets export
      const sheetsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sheets-export`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        // SECURITY: never propagate the service-role key as Bearer between
        // edge functions. Use a dedicated internal token (same pattern as
        // keplero-webhook → INTERNAL_SERVICE_TOKEN).
        const internalToken =
          Deno.env.get("INTERNAL_SERVICE_TOKEN") ||
          Deno.env.get("SHEETS_INTERNAL_TOKEN") ||
          "";
        fetch(sheetsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Token": internalToken,
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
    } else if (isDuplicate) {
      console.log(JSON.stringify({
        ...logContext,
        outcome: "downstream_skipped",
        reason: "duplicate",
        lead_event_id: leadEvent?.id,
      }));
    }

    console.log(JSON.stringify({
      ...logContext,
      outcome: isDuplicate ? "duplicate_suppressed" : "success",
      status: 200,
      contact_id: contactId,
      lead_event_id: leadEvent?.id,
      archived: isOptedOut || isDuplicate,
      is_duplicate: isDuplicate,
      hmac_enabled: source.hmac_enabled,
      used_ai_extraction: usedAI,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        contact_id: contactId,
        deal_id: dealId,
        lead_event_id: leadEvent?.id || null,
        archived: isOptedOut || isDuplicate,
        duplicate: isDuplicate,
        contact_status: contactData?.status || "new",
        used_ai_extraction: usedAI,
        correlation_id: correlationId,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Correlation-Id": correlationId,
        },
      }
    );

  } catch (error) {
    console.error("Webhook processing error:", JSON.stringify({ ...logContext, error: String(error) }));
    if (auditId) {
      await updateAuditRecord(auditId, "failed", `internal_error: ${String(error)}`);
    }
    return new Response(
      JSON.stringify({ error: "Internal server error", correlation_id: correlationId }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Correlation-Id": correlationId,
        },
      }
    );
  }
});
