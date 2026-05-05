// Notification Webhook Dispatcher
// Cron-driven (1min). Consegna notifiche di escalation/override/SLO/anomalie verso webhook esterni.
// Supporta preset: generic (HMAC SHA-256), google_sheets (Apps Script), n8n, slack_compatible.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertSafeUrl } from "../_shared/safe-outbound.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ClaimedJob {
  outbox_id: string;
  destination_id: string;
  endpoint_url: string;
  hmac_secret: string;
  preset: string;
  payload: Record<string, unknown>;
  attempts: number;
  retry_max: number;
}

async function hmacSign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function transformPayload(preset: string, p: Record<string, unknown>): unknown {
  const type = String(p.type ?? "");
  const title = String(p.title ?? "");
  const body = String(p.body ?? "");

  if (preset === "google_sheets") {
    // Apps Script Web App expects flat row append
    return {
      timestamp: p.created_at,
      type,
      brand_id: p.brand_id,
      user_id: p.user_id,
      title,
      body,
      entity_type: p.entity_type ?? "",
      entity_id: p.entity_id ?? "",
      notification_id: p.notification_id,
    };
  }
  if (preset === "slack_compatible") {
    return {
      text: `*[${type}]* ${title}`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*${title}*\n${body || "_no body_"}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `type: \`${type}\` • brand: \`${p.brand_id}\`` }] },
      ],
    };
  }
  // generic, n8n
  return p;
}

async function deliver(job: ClaimedJob): Promise<{ ok: boolean; error?: string }> {
  try {
    // C12: SSRF guard
    const safe = await assertSafeUrl(job.endpoint_url);
    if (!safe.ok) {
      return { ok: false, error: `ssrf_blocked:${safe.error}:${safe.detail ?? ""}` };
    }
    const body = JSON.stringify(transformPayload(job.preset, job.payload));
    const signature = await hmacSign(job.hmac_secret, body);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);

    const res = await fetch(job.endpoint_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lovable-Signature": `sha256=${signature}`,
        "X-Lovable-Notification-Type": String(job.payload.type ?? ""),
        "X-Lovable-Attempt": String(job.attempts),
      },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: jobs, error } = await supabase.rpc("claim_pending_notification_webhooks", { p_limit: 50 });
    if (error) {
      console.error("[notification-webhook-dispatcher] claim failed", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const list = (jobs ?? []) as ClaimedJob[];
    let sent = 0;
    let failed = 0;

    await Promise.all(
      list.map(async (job) => {
        const result = await deliver(job);
        if (result.ok) sent++;
        else failed++;
        await supabase.rpc("mark_notification_webhook_result", {
          p_outbox_id: job.outbox_id,
          p_success: result.ok,
          p_error: result.error ?? null,
        });
      }),
    );

    return new Response(
      JSON.stringify({ ok: true, claimed: list.length, sent, failed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[notification-webhook-dispatcher] fatal", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
