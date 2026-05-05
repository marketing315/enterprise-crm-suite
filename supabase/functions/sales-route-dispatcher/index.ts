// sales-route-dispatcher
// - Triggered by cron-relay every 15 minutes (with x-cron-secret), OR
// - Manually via service-role Bearer for "send now" actions.
//
// Behavior:
//   * Cron mode (no body.brand_id): scans active schedules; for each brand whose
//     local time matches send_at_local within ±7 min and weekday in days_of_week,
//     sends individual emails to sales users with appointments for D+1 (00..23:59)
//     in Europe/Rome and (if enabled) an aggregate email to managers/CEO.
//   * Manual mode (body.brand_id + body.route_date): same logic but forced for
//     that brand and date. Optional body.user_ids restricts to specific sellers.
//     body.audience: 'sales' | 'managers' | 'both' (default 'both').

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function todayInTz(tz: string): { wd: number; hhmm: string; date: string } {
  // wd: 1=Mon..7=Sun
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const wdMap: Record<string, number> = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 };
  return {
    wd: wdMap[parts.weekday] ?? 0,
    hhmm: `${parts.hour}:${parts.minute}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minutesDiff(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

function buildMapsUrl(items: any[]): string | null {
  const stops = items
    .map(a => {
      const ad = a.address || a?.contact?.address;
      const city = a.city || a?.contact?.city;
      const cap = a.cap || a?.contact?.cap;
      const parts = [ad, [cap, city].filter(Boolean).join(" ")].filter(Boolean);
      return parts.join(", ");
    })
    .filter(Boolean);
  if (stops.length === 0) return null;
  const dest = encodeURIComponent(stops[stops.length - 1]);
  const wp = stops.slice(0, -1).map(encodeURIComponent).join("|");
  const base = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${dest}`;
  return wp ? `${base}&waypoints=${wp}` : base;
}

