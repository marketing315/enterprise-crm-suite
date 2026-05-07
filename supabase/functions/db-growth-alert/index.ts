// db-growth-alert
// Cron orario. Legge v_db_growth_alerts, se ci sono righe CRITICAL/WARNING
// crea notifiche in-app per admin/CEO del system brand ed eventualmente
// accoda su notification_webhook_outbox per le destination attive che
// hanno sottoscritto 'slo_alert'.
//
// Trigger: ADR-001 retention mandatory (post-incident 7 maggio 2026).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SYSTEM_BRAND_ID = "00000000-0000-0000-0000-000000000000";

interface AlertRow {
  severity: "CRITICAL" | "WARNING";
  measured_at: string;
  db_size: string;
  total_bytes: number;
  daily_growth: string;
  daily_growth_bytes: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) Leggi alert correnti
    const { data: alerts, error: alertErr } = await supabase
      .from("v_db_growth_alerts")
      .select("*")
      .order("measured_at", { ascending: false })
      .limit(5);

    if (alertErr) {
      console.error("[db-growth-alert] read view failed", alertErr);
      return new Response(
        JSON.stringify({ ok: false, error: alertErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const list = (alerts ?? []) as AlertRow[];
    if (list.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, alerts: 0, notifications: 0, outbox: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2) Dedup: salta se ho già inviato una notifica negli ultimi 6h con lo stesso severity
    const top = list[0];
    const sinceIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { count: recent } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("type", "slo_alert")
      .eq("brand_id", SYSTEM_BRAND_ID)
      .eq("entity_type", "db_growth")
      .gte("created_at", sinceIso);

    if ((recent ?? 0) > 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          alerts: list.length,
          notifications: 0,
          outbox: 0,
          dedup: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const title = top.severity === "CRITICAL"
      ? `🚨 DB ${top.db_size} (CRITICAL > 6 GB)`
      : `⚠️ DB cresciuto +${top.daily_growth} in 24h`;
    const body =
      `Severity: ${top.severity}\nDB size: ${top.db_size}\nDaily growth: ${top.daily_growth}\nMisurato: ${top.measured_at}\n\nVedi /admin/observability e docs/db-retention-policy.md.`;

    // 3) Trova admin / CEO destinatari (system brand)
    const { data: admins, error: adminErr } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "ceo"])
      .eq("brand_id", SYSTEM_BRAND_ID);

    if (adminErr) {
      console.error("[db-growth-alert] read admins failed", adminErr);
    }

    const userIds = Array.from(
      new Set((admins ?? []).map((r) => r.user_id as string)),
    );

    let notifInserted = 0;
    if (userIds.length > 0) {
      const rows = userIds.map((uid) => ({
        brand_id: SYSTEM_BRAND_ID,
        user_id: uid,
        type: "slo_alert" as const,
        title,
        body,
        entity_type: "db_growth",
      }));
      const { error: insErr, count } = await supabase
        .from("notifications")
        .insert(rows, { count: "exact" });
      if (insErr) {
        console.error("[db-growth-alert] insert notifications failed", insErr);
      } else {
        notifInserted = count ?? rows.length;
      }
    }

    // 4) Outbox per webhook destination attive iscritte a slo_alert
    const { data: dests } = await supabase
      .from("notification_webhook_destinations")
      .select("id, brand_id, notification_types, is_active, retry_max")
      .eq("is_active", true);

    const matching = (dests ?? []).filter((d) =>
      Array.isArray(d.notification_types) &&
      d.notification_types.includes("slo_alert")
    );

    let outboxInserted = 0;
    if (matching.length > 0) {
      // Servo una notification_id reale: prendo la prima inserita (lookup)
      const { data: anchor } = await supabase
        .from("notifications")
        .select("id")
        .eq("brand_id", SYSTEM_BRAND_ID)
        .eq("entity_type", "db_growth")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (anchor?.id) {
        const payload = {
          type: "slo_alert",
          title,
          body,
          brand_id: SYSTEM_BRAND_ID,
          entity_type: "db_growth",
          notification_id: anchor.id,
          created_at: new Date().toISOString(),
          severity: top.severity,
          db_size: top.db_size,
          daily_growth: top.daily_growth,
          total_bytes: top.total_bytes,
        };
        const outboxRows = matching.map((d) => ({
          destination_id: d.id,
          notification_id: anchor.id,
          brand_id: d.brand_id,
          notification_type: "slo_alert" as const,
          payload,
          status: "pending",
          attempts: 0,
          next_retry_at: new Date().toISOString(),
        }));
        const { error: outErr, count } = await supabase
          .from("notification_webhook_outbox")
          .insert(outboxRows, { count: "exact" });
        if (outErr) {
          console.error("[db-growth-alert] insert outbox failed", outErr);
        } else {
          outboxInserted = count ?? outboxRows.length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        alerts: list.length,
        severity: top.severity,
        notifications: notifInserted,
        outbox: outboxInserted,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[db-growth-alert] fatal", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
