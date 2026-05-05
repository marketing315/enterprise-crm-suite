/**
 * A8 — Account lockout notification email.
 *
 * Triggered client-side when consume_auth_rate_limit returns locked=true.
 * Sends a security alert email to the user. Always returns 200 to avoid
 * leaking whether the email exists in the system (timing/oracle hardening).
 *
 * Dedup window: 1 hour per email (we don't want to spam if the attacker
 * keeps hitting the lockout repeatedly — the user already got the alert).
 *
 * Auth: public (verify_jwt=false) because called BEFORE the user can sign in.
 * Rate-limited internally by the client RPC + 1h dedup via email_send_log.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ReqBody {
  email?: string;
  retry_minutes?: number;
  ip_address?: string;
  user_agent?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Always return 200 (no oracle): silent ack on every error.
  const ok = () =>
    new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  try {
    if (req.method !== "POST") return ok();

    let body: ReqBody;
    try {
      body = (await req.json()) as ReqBody;
    } catch {
      return ok();
    }

    const email = (body.email || "").trim().toLowerCase();
    if (!email || !isEmail(email)) return ok();

    const retryMinutes = Math.max(1, Math.min(120, body.retry_minutes ?? 15));
    const userAgent = (body.user_agent || "").slice(0, 512);
    const ipAddress = (body.ip_address || "").slice(0, 64);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Check email exists in auth.users (silent if not, no oracle)
    const { data: userLookup } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const exists = userLookup?.users?.some(
      (u) => (u.email || "").toLowerCase() === email,
    );
    if (!exists) return ok();

    // 2. Dedup: don't send more than 1 lockout email per hour per address
    const { data: recent } = await supabase
      .from("email_send_log")
      .select("id, created_at")
      .eq("recipient_email", email)
      .eq("template_name", "account-locked")
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .limit(1);

    if (recent && recent.length > 0) {
      console.log("[lockout-email] dedup hit, skipping", { email_hash: email.slice(0, 3) + "***" });
      return ok();
    }

    // 3. Send via send-transactional-email
    const idempotencyKey = `lockout-${email}-${Math.floor(Date.now() / (60 * 60 * 1000))}`;
    const { error: sendErr } = await supabase.functions.invoke(
      "send-transactional-email",
      {
        body: {
          templateName: "account-locked",
          recipientEmail: email,
          idempotencyKey,
          templateData: {
            retryMinutes,
            ipAddress: ipAddress || undefined,
            userAgent: userAgent || undefined,
            whenIso: new Date().toISOString(),
          },
        },
      },
    );

    if (sendErr) {
      console.warn("[lockout-email] send failed", sendErr.message);
    }

    return ok();
  } catch (err) {
    console.error("[lockout-email] unexpected", err);
    return ok();
  }
});
