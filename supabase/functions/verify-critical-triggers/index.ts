// verify-critical-triggers
// ─────────────────────────────────────────────────────────────────────────────
// Daily cron (02:00). Calls verify_critical_triggers() RPC which checks each
// trigger in critical_triggers_registry and auto-recreates missing ones.
// If any trigger was missing OR auto-recreate failed → notify admins.
//
// Auth: x-cron-secret OR Bearer service_role JWT.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual, timingSafeEqualAny } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_BRAND_ID = "00000000-0000-0000-0000-000000000000";

function authOk(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
  const provided = req.headers.get("x-cron-secret");
  if (cronSecret && provided && timingSafeEqualAny(provided, cronSecret, cronSecretPrev)) return true;
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (serviceKey && timingSafeEqual(token, serviceKey)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (level: "log" | "error", msg: string, extra?: Record<string, unknown>) =>
    console[level](JSON.stringify({
      ts: new Date().toISOString(),
      correlation_id: correlationId,
      fn: "verify-critical-triggers",
      level,
      msg,
      ...extra,
    }));

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!authOk(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("verify_critical_triggers");
    if (error) throw error;

    const results = (data ?? []) as Array<{
      trigger_name: string;
      table_name: string;
      present: boolean;
      auto_recreated: boolean;
      error: string | null;
    }>;

    const missing = results.filter((r) => !r.present);
    const recreated = results.filter((r) => r.auto_recreated);
    const failed = results.filter((r) => r.error);

    log("log", "verify done", {
      total: results.length,
      missing: missing.length,
      recreated: recreated.length,
      failed: failed.length,
    });

    if (missing.length > 0 || failed.length > 0) {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"])
        .eq("is_active", true);
      const adminUserIds = Array.from(new Set((adminRoles ?? []).map((r) => r.user_id).filter(Boolean)));

      if (adminUserIds.length > 0) {
        const allRecovered = missing.length > 0 && missing.every((m) => recreated.find((r) => r.trigger_name === m.trigger_name));
        const title = allRecovered
          ? "✅ Trigger critici ripristinati automaticamente"
          : "🚨 Trigger critici mancanti";
        const body = `Mancanti: ${missing.map((m) => m.trigger_name).join(", ") || "—"}. Ripristinati: ${recreated.length}. Falliti: ${failed.length}.`;
        const notifRows = adminUserIds.map((uid) => ({
          brand_id: SYSTEM_BRAND_ID,
          user_id: uid,
          type: "slo_alert" as const,
          title,
          body,
          entity_type: "critical_trigger",
        }));
        await supabase.from("notifications").insert(notifRows);
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "verify failed", { err: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
