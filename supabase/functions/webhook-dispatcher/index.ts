import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BATCH_SIZE = 50;
const PARALLEL_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 10000;
const WALL_TIME_LIMIT_MS = 25000; // Stop processing after 25s to avoid cron overlap
const USER_AGENT = "ralphloop-webhooks/1.0";

// Circuit breaker: after N consecutive failures (timeout / 5xx / network) on the
// SAME webhook_id within this run, short-circuit remaining deliveries for that
// webhook to "circuit_open" without fetching. Prevents one slow/dead endpoint
// from monopolizing wall-time and starving other webhooks.
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_TRIPPING_STATUSES = new Set<number>([408, 429, 500, 502, 503, 504]);

// Constant-time comparison to mitigate timing attacks on the cron secret
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function timingSafeEqualAny(provided: string, ...candidates: (string | undefined)[]): boolean {
  for (const c of candidates) {
    if (c && timingSafeEqual(provided, c)) return true;
  }
  return false;
}

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  brand_id: string;
  event_type: string;
  event_id: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
}

interface PayloadMapping {
  [targetField: string]: string;
}

interface CustomUrlParams {
  [key: string]: string;
}

interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  is_active: boolean;
  event_types: string[];
  payload_format: "json" | "form_urlencoded";
  payload_mapping: PayloadMapping | null;
  custom_url_params: CustomUrlParams | null;
}

