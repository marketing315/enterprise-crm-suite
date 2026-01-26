import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BATCH_SIZE = 50;
const PARALLEL_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 10000;
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

interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  is_active: boolean;
  event_types: string[];
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

// Process a single delivery
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
        .select("id, url, secret, is_active, event_types")
        .eq("id", delivery.webhook_id)
        .single();

      webhook = error ? null : (data as WebhookConfig);
      webhookCache.set(delivery.webhook_id, webhook);
    }

    // Webhook not found or inactive
    if (!webhook || !webhook.is_active) {
      await supabase.rpc("record_delivery_result", {
        p_delivery_id: delivery.id,
        p_success: false,
        p_error: webhook ? "webhook_inactive" : "webhook_not_found",
      });
      return { success: false, error: "webhook_inactive", durationMs: Date.now() - startTime };
    }

    // Prepare request
    const timestamp = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify(delivery.payload);
    const signature = await computeSignature(webhook.secret, timestamp, rawBody);

    // HTTP POST with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
          "X-Webhook-Event": delivery.event_type,
          "X-Webhook-Id": delivery.webhook_id,
          "X-Webhook-Delivery-Id": delivery.id,
          "X-Webhook-Timestamp": timestamp.toString(),
          "X-Webhook-Signature": `sha256=${signature}`,
          "X-Webhook-Signature-V1": `sha256=${signature}`,
        },
        body: rawBody,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const responseBody = await response.text().catch(() => "");
    const isSuccess = response.status >= 200 && response.status < 300;

    // Record result
    await supabase.rpc("record_delivery_result", {
      p_delivery_id: delivery.id,
      p_success: isSuccess,
      p_response_status: response.status,
      p_response_body: responseBody.slice(0, 10000),
      p_error: isSuccess ? null : `HTTP ${response.status}`,
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
    });

    return { success: false, error: errorMessage, durationMs };
  }
}

// deno-lint-ignore no-explicit-any
type SupabaseClientAny = ReturnType<typeof createClient<any>>;

// Process batch with parallelism limit
async function processBatch(
  supabase: SupabaseClientAny,
  deliveries: WebhookDelivery[]
): Promise<{ sentOk: number; sentFail: number }> {
  const webhookCache = new Map<string, WebhookConfig | null>();
  let sentOk = 0;
  let sentFail = 0;

  // Process in chunks of PARALLEL_LIMIT
  for (let i = 0; i < deliveries.length; i += PARALLEL_LIMIT) {
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

  return { sentOk, sentFail };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate cron secret
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedSecret = req.headers.get("x-cron-secret");
    
    if (cronSecret && providedSecret !== cronSecret) {
      console.error("[AUTH] Invalid or missing x-cron-secret");
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

    // Process batch
    const { sentOk, sentFail } = await processBatch(supabase, deliveries as WebhookDelivery[]);

    const summary = { claimed: claimedCount, sent_ok: sentOk, sent_fail: sentFail };
    console.log(`[SUMMARY] claimed=${claimedCount} sent_ok=${sentOk} sent_fail=${sentFail}`);

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