async function sendTransactional(
  supabase: any,
  templateName: string,
  recipientEmail: string,
  idempotencyKey: string,
  templateData: Record<string, any>,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-transactional-email", {
      body: { templateName, recipientEmail, idempotencyKey, templateData },
    });
    if (error) return { ok: false, error: String(error?.message || error) };
    return { ok: true, messageId: data?.messageId || data?.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

interface ProcessOpts {
  brandId: string;
  brandName?: string | null;
  routeDate: string; // YYYY-MM-DD
  audience: "sales" | "managers" | "both";
  userIdsFilter?: string[] | null;
  triggerSource: "cron" | "manual_single" | "manual_bulk";
  triggeredBy?: string | null;
  schedule?: any;
}

async function processBrand(supabase: any, opts: ProcessOpts) {
  const result = {
    brand_id: opts.brandId,
    route_date: opts.routeDate,
    individual_sent: 0,
    individual_failed: 0,
    aggregate_sent: 0,
    aggregate_failed: 0,
    skipped: 0,
  };

  // INDIVIDUAL emails
  if (opts.audience === "sales" || opts.audience === "both") {
    const { data: recipients, error: recErr } = await supabase.rpc(
      "get_sales_route_recipients_default",
      { p_brand_id: opts.brandId, p_date: opts.routeDate },
    );
    if (recErr) {
      console.error("[sales-route] recipients error", recErr);
    } else {
      const filtered = (recipients || []).filter((r: any) =>
        !opts.userIdsFilter || opts.userIdsFilter.includes(r.user_id)
      );
      for (const r of filtered) {
        if (!r.email) { result.skipped++; continue; }
        const idem = `sales-route-${opts.brandId}-${opts.routeDate}-individual-${r.user_id}`;
        // Idempotency check (skip if already sent successfully)
        const { data: existing } = await supabase
          .from("sales_route_dispatches")
          .select("id,status")
          .eq("idempotency_key", idem)
          .maybeSingle();
        if (existing && existing.status === "sent") { result.skipped++; continue; }

        // Fetch route
        const { data: route, error: routeErr } = await supabase.rpc(
          "get_sales_route_for_user",
          { p_brand_id: opts.brandId, p_user_id: r.user_id, p_date: opts.routeDate },
        );
        if (routeErr || !route) {
          await supabase.from("sales_route_dispatches").insert({
            brand_id: opts.brandId, route_date: opts.routeDate,
            dispatch_type: "individual", audience: "sales",
            recipient_user_id: r.user_id, recipient_email: r.email,
            appointments_count: 0, appointment_ids: [],
            status: "failed", error_message: routeErr?.message || "no route",
            idempotency_key: idem + "-err-" + Date.now(),
            triggered_by_user_id: opts.triggeredBy ?? null,
            trigger_source: opts.triggerSource,
          });
          result.individual_failed++;
          continue;
        }

        const apts = route.appointments || [];
        if (apts.length === 0) { result.skipped++; continue; }

        const mapsUrl = buildMapsUrl(apts);
        const send = await sendTransactional(
          supabase,
          "sales-route-individual",
          r.email,
          idem,
          {
            sellerName: r.full_name || null,
            routeDate: opts.routeDate,
            brandName: opts.brandName || null,
            appointments: apts,
            mapsUrl,
          },
        );

        await supabase.from("sales_route_dispatches").insert({
          brand_id: opts.brandId, route_date: opts.routeDate,
          dispatch_type: "individual", audience: "sales",
          recipient_user_id: r.user_id, recipient_email: r.email,
          appointments_count: apts.length,
          appointment_ids: apts.map((a: any) => a.id),
          email_message_id: send.messageId ?? null,
          status: send.ok ? "sent" : "failed",
          error_message: send.ok ? null : (send.error ?? null),
          idempotency_key: send.ok ? idem : (idem + "-err-" + Date.now()),
          triggered_by_user_id: opts.triggeredBy ?? null,
          trigger_source: opts.triggerSource,
        });
        if (send.ok) result.individual_sent++; else result.individual_failed++;
      }
    }
  }

  // AGGREGATE email
  if (opts.audience === "managers" || opts.audience === "both") {
    const sched = opts.schedule;
    const sendAggregate = sched ? sched.send_aggregate !== false : true;
    if (sendAggregate) {
      const { data: agg, error: aggErr } = await supabase.rpc(
        "get_sales_route_aggregate",
        { p_brand_id: opts.brandId, p_date: opts.routeDate },
      );
      if (aggErr) {
        console.error("[sales-route] aggregate error", aggErr);
      } else {
        // Resolve recipient emails
        const emails = new Set<string>();
        const userIds: string[] = sched?.aggregate_recipient_user_ids || [];
        const extras: string[] = sched?.aggregate_extra_emails || [];
        if (userIds.length > 0) {
          const { data: users } = await supabase
            .from("users").select("email").in("id", userIds);
          (users || []).forEach((u: any) => u.email && emails.add(u.email));
        }
        extras.forEach(e => e && emails.add(e));

        for (const recipient of emails) {
          const idem = `sales-route-${opts.brandId}-${opts.routeDate}-aggregate-${recipient}`;
          const { data: existing } = await supabase
            .from("sales_route_dispatches")
            .select("id,status").eq("idempotency_key", idem).maybeSingle();
          if (existing && existing.status === "sent") { result.skipped++; continue; }

          const send = await sendTransactional(
            supabase,
            "sales-route-aggregate",
            recipient,
            idem,
            {
              brandName: opts.brandName || null,
              routeDate: opts.routeDate,
              groups: agg?.groups || [],
              totalAppointments: agg?.total_appointments || 0,
            },
          );
          await supabase.from("sales_route_dispatches").insert({
            brand_id: opts.brandId, route_date: opts.routeDate,
            dispatch_type: "aggregate", audience: "managers",
            recipient_user_id: null, recipient_email: recipient,
            appointments_count: agg?.total_appointments || 0,
            appointment_ids: [],
            email_message_id: send.messageId ?? null,
            status: send.ok ? "sent" : "failed",
            error_message: send.ok ? null : (send.error ?? null),
            idempotency_key: send.ok ? idem : (idem + "-err-" + Date.now()),
            triggered_by_user_id: opts.triggeredBy ?? null,
            trigger_source: opts.triggerSource,
          });
          if (send.ok) result.aggregate_sent++; else result.aggregate_failed++;
        }
      }
    }
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: x-cron-secret OR service-role Bearer (manual triggers from server).
  // For manual UI invocation we accept a normal user JWT as long as the body
  // includes brand_id and a triggered_by check passes via has_role.
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const authHeader = req.headers.get("authorization") || "";
  const isCron = CRON_SECRET && cronHeader === CRON_SECRET;
  const isService = authHeader === `Bearer ${SERVICE_KEY}`;

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  // For user-initiated manual sends, validate role via JWT
  let triggeredBy: string | null = null;
  if (!isCron && !isService) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Resolve internal user id
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: internal } = await adminClient
      .from("users").select("id").eq("supabase_auth_id", user.id).maybeSingle();
    if (!internal?.id) {
      return new Response(JSON.stringify({ error: "user_not_provisioned" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    triggeredBy = internal.id;

    // RBAC: must be admin / ceo / responsabile_venditori
    const { data: roleOk } = await adminClient.rpc("has_role", {
      _user_id: internal.id, _role: "admin",
    });
    const { data: roleCeo } = await adminClient.rpc("has_role", {
      _user_id: internal.id, _role: "ceo",
    });
    const { data: roleMgr } = await adminClient.rpc("has_role", {
      _user_id: internal.id, _role: "responsabile_venditori",
    });
    if (!roleOk && !roleCeo && !roleMgr) {
      return new Response(JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const results: any[] = [];

    if (body.brand_id) {
      // Manual trigger
      const { data: brand } = await supabase
        .from("brands").select("name").eq("id", body.brand_id).maybeSingle();
      const { data: schedule } = await supabase
        .from("sales_route_schedules").select("*").eq("brand_id", body.brand_id).maybeSingle();
      const audience = (body.audience as ProcessOpts["audience"]) || "both";
      const routeDate = body.route_date || addDaysIso(todayInTz(schedule?.timezone || "Europe/Rome").date, 1);
      const userIds: string[] | null = Array.isArray(body.user_ids) && body.user_ids.length > 0 ? body.user_ids : null;
      const triggerSource: ProcessOpts["triggerSource"] = userIds && userIds.length === 1
        ? "manual_single" : "manual_bulk";
      results.push(await processBrand(supabase, {
        brandId: body.brand_id, brandName: brand?.name ?? null,
        routeDate, audience, userIdsFilter: userIds,
        triggerSource, triggeredBy, schedule,
      }));
    } else {
      // CRON: scan active schedules
      const { data: schedules } = await supabase
        .from("sales_route_schedules").select("*").eq("is_active", true);
      for (const s of schedules || []) {
        const t = todayInTz(s.timezone || "Europe/Rome");
        if (!Array.isArray(s.days_of_week) || !s.days_of_week.includes(t.wd)) continue;
        const targetHm = String(s.send_at_local).slice(0, 5);
        if (minutesDiff(t.hhmm, targetHm) > 7) continue; // ±7 min window
        const routeDate = addDaysIso(t.date, 1);
        const { data: brand } = await supabase
          .from("brands").select("name").eq("id", s.brand_id).maybeSingle();
        const r = await processBrand(supabase, {
          brandId: s.brand_id, brandName: brand?.name ?? null,
          routeDate, audience: "both", userIdsFilter: null,
          triggerSource: "cron", triggeredBy: null, schedule: s,
        });
        await supabase.from("sales_route_schedules").update({
          last_run_at: new Date().toISOString(),
          last_run_status: `sent=${r.individual_sent + r.aggregate_sent} failed=${r.individual_failed + r.aggregate_failed}`,
        }).eq("id", s.id);
        results.push(r);
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sales-route-dispatcher] error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
