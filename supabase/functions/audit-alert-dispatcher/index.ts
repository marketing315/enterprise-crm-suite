// Edge function: claim pending audit alert deliveries and dispatch via webhook/email
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertSafeUrl } from "../_shared/safe-outbound.ts";
import { timingSafeEqualAny } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function isAuthorized(req: Request): boolean {
  const cronSecret = req.headers.get("x-cron-secret");
  const expected = Deno.env.get("CRON_SECRET");
  const expectedPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
  return !!cronSecret && timingSafeEqualAny(cronSecret, expected ?? null, expectedPrev ?? null);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface PendingDelivery {
  delivery_id: string;
  channel_id: string;
  anomaly_id: string | null;
  brand_id: string;
  channel_type: "webhook" | "email";
  destination: string;
  webhook_secret: string | null;
  mask_pii: boolean;
  attempt_count: number;
}

function maskValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") {
    if (v.includes("@")) {
      const [local, domain] = v.split("@");
      return `${local.charAt(0)}•••@${domain}`;
    }
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 6) return `••• ••• ${digits.slice(-4)}`;
    if (v.length > 6) return `${v.slice(0, 2)}•••${v.slice(-2)}`;
  }
  return v;
}

function maskPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ["email", "phone", "telefono", "name", "nome", "cognome", "address", "indirizzo"];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (sensitive.some((s) => k.toLowerCase().includes(s))) {
      out[k] = maskValue(v);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = maskPayload(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function hmacSign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deliverWebhook(
  delivery: PendingDelivery,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Lovable-Audit-Alerts/1.0",
  };
  if (delivery.webhook_secret) {
    headers["X-Signature-SHA256"] = await hmacSign(delivery.webhook_secret, body);
  }
  try {
    // C12: SSRF guard — destination is user-configurable
    const guard = await assertSafeUrl(delivery.destination);
    if (!guard.ok) {
      return { ok: false, error: `ssrf_blocked: ${guard.reason}` };
    }
    const res = await fetch(delivery.destination, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function deliverEmail(
  delivery: PendingDelivery,
  payload: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "audit-anomaly-alert",
        recipientEmail: delivery.destination,
        idempotencyKey: `audit-alert-${delivery.delivery_id}`,
        templateData: payload,
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, status: 202 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: pending, error: claimErr } = await supabase.rpc(
      "get_pending_alert_deliveries",
      { _limit: 50 },
    );
    if (claimErr) throw claimErr;

    const list = (pending ?? []) as PendingDelivery[];
    let sent = 0;
    let failed = 0;

    for (const d of list) {
      // Load anomaly
      let anomaly: Record<string, unknown> | null = null;
      if (d.anomaly_id) {
        const { data } = await supabase
          .from("audit_anomalies")
          .select("*")
          .eq("id", d.anomaly_id)
          .maybeSingle();
        anomaly = data as Record<string, unknown> | null;
      }

      const rawPayload = {
        delivery_id: d.delivery_id,
        brand_id: d.brand_id,
        anomaly: anomaly,
        dispatched_at: new Date().toISOString(),
      };

      const payload = d.mask_pii
        ? maskPayload(rawPayload as Record<string, unknown>)
        : rawPayload;

      const result =
        d.channel_type === "webhook"
          ? await deliverWebhook(d, payload as Record<string, unknown>)
          : await deliverEmail(d, payload as Record<string, unknown>, supabase);

      const nextAttempt = d.attempt_count + 1;
      const status = result.ok
        ? "sent"
        : nextAttempt >= 5
          ? "failed"
          : "retrying";

      await supabase
        .from("audit_alert_deliveries")
        .update({
          status,
          attempt_count: nextAttempt,
          response_status: result.status ?? null,
          error_message: result.error ?? null,
          payload: payload,
          sent_at: result.ok ? new Date().toISOString() : null,
        })
        .eq("id", d.delivery_id);

      if (result.ok) sent++;
      else failed++;

      // Audit log
      await supabase.from("audit_events").insert({
        action: "alert_dispatched",
        entity_type: "audit_alert_delivery",
        entity_id: d.delivery_id,
        brand_id: d.brand_id,
        metadata: {
          channel_type: d.channel_type,
          status,
          response_status: result.status ?? null,
        },
      }).then(() => {}, () => {});
    }

    return new Response(
      JSON.stringify({ claimed: list.length, sent, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("dispatcher error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
