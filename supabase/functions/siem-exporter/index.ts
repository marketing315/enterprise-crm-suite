// SIEM Exporter — invia audit_events verso destinazioni SIEM esterne via webhook HMAC firmato
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertSafeUrl } from "../_shared/safe-outbound.ts";
// A7: shared PII redactor — ensures consistent baseline redaction across
// SIEM exports, AI logs, and edge debug payloads. Embeds REDACT_POLICY_VERSION
// so SIEM consumers can detect format drift.
import { redactPII, REDACT_POLICY_VERSION } from "../_shared/pii-redact.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SiemDestination {
  id: string;
  brand_id: string;
  name: string;
  endpoint_url: string;
  hmac_secret: string;
  mask_pii: boolean;
  batch_size: number;
  consecutive_failures: number;
}

interface AuditEventRow {
  event_id: string;
  brand_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string | null;
  actor_type: string;
  actor_display_name: string | null;
  source: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_fields: string[] | null;
  metadata: Record<string, unknown> | null;
  correlation_id: string | null;
  occurred_at: string;
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

const SENSITIVE_KEYS = ["email", "phone", "telefono", "name", "nome", "cognome", "address", "indirizzo", "fiscal_code", "cf"];

function maskPayload(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(maskPayload);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
      out[k] = maskValue(v);
    } else if (v && typeof v === "object") {
      out[k] = maskPayload(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function applyMaskToEvent(ev: AuditEventRow): AuditEventRow {
  // A7: layer the shared PII redactor on top of the field-name-based
  // mask. The shared redactor catches structural PII (email/phone/IBAN/CF/CC)
  // anywhere inside the JSON, regardless of the parent key name, and also
  // scrubs `metadata` (which the legacy mask ignored).
  const old_value = ev.old_value
    ? (redactPII(maskPayload(ev.old_value)) as Record<string, unknown>)
    : null;
  const new_value = ev.new_value
    ? (redactPII(maskPayload(ev.new_value)) as Record<string, unknown>)
    : null;
  const metadata = ev.metadata
    ? (redactPII(ev.metadata) as Record<string, unknown>)
    : null;
  return { ...ev, old_value, new_value, metadata };
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

async function exportToDestination(
  supabase: ReturnType<typeof createClient>,
  dest: SiemDestination,
): Promise<{ ok: boolean; count: number }> {
  const { data: events, error } = await supabase.rpc("claim_pending_siem_exports", {
    _destination_id: dest.id,
  });
  if (error) {
    console.error(`[siem-exporter] claim error for ${dest.id}:`, error.message);
    return { ok: false, count: 0 };
  }
  const list = (events ?? []) as AuditEventRow[];
  if (list.length === 0) return { ok: true, count: 0 };

  const masked = dest.mask_pii ? list.map(applyMaskToEvent) : list;
  const lastEventAt = list[list.length - 1].occurred_at;

  const payload = {
    source: "lovable-crm",
    brand_id: dest.brand_id,
    destination: dest.name,
    exported_at: new Date().toISOString(),
    // A7: declare the redaction contract version so SIEM consumers can
    // detect schema drift if we change the mask/redactor implementation.
    redaction_policy: dest.mask_pii ? REDACT_POLICY_VERSION : "none",
    event_count: masked.length,
    events: masked,
  };
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signaturePayload = `${timestamp}.${body}`;
  const signature = await hmacSign(dest.hmac_secret, signaturePayload);

  const start = Date.now();
  let httpStatus: number | null = null;
  let errorMsg: string | null = null;
  let success = false;

  try {
    // C12: SSRF guard — endpoint_url is admin-configurable
    const guard = await assertSafeUrl(dest.endpoint_url);
    if (!guard.ok) {
      errorMsg = `ssrf_blocked: ${guard.reason}`;
    } else {
      const res = await fetch(dest.endpoint_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Lovable-SIEM-Exporter/1.0",
          "X-Signature-Timestamp": timestamp,
          "X-Signature-SHA256": signature,
          "X-Event-Count": String(masked.length),
        },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      httpStatus = res.status;
      success = res.ok;
      if (!success) {
        const text = await res.text().catch(() => "");
        errorMsg = `HTTP ${res.status}: ${text.slice(0, 500)}`;
      }
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const latencyMs = Date.now() - start;

  await supabase.rpc("mark_siem_export_result", {
    _destination_id: dest.id,
    _success: success,
    _last_event_at: success ? lastEventAt : null,
    _events_count: masked.length,
    _http_status: httpStatus,
    _error_message: errorMsg,
    _latency_ms: latencyMs,
  });

  return { ok: success, count: masked.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: destinations, error } = await supabase
      .from("siem_destinations")
      .select("id, brand_id, name, endpoint_url, hmac_secret, mask_pii, batch_size, consecutive_failures")
      .eq("is_active", true)
      .lt("consecutive_failures", 10) // circuit breaker
      .limit(50);
    if (error) throw error;

    const dests = (destinations ?? []) as SiemDestination[];
    const results: Array<{ id: string; name: string; ok: boolean; count: number }> = [];

    for (const d of dests) {
      const r = await exportToDestination(supabase, d);
      results.push({ id: d.id, name: d.name, ...r });
    }

    return new Response(
      JSON.stringify({
        destinations: dests.length,
        total_events: results.reduce((s, r) => s + r.count, 0),
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[siem-exporter] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
