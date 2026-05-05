// Punto 8: Cron runner per notifiche pagamenti in ritardo
// Invocato da pg_cron (es. 1 volta al giorno alle 09:00 Europe/Rome)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { timingSafeEqualAny } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // SECURITY: cron-only endpoint — require x-cron-secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expected = Deno.env.get("CRON_SECRET");
    const expectedPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
    if (!cronSecret || !timingSafeEqualAny(cronSecret, expected, expectedPrev)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let brandId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        brandId = body?.brand_id ?? null;
      } catch { /* empty body OK */ }
    }

    const { data, error } = await supabase.rpc(
      "enqueue_payment_overdue_notifications",
      { p_brand_id: brandId },
    );

    if (error) {
      console.error("[payment-overdue-runner] RPC error", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = Array.isArray(data) ? data[0] : data;
    console.log("[payment-overdue-runner] done", result);

    return new Response(
      JSON.stringify({
        ok: true,
        notifications_created: result?.notifications_created ?? 0,
        brands_processed: result?.brands_processed ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[payment-overdue-runner] fatal", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