// HMAC-SHA256 signature
async function computeSignature(secret: string, timestamp: number, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`)
  );
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Helper: Get nested value from object by dot-notation path
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// Helper: Flatten nested object for form encoding
function flattenObject(
  obj: Record<string, unknown>,
  formData: URLSearchParams,
  prefix: string
): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) {
      continue;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      flattenObject(value as Record<string, unknown>, formData, fullKey);
    } else if (Array.isArray(value)) {
      formData.set(fullKey, value.join(","));
    } else {
      formData.set(fullKey, String(value));
    }
  }
}
async function processDelivery(
  supabase: SupabaseClientAny,
  delivery: WebhookDelivery,
  webhookCache: Map<string, WebhookConfig | null>,
  breakerState: Map<string, number>
): Promise<{ success: boolean; status?: number; error?: string; durationMs: number; circuitTripped?: boolean }> {
  const startTime = Date.now();

  // Circuit breaker: short-circuit if this webhook already failed too many times in this run.
  const failures = breakerState.get(delivery.webhook_id) ?? 0;
  if (failures >= CIRCUIT_BREAKER_THRESHOLD) {
    const durationMs = Date.now() - startTime;
    await supabase.rpc("record_delivery_result", {
      p_delivery_id: delivery.id,
      p_success: false,
      p_error: "circuit_open",
      p_duration_ms: durationMs,
    });
    return { success: false, error: "circuit_open", durationMs };
  }

  try {
    // Get webhook config (with cache)
    let webhook = webhookCache.get(delivery.webhook_id);
    if (webhook === undefined) {
      const { data, error } = await supabase
        .from("outbound_webhooks")
        .select("id, url, secret, is_active, event_types, payload_format, payload_mapping, custom_url_params")
        .eq("id", delivery.webhook_id)
        .single();

      webhook = error ? null : (data as WebhookConfig);
      webhookCache.set(delivery.webhook_id, webhook);
    }

    // Webhook not found or inactive
    if (!webhook || !webhook.is_active) {
      const durationMs = Date.now() - startTime;
      await supabase.rpc("record_delivery_result", {
        p_delivery_id: delivery.id,
        p_success: false,
        p_error: webhook ? "webhook_inactive" : "webhook_not_found",
        p_duration_ms: durationMs,
      });
      return { success: false, error: "webhook_inactive", durationMs: Date.now() - startTime };
    }

    // Prepare request body based on payload_format
    const timestamp = Math.floor(Date.now() / 1000);
    let requestBody: string;
    let contentType: string;
    let targetUrl = webhook.url;

    // Append custom URL params if present
    if (webhook.custom_url_params && Object.keys(webhook.custom_url_params).length > 0) {
      const urlObj = new URL(targetUrl);
      for (const [key, value] of Object.entries(webhook.custom_url_params)) {
        urlObj.searchParams.set(key, value);
      }
      targetUrl = urlObj.toString();
    }

    if (webhook.payload_format === "form_urlencoded") {
      // Transform payload using explicit mapping (required for legacy endpoints like SiLeads)
      const formData = new URLSearchParams();
      const mapping = webhook.payload_mapping;
      
      if (mapping && Object.keys(mapping).length > 0) {
        // Use explicit mapping: { targetField: "source.path" }
        for (const [targetField, sourcePath] of Object.entries(mapping)) {
          const value = getNestedValue(delivery.payload, sourcePath);
          if (value !== undefined && value !== null) {
            formData.set(targetField, String(value));
          }
        }
      } else {
        // Fallback: flatten payload for form encoding (not recommended for legacy endpoints)
        flattenObject(delivery.payload, formData, "");
      }
      
      requestBody = formData.toString();
      contentType = "application/x-www-form-urlencoded; charset=UTF-8";
    } else {
      // Standard JSON format
      requestBody = JSON.stringify(delivery.payload);
      contentType = "application/json";
    }

    // Compute signature on the final requestBody (signature and body must match exactly)
    const signature = await computeSignature(webhook.secret, timestamp, requestBody);

    // HTTP POST with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "User-Agent": USER_AGENT,
          "X-Webhook-Event": delivery.event_type,
          "X-Webhook-Id": delivery.webhook_id,
          "X-Webhook-Delivery-Id": delivery.id,
          "X-Webhook-Timestamp": timestamp.toString(),
          "X-Webhook-Signature": `sha256=${signature}`,
        },
        body: requestBody,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const responseBody = await response.text().catch(() => "");
    const isSuccess = response.status >= 200 && response.status < 300;

    // Record result
    const durationMs = Date.now() - startTime;
    await supabase.rpc("record_delivery_result", {
      p_delivery_id: delivery.id,
      p_success: isSuccess,
      p_response_status: response.status,
      p_response_body: responseBody.slice(0, 10000),
      p_error: isSuccess ? null : `HTTP ${response.status}`,
      p_duration_ms: durationMs,
    });

    // Update circuit breaker: reset on success, increment on tripping statuses (5xx/timeout/429).
    let circuitTripped = false;
    if (isSuccess) {
      breakerState.delete(delivery.webhook_id);
    } else if (CIRCUIT_TRIPPING_STATUSES.has(response.status)) {
      const next = (breakerState.get(delivery.webhook_id) ?? 0) + 1;
      breakerState.set(delivery.webhook_id, next);
      if (next >= CIRCUIT_BREAKER_THRESHOLD) circuitTripped = true;
    }
    // 4xx other than 408/429 are treated as terminal client errors and do NOT trip the breaker.

    return {
      success: isSuccess,
      status: response.status,
      durationMs: Date.now() - startTime,
      circuitTripped,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error
      ? (error.name === "AbortError" ? "timeout" : error.message.slice(0, 200))
      : "unknown_error";

    await supabase.rpc("record_delivery_result", {
      p_delivery_id: delivery.id,
      p_success: false,
      p_error: errorMessage,
      p_duration_ms: durationMs,
    });

    // Network/timeout failures always trip the breaker.
    const next = (breakerState.get(delivery.webhook_id) ?? 0) + 1;
    breakerState.set(delivery.webhook_id, next);
    const circuitTripped = next >= CIRCUIT_BREAKER_THRESHOLD;

    return { success: false, error: errorMessage, durationMs, circuitTripped };
  }
}

// deno-lint-ignore no-explicit-any
type SupabaseClientAny = ReturnType<typeof createClient<any>>;

/**
 * Build chunks using fair round-robin scheduling per webhook_id.
 *
 * Why: a naive slice(i, i+PARALLEL_LIMIT) would put 10 deliveries to the SAME
 * slow endpoint into one chunk, blocking the wall-time for everyone else.
 * With round-robin, each chunk contains AT MOST one delivery per webhook_id
 * (until queues are exhausted), so a slow endpoint occupies at most 1 of
 * PARALLEL_LIMIT slots per chunk.
 */
function buildFairChunks(deliveries: WebhookDelivery[]): WebhookDelivery[][] {
  const queues = new Map<string, WebhookDelivery[]>();
  for (const d of deliveries) {
    const q = queues.get(d.webhook_id);
    if (q) q.push(d);
    else queues.set(d.webhook_id, [d]);
  }
  const order = Array.from(queues.keys());
  const chunks: WebhookDelivery[][] = [];
  let current: WebhookDelivery[] = [];
  let exhausted = false;
  while (!exhausted) {
    exhausted = true;
    for (const id of order) {
      const q = queues.get(id)!;
      if (q.length === 0) continue;
      exhausted = false;
      current.push(q.shift()!);
      if (current.length >= PARALLEL_LIMIT) {
        chunks.push(current);
        current = [];
      }
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// Process batch with parallelism limit, fair scheduling, circuit breaker, and wall-time guard.
async function processBatch(
  supabase: SupabaseClientAny,
  deliveries: WebhookDelivery[],
  startTime: number
): Promise<{ sentOk: number; sentFail: number; remainingHint: boolean; circuitOpen: number; trippedWebhooks: string[] }> {
  const webhookCache = new Map<string, WebhookConfig | null>();
  const breakerState = new Map<string, number>();
  const trippedWebhooks = new Set<string>();
  let sentOk = 0;
  let sentFail = 0;
  let circuitOpen = 0;

  const chunks = buildFairChunks(deliveries);
  let processedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    // Wall-time guard: stop if we're running too long
    if (Date.now() - startTime > WALL_TIME_LIMIT_MS) {
      const remaining = deliveries.length - processedCount;
      console.log(`[WALL_TIME] Stopping after ${Date.now() - startTime}ms, remaining=${remaining}`);
      return { sentOk, sentFail, remainingHint: true, circuitOpen, trippedWebhooks: [...trippedWebhooks] };
    }

    const chunk = chunks[i];
    const results = await Promise.all(
      chunk.map(d => processDelivery(supabase, d, webhookCache, breakerState))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const delivery = chunk[j];
      processedCount++;

      if (result.success) {
        sentOk++;
        console.log(`[OK] delivery=${delivery.id} webhook=${delivery.webhook_id} event=${delivery.event_type} status=${result.status} duration=${result.durationMs}ms`);
      } else if (result.error === "circuit_open") {
        circuitOpen++;
        sentFail++;
        // Logged at TRIP time below; keep this line terse to avoid log spam.
      } else {
        sentFail++;
        console.log(`[FAIL] delivery=${delivery.id} webhook=${delivery.webhook_id} event=${delivery.event_type} attempt=${delivery.attempt_count + 1} error=${result.error} duration=${result.durationMs}ms`);
        if (result.circuitTripped && !trippedWebhooks.has(delivery.webhook_id)) {
          trippedWebhooks.add(delivery.webhook_id);
          console.warn(`[CIRCUIT_OPEN] webhook=${delivery.webhook_id} threshold=${CIRCUIT_BREAKER_THRESHOLD} reached — remaining deliveries this run will short-circuit`);
        }
      }
    }
  }

  return { sentOk, sentFail, remainingHint: false, circuitOpen, trippedWebhooks: [...trippedWebhooks] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const runStartTime = Date.now();

  try {
    // SECURITY [B01]: Validate cron secret OR verify JWT server-side (service_role ONLY)
    // CRITICAL: anon tokens are NOT accepted — this function uses SUPABASE_SERVICE_ROLE_KEY
    const cronSecret = Deno.env.get("CRON_SECRET");
    const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
    const providedSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("authorization") || "";
    
    const hasValidSecret = !!(cronSecret && providedSecret &&
      timingSafeEqualAny(providedSecret, cronSecret, cronSecretPrev));
    
    // SECURITY: only x-cron-secret or service_role JWT (verified server-side via getClaims).
    // The anon key is public — never accept it nor role === "anon".
    let hasValidJwt = false;
    if (!hasValidSecret && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      try {
        const verifyClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: claimsData, error: claimsErr } = await verifyClient.auth.getClaims(token);
        if (!claimsErr && claimsData?.claims) {
          const role = claimsData.claims.role as string;
          if (role === "service_role") {
            hasValidJwt = true;
          }
        }
      } catch { /* invalid JWT, fall through */ }
    }
    
    if (!hasValidSecret && !hasValidJwt) {
      console.error("[AUTH] Invalid or missing authentication");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create service role client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Claim pending deliveries
    const { data: deliveries, error: claimError } = await supabase
      .rpc("claim_webhook_deliveries", { p_batch_size: BATCH_SIZE });

    if (claimError) {
      console.error("[ERROR] claim_webhook_deliveries failed:", claimError);
      return new Response(JSON.stringify({ error: "claim_failed", details: claimError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claimedCount = deliveries?.length ?? 0;
    
    if (claimedCount === 0) {
      console.log("[INFO] No pending deliveries");
      return new Response(JSON.stringify({ claimed: 0, sent_ok: 0, sent_fail: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[INFO] Claimed ${claimedCount} deliveries`);

    // Process batch with wall-time guard
    const { sentOk, sentFail, remainingHint } = await processBatch(
      supabase, 
      deliveries as WebhookDelivery[],
      runStartTime
    );

    const summary = { 
      claimed: claimedCount, 
      sent_ok: sentOk, 
      sent_fail: sentFail,
      remaining_hint: remainingHint,
      duration_ms: Date.now() - runStartTime
    };
    console.log(`[SUMMARY] claimed=${claimedCount} sent_ok=${sentOk} sent_fail=${sentFail} remaining_hint=${remainingHint} duration_ms=${summary.duration_ms}`);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[FATAL]", error);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
