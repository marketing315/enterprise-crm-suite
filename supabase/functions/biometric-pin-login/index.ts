// Edge function: biometric-pin-login
// Riscatta il token one-shot emesso da verify_pin_login e restituisce
// una sessione Supabase valida che il client può applicare con setSession().
//
// Flusso:
//   client → start_pin_login(email)      → challenge_id
//   client → verify_pin_login(ch, hash)  → session_token (one-shot, 60s)
//   client → POST /biometric-pin-login   → { access_token, refresh_token }
//
// La sessione viene creata via Supabase Admin API generateLink(magiclink)
// che ci permette di ottenere properties.hashed_token, poi verifyOtp.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  session_token?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    const token = body?.session_token?.trim();
    if (!token || token.length < 32 || token.length > 256) {
      return json({ error: "invalid_token" }, 422);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Riscatta token one-shot (RPC service-role only)
    const { data: consumeData, error: consumeErr } = await admin.rpc(
      "consume_pin_login_token",
      { _session_token: token },
    );
    if (consumeErr) {
      console.error("[pin-login] consume rpc failed", consumeErr.message);
      return json({ error: "internal" }, 500);
    }
    const consume = (consumeData as {
      ok?: boolean;
      reason?: string;
      auth_user_id?: string;
      email?: string;
    }) ?? { ok: false };
    if (!consume.ok || !consume.email || !consume.auth_user_id) {
      return json({ error: consume.reason ?? "invalid_token" }, 401);
    }

    // 2) Genera un magic link per ottenere il token_hash da scambiare
    //    poi via verifyOtp lato server per estrarre access+refresh token.
    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: consume.email,
      });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error("[pin-login] generateLink failed", linkErr?.message);
      return json({ error: "session_unavailable" }, 500);
    }

    const tokenHash = linkData.properties.hashed_token;

    // 3) verifyOtp con il token_hash → sessione completa
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

    if (verifyErr || !verifyData?.session) {
      console.error("[pin-login] verifyOtp failed", verifyErr?.message);
      return json({ error: "session_unavailable" }, 500);
    }

    // 4) Audit best-effort
    try {
      await admin.rpc("log_audit_event", {
        _event_type: "auth_event",
        _action: "pin_login_session_issued",
        _details: {
          auth_user_id: consume.auth_user_id,
          email: consume.email,
        },
      });
    } catch {
      /* non-fatal */
    }

    return json({
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
      expires_at: verifyData.session.expires_at,
      user_id: consume.auth_user_id,
    });
  } catch (e) {
    console.error("[pin-login] uncaught", e);
    return json({ error: "internal" }, 500);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
