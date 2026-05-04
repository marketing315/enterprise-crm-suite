// Web Push dispatcher - sends Web Push to all subscriptions of the target user
// for a given notification id, respecting user_push_preferences.
//
// Body: { notification_id: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") || "mailto:tech@gruppobenessere.it";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  message: string | null;
  data: Record<string, unknown> | null;
  link: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const notificationId = body?.notification_id;
    if (!notificationId || typeof notificationId !== "string") {
      return json({ error: "notification_id required" }, 422);
    }

    // 1) Load notification
    const { data: notif, error: nErr } = await admin
      .from("notifications")
      .select("id, user_id, type, title, message, data, link")
      .eq("id", notificationId)
      .maybeSingle();

    if (nErr) throw nErr;
    if (!notif) return json({ error: "notification not found" }, 404);

    const n = notif as NotificationRow;

    // 2) Check user push preference (default enabled)
    const { data: pref } = await admin
      .from("user_push_preferences")
      .select("enabled")
      .eq("user_id", n.user_id)
      .eq("notification_type", n.type)
      .maybeSingle();

    if (pref && pref.enabled === false) {
      return json({ skipped: "user opted out", type: n.type });
    }

    // 3) Load all push subscriptions for the user
    const { data: subs, error: sErr } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", n.user_id);

    if (sErr) throw sErr;
    if (!subs || subs.length === 0) {
      return json({ skipped: "no subscriptions", user_id: n.user_id });
    }

    const payload = JSON.stringify({
      title: n.title ?? "Notifica",
      body: n.message ?? "",
      url: n.link ?? "/notifications",
      type: n.type,
      data: n.data ?? {},
      tag: `${n.type}-${n.id}`,
    });

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          payload,
        ),
      ),
    );

    let sent = 0;
    let removed = 0;
    let failed = 0;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const sub = subs[i];
      if (r.status === "fulfilled") {
        sent++;
        await admin
          .from("push_subscriptions")
          .update({
            last_used_at: new Date().toISOString(),
            failure_count: 0,
            last_error: null,
          })
          .eq("id", sub.id);
      } else {
        const err = r.reason as { statusCode?: number; body?: string };
        const code = err?.statusCode ?? 0;
        // 404 / 410 = subscription gone -> delete
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
          removed++;
        } else {
          failed++;
          await admin
            .from("push_subscriptions")
            .update({
              failure_count: 1,
              last_error: String(err?.body ?? r.reason).slice(0, 500),
            })
            .eq("id", sub.id);
        }
      }
    }

    return json({ sent, removed, failed, total: subs.length });
  } catch (e) {
    console.error("[web-push-dispatcher] error", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
