import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyInternalRequest } from "../_shared/internal-mtls.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token, x-internal-caller, x-internal-timestamp, x-internal-nonce, x-internal-signature",
};

// C5 — only these callers may push spans inter-function.
const ALLOWED_CALLERS = ["mcp-gateway", "mcp-server", "webhook-ingest", "ai-agent"] as const;

interface TraceEvent {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  service_name: string;
  operation_name: string;
  started_at: string;
  duration_ms: number;
  status_code?: "ok" | "error" | "timeout";
  http_status?: number;
  error_message?: string;
  attributes?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rawBody = await req.text();
    const auth = await verifyInternalRequest({
      req,
      rawBody,
      allowedCallers: ALLOWED_CALLERS,
    });
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { events?: unknown };
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const events: TraceEvent[] = Array.isArray(body?.events)
      ? (body.events as TraceEvent[])
      : [body as TraceEvent];

    if (!events.length || events.length > 500) {
      return new Response(JSON.stringify({ error: "invalid_batch_size" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
      return new Response(JSON.stringify({ error: "invalid_batch_size" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const required = ["trace_id", "span_id", "service_name", "operation_name", "started_at", "duration_ms"];
    for (const ev of events) {
      for (const k of required) {
        if (!(k in ev)) {
          return new Response(JSON.stringify({ error: `missing_field:${k}` }), {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase.from("trace_events").insert(
      events.map((e) => ({
        trace_id: e.trace_id,
        span_id: e.span_id,
        parent_span_id: e.parent_span_id ?? null,
        service_name: e.service_name,
        operation_name: e.operation_name,
        started_at: e.started_at,
        duration_ms: Math.round(e.duration_ms),
        status_code: e.status_code ?? "ok",
        http_status: e.http_status ?? null,
        error_message: e.error_message ?? null,
        attributes: e.attributes ?? {},
      })),
    );

    if (error) {
      console.error("trace-ingest insert error", error);
      return new Response(JSON.stringify({ error: "insert_failed", details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, ingested: events.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("trace-ingest fatal", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
