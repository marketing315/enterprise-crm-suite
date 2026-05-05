import { createClient } from "npm:@supabase/supabase-js@2";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}
  .card{background:#fff;border-radius:12px;padding:2rem;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:420px;text-align:center}
  h1{font-size:1.4rem;margin:0 0 .5rem}
  p{color:#6b7280;line-height:1.5}
</style></head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${body}</p></div></body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaAppId = Deno.env.get("META_OAUTH_APP_ID")!;
    const metaAppSecret = Deno.env.get("META_OAUTH_APP_SECRET")!;

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(renderHtml("Errore", `Autorizzazione negata: ${escapeHtml(error)}`), {
        status: 400, headers: { "Content-Type": "text/html" },
      });
    }

    if (!code || !stateParam) {
      return new Response(renderHtml("Errore", "Parametri mancanti"), {
        status: 400, headers: { "Content-Type": "text/html" },
      });
    }

    // C7: Single-use server-side state lookup (replaces HMAC verify).
    const supabaseService = createClient(supabaseUrl, serviceKey);
    let brandId: string;
    let stateUserId: string;
    try {
      const { consumeOAuthSession } = await import("../_shared/oauth-session.ts");
      const session = await consumeOAuthSession(supabaseService, stateParam, "meta");
      brandId = session.brand_id;
      stateUserId = session.user_id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "state_invalid";
      return new Response(renderHtml("Errore", `State OAuth non valido o scaduto (${escapeHtml(msg)}).`), {
        status: 403, headers: { "Content-Type": "text/html" },
      });
    }

    const { data: adminRole } = await supabaseService
      .from("user_roles")
      .select("id")
      .eq("user_id", stateUserId)
      .eq("brand_id", brandId)
      .in("role", ["admin", "ceo"])
      .limit(1)
      .maybeSingle();

    if (!adminRole) {
      return new Response(renderHtml("Errore", "Non hai i permessi per collegare questo brand."), {
        status: 403, headers: { "Content-Type": "text/html" },
      });
    }

    // Exchange code for short-lived token
    const redirectUri = `${supabaseUrl}/functions/v1/meta-oauth-callback`;
    const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", metaAppId);
    tokenUrl.searchParams.set("client_secret", metaAppSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenResp = await fetch(tokenUrl.toString());
    const tokenData = await tokenResp.json();

    if (tokenData.error) {
      console.error("Meta token exchange error:", tokenData);
      return new Response(
        renderHtml("Errore", `Token exchange fallito: ${escapeHtml(tokenData.error.message || tokenData.error)}`),
        { status: 400, headers: { "Content-Type": "text/html" } }
      );
    }

    const shortLivedToken = tokenData.access_token;
    if (!shortLivedToken) {
      return new Response(renderHtml("Errore", "Token non ricevuto."), {
        status: 400, headers: { "Content-Type": "text/html" },
      });
    }

    // Exchange for long-lived token
    const longLivedUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", metaAppId);
    longLivedUrl.searchParams.set("client_secret", metaAppSecret);
    longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    const longLivedResp = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResp.json();

    if (longLivedData.error) {
      console.error("Meta long-lived token error:", longLivedData);
      return new Response(
        renderHtml("Errore", `Errore token long-lived: ${escapeHtml(longLivedData.error.message)}`),
        { status: 400, headers: { "Content-Type": "text/html" } }
      );
    }

    const accessToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000; // ~60 days default
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Get ad accounts accessible with this token
    let accountId = "unknown";
    try {
      const meResp = await fetch(
        `https://graph.facebook.com/v20.0/me/adaccounts?fields=account_id,name&access_token=${accessToken}`
      );
      const meData = await meResp.json();
      if (meData.data?.length > 0) {
        accountId = meData.data[0].account_id;
      }
    } catch (err) {
      console.warn("Could not list Meta ad accounts:", err);
    }

    // Store in oauth_tokens. A2: token goes into Vault via wrapper.
    const { data: upserted, error: upsertError } = await supabaseService
      .from("oauth_tokens")
      .upsert(
        {
          brand_id: brandId,
          provider: "meta_ads",
          account_id: accountId,
          access_token_encrypted: "",
          refresh_token_encrypted: "", // Meta uses long-lived tokens, no refresh token
          expires_at: expiresAt,
          scopes: ["ads_read", "ads_management", "business_management"],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "brand_id,provider,account_id" }
      )
      .select("id")
      .single();

    if (upsertError || !upserted?.id) {
      console.error("Failed to save Meta OAuth token:", upsertError);
      return new Response(
        renderHtml("Errore", `Salvataggio token fallito: ${escapeHtml(upsertError?.message ?? "unknown")}`),
        { status: 500, headers: { "Content-Type": "text/html" } }
      );
    }

    const { error: vaultErr } = await supabaseService.rpc("vault_put_oauth_secret", {
      p_token_id: upserted.id,
      p_kind: "access",
      p_value: accessToken,
    });
    if (vaultErr) {
      console.error("Failed to store Meta token in Vault:", vaultErr);
      return new Response(
        renderHtml("Errore", "Salvataggio sicuro del token fallito."),
        { status: 500, headers: { "Content-Type": "text/html" } }
      );
    }

    return new Response(
      renderHtml(
        "Collegamento Riuscito! ✅",
        `Account Meta Ads <strong>${escapeHtml(accountId)}</strong> collegato con successo.<br>Puoi chiudere questa finestra.`
      ),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("meta-oauth-callback error:", err);
    return new Response(
      renderHtml("Errore", "Si è verificato un errore interno. Riprova."),
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }
});
