import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// H06 FIX: HTML-escape to prevent XSS
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
        status: 400, headers: { "Content-Type": "text/html" },
      });
    }

    if (!code || !stateParam) {
      return new Response(renderHtml("Errore", "Parametri mancanti"), {
        status: 400, headers: { "Content-Type": "text/html" },
      });
    }

    // H05 FIX: Parse and verify HMAC-signed state
    let brandId: string;
    let stateUserId: string;
    try {
      const stateObj = JSON.parse(atob(stateParam));
      brandId = stateObj.brand_id;
      stateUserId = stateObj.user_id;
      const stateSig = stateObj.sig;
      const stateExp = stateObj.exp;

      if (!brandId || !stateUserId || !stateSig || !stateExp) {
        return new Response(renderHtml("Errore", "State incompleto"), {
          status: 400, headers: { "Content-Type": "text/html" },
        });
      }

      // Check expiry (10 min)
      if (Date.now() > stateExp) {
        return new Response(renderHtml("Errore", "Link scaduto. Riprova il collegamento."), {
          status: 400, headers: { "Content-Type": "text/html" },
        });
      }

      // Verify HMAC signature
      const payloadToVerify = JSON.stringify({ brand_id: brandId, user_id: stateUserId, exp: stateExp });
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", encoder.encode(serviceKey), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const sigBytes = new Uint8Array(stateSig.match(/.{2}/g).map((b: string) => parseInt(b, 16)));
      const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payloadToVerify));

      if (!valid) {
        return new Response(renderHtml("Errore", "Firma state non valida. Possibile manomissione."), {
          status: 403, headers: { "Content-Type": "text/html" },
        });
      }
    } catch {
      return new Response(renderHtml("Errore", "State non valido"), {
        status: 400, headers: { "Content-Type": "text/html" },
      });
    }

    // H05 FIX: Verify the user from state has admin/ceo role on the brand
    const supabaseService = createClient(supabaseUrl, serviceKey);
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
        { status: 400, headers: { "Content-Type": "text/html" } }
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    if (!access_token || !refresh_token) {
      return new Response(
        renderHtml("Errore", "Token non ricevuti. Assicurati di aver usato prompt=consent."),
        { status: 400, headers: { "Content-Type": "text/html" } }
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

    // Store in oauth_tokens using service role
    const { error: upsertError } = await supabaseService
      .from("oauth_tokens")
      .upsert(
        {
          brand_id: brandId,
          provider: "google_ads",
          account_id: accountId,
          access_token_encrypted: access_token,
          refresh_token_encrypted: refresh_token,
          expires_at: expiresAt,
          scopes: ["https://www.googleapis.com/auth/adwords"],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "brand_id,provider,account_id" }
      );

    if (upsertError) {
      console.error("Failed to save OAuth token:", upsertError);
      return new Response(
        renderHtml("Errore", `Salvataggio token fallito: ${escapeHtml(upsertError.message)}`),
        { status: 500, headers: { "Content-Type": "text/html" } }
      );
    }

    return new Response(
      renderHtml(
        "Collegamento Riuscito! ✅",
        `Account Google Ads <strong>${escapeHtml(accountId)}</strong> collegato con successo.<br>Puoi chiudere questa finestra.`
      ),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("google-oauth-callback error:", err);
    return new Response(
      renderHtml("Errore", "Si è verificato un errore interno. Riprova."),
      { status: 500, headers: { "Content-Type": "text/html" } }
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