// Edge function: passkey-auth-begin
// Emette una challenge WebAuthn discoverable single-use con TTL 5 min.
// Niente userHandle nella richiesta: il browser sceglie quale passkey usare.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const body = (await req.json().catch(() => ({}))) as { rpId?: string };
    const rpId = (body.rpId ?? "").trim().toLowerCase();
    if (!rpId || rpId.length > 253 || !/^[a-z0-9.\-]+$/.test(rpId)) {
      return json({ error: "invalid_rp_id" }, 422);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Rate-limit IP best-effort (10 challenges/min/IP)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    try {
      const { data: allowed } = await admin.rpc("consume_ip_rate_limit", {
        _bucket: "passkey-auth-begin",
        _ip: ip,
        _max: 10,
        _window_seconds: 60,
      });
      if (allowed === false) return json({ error: "rate_limited" }, 429);
    } catch {
      /* RPC opzionale: se non esiste, lasciamo passare */
    }

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const challengeB64 = b64url(challenge);

    const { error: insErr } = await admin.from("passkey_auth_challenges").insert({
      challenge_b64: challengeB64,
      client_ip: ip,
    });
    if (insErr) {
      console.error("[passkey-begin] insert failed", insErr.message);
      return json({ error: "internal" }, 500);
    }

    // TTL: timeout client e finestra server allineati a 3 min (verify usa 3 min)
    return json({ challenge: challengeB64, rpId, timeout: 180_000 });
  } catch (e) {
    console.error("[passkey-begin] uncaught", e);
    return json({ error: "internal" }, 500);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
