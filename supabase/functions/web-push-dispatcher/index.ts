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

// Normalize a possibly-malformed base64url key: strip whitespace, convert
// standard base64 (+/) to base64url (-_), drop padding.
function normalizeBase64Url(v: string | undefined): string {
  return (v ?? "")
    .replace(/\s+/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const VAPID_PUBLIC = normalizeBase64Url(Deno.env.get("VAPID_PUBLIC_KEY"));
const VAPID_PRIVATE = normalizeBase64Url(Deno.env.get("VAPID_PRIVATE_KEY"));
// VAPID subject must be a URL (mailto:... or https://...). Normalize a bare
// email address to mailto: so a misconfigured secret doesn't crash the worker.
const RAW_VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") || "mailto:tech@gruppobenessere.it";
const VAPID_SUBJECT = /^(mailto:|https?:)/i.test(RAW_VAPID_SUBJECT)
  ? RAW_VAPID_SUBJECT
  : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(RAW_VAPID_SUBJECT)
    ? `mailto:${RAW_VAPID_SUBJECT}`
    : "mailto:tech@gruppobenessere.it";

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
} catch (e) {
  console.error(
    "[web-push-dispatcher] invalid VAPID configuration:",
    (e as Error)?.message ?? e,
  );
  throw e;
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
}

function buildLink(n: NotificationRow): string {
  if (n.entity_type === "chat_thread" && n.entity_id) {
    return `/chat?thread=${n.entity_id}`;
  }
  if (n.entity_type === "ticket" && n.entity_id) {
    return `/tickets/${n.entity_id}`;
  }
  if (n.entity_type === "deal" && n.entity_id) {
    return `/pipeline?deal=${n.entity_id}`;
  }
  if (n.entity_type === "appointment" && n.entity_id) {
    return `/appointments/${n.entity_id}`;
  }
  return "/notifications";
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
      .select("id, user_id, type, title, body, entity_type, entity_id")
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
      body: n.body ?? "",
      url: buildLink(n),
      type: n.type,
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
