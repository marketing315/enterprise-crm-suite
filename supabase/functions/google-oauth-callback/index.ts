import { createClient } from "npm:@supabase/supabase-js@2";
import { SECURE_HTML_HEADERS } from "../_shared/secure-html.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HTML-escape to prevent XSS
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const googleClientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID")!;
    const googleClientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!;

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(renderHtml("Errore", `Autorizzazione negata: ${escapeHtml(error)}`), {
        status: 400, headers: { ...SECURE_HTML_HEADERS },
      });
    }

    if (!code || !stateParam) {
      return new Response(renderHtml("Errore", "Parametri mancanti"), {
        status: 400, headers: { ...SECURE_HTML_HEADERS },
      });
    }

    // C7: Single-use server-side state lookup (replaces HMAC verify).
    const supabaseService = createClient(supabaseUrl, serviceKey);
    let brandId: string;
    let stateUserId: string;
    try {
      const { consumeOAuthSession } = await import("../_shared/oauth-session.ts");
      const session = await consumeOAuthSession(supabaseService, stateParam, "google");
      brandId = session.brand_id;
      stateUserId = session.user_id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "state_invalid";
      return new Response(renderHtml("Errore", `State OAuth non valido o scaduto (${escapeHtml(msg)}).`), {
        status: 403, headers: { ...SECURE_HTML_HEADERS },
      });
    }

    // Verify the user from state has admin/ceo role on the brand
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
        status: 403, headers: { ...SECURE_HTML_HEADERS },
      });
    }

    // Exchange code for tokens
    const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Google token exchange error:", tokenData);
      return new Response(
        renderHtml("Errore", `Token exchange fallito: ${escapeHtml(tokenData.error_description || tokenData.error)}`),
        { status: 400, headers: { ...SECURE_HTML_HEADERS } }
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    if (!access_token || !refresh_token) {
      return new Response(
        renderHtml("Errore", "Token non ricevuti. Assicurati di aver usato prompt=consent."),
        { status: 400, headers: { ...SECURE_HTML_HEADERS } }
      );
    }

    const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    // Fetch Google Ads customer IDs accessible with this token
    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
    let accountId = "unknown";

    try {
      const customersResp = await fetch(
        "https://googleads.googleapis.com/v19/customers:listAccessibleCustomers",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "developer-token": developerToken,
          },
        }
      );

      if (!customersResp.ok) {
        const errText = await customersResp.text();
        console.warn("listAccessibleCustomers failed:", customersResp.status, errText);
      } else {
        const customersData = await customersResp.json();
        console.log("Accessible customers:", JSON.stringify(customersData));

        if (customersData.resourceNames?.length > 0) {
          const knownCustomerId = "3903638374";
          const match = customersData.resourceNames.find((r: string) => r.includes(knownCustomerId));
          accountId = match
            ? match.replace("customers/", "")
            : customersData.resourceNames[0].replace("customers/", "");
        }
      }
    } catch (err) {
      console.warn("Could not list accessible customers:", err);
    }

    // Store in oauth_tokens using service role.
    // A2: tokens go into Vault via wrapper; legacy columns stay empty.
    const { data: upserted, error: upsertError } = await supabaseService
      .from("oauth_tokens")
      .upsert(
        {
          brand_id: brandId,
          provider: "google_ads",
          account_id: accountId,
          access_token_encrypted: "",
          refresh_token_encrypted: "",
          expires_at: expiresAt,
          scopes: ["https://www.googleapis.com/auth/adwords"],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "brand_id,provider,account_id" }
      )
      .select("id")
      .single();

    if (upsertError || !upserted?.id) {
      console.error("Failed to save OAuth token:", upsertError);
      return new Response(
        renderHtml("Errore", `Salvataggio token fallito: ${escapeHtml(upsertError?.message ?? "unknown")}`),
        { status: 500, headers: { ...SECURE_HTML_HEADERS } }
      );
    }

    // Persist secrets in Vault
    const { error: vaultAccessErr } = await supabaseService.rpc("vault_put_oauth_secret", {
      p_token_id: upserted.id,
      p_kind: "access",
      p_value: access_token,
    });
    const { error: vaultRefreshErr } = await supabaseService.rpc("vault_put_oauth_secret", {
      p_token_id: upserted.id,
      p_kind: "refresh",
      p_value: refresh_token ?? "",
    });
    if (vaultAccessErr || vaultRefreshErr) {
      console.error("Failed to store OAuth tokens in Vault:", { vaultAccessErr, vaultRefreshErr });
      return new Response(
        renderHtml("Errore", "Salvataggio sicuro del token fallito."),
        { status: 500, headers: { ...SECURE_HTML_HEADERS } }
      );
    }

    return new Response(
      renderHtml(
        "Collegamento Riuscito! ✅",
        `Account Google Ads <strong>${escapeHtml(accountId)}</strong> collegato con successo.<br>Puoi chiudere questa finestra.`
      ),
      { status: 200, headers: { ...SECURE_HTML_HEADERS } }
    );
  } catch (err) {
    console.error("google-oauth-callback error:", err);
    return new Response(
      renderHtml("Errore", "Si è verificato un errore interno. Riprova."),
      { status: 500, headers: { ...SECURE_HTML_HEADERS } }
    );
  }
});

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