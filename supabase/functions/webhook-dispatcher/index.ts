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
  webhookCache: Map<string, WebhookConfig | null>
): Promise<{ success: boolean; status?: number; error?: string; durationMs: number }> {
  const startTime = Date.now();

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

    return {
      success: isSuccess,
      status: response.status,
      durationMs: Date.now() - startTime,
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

    return { success: false, error: errorMessage, durationMs };
  }
}

// deno-lint-ignore no-explicit-any
type SupabaseClientAny = ReturnType<typeof createClient<any>>;

// Process batch with parallelism limit and wall-time guard
async function processBatch(
  supabase: SupabaseClientAny,
  deliveries: WebhookDelivery[],
  startTime: number
): Promise<{ sentOk: number; sentFail: number; remainingHint: boolean }> {
  const webhookCache = new Map<string, WebhookConfig | null>();
  let sentOk = 0;
  let sentFail = 0;

  // Process in chunks of PARALLEL_LIMIT
  for (let i = 0; i < deliveries.length; i += PARALLEL_LIMIT) {
    // Wall-time guard: stop if we're running too long
    if (Date.now() - startTime > WALL_TIME_LIMIT_MS) {
      const remaining = deliveries.length - i;
      console.log(`[WALL_TIME] Stopping after ${Date.now() - startTime}ms, remaining=${remaining}`);
      return { sentOk, sentFail, remainingHint: true };
    }

    const chunk = deliveries.slice(i, i + PARALLEL_LIMIT);
    const results = await Promise.all(
      chunk.map(d => processDelivery(supabase, d, webhookCache))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const delivery = chunk[j];
      
      if (result.success) {
        sentOk++;
        console.log(`[OK] delivery=${delivery.id} webhook=${delivery.webhook_id} event=${delivery.event_type} status=${result.status} duration=${result.durationMs}ms`);
      } else {
        sentFail++;
        console.log(`[FAIL] delivery=${delivery.id} webhook=${delivery.webhook_id} event=${delivery.event_type} attempt=${delivery.attempt_count + 1} error=${result.error} duration=${result.durationMs}ms`);
      }
    }
  }

  return { sentOk, sentFail, remainingHint: false };
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
    
    const hasValidSecret = cronSecret && providedSecret && 
      (providedSecret === cronSecret || (cronSecretPrev && providedSecret === cronSecretPrev));
    
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
          // Accept both service_role and anon (for pg_cron invocations via pg_net)
          if (role === "service_role" || role === "anon") {
            hasValidJwt = true;
          } else {
            console.warn(`[AUTH] Rejected JWT with non-privileged role: ${role}`);
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
