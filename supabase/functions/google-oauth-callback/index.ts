import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      return new Response(renderHtml("Errore", `Autorizzazione negata: ${error}`), {
        status: 400, headers: { "Content-Type": "text/html" },
      });
    }

    if (!code || !stateParam) {
      return new Response(renderHtml("Errore", "Parametri mancanti"), {
        status: 400, headers: { "Content-Type": "text/html" },
      });
    }

    // Decode state
    let brandId: string;
    try {
      const state = JSON.parse(atob(stateParam));
      brandId = state.brand_id;
    } catch {
      return new Response(renderHtml("Errore", "State non valido"), {
        status: 400, headers: { "Content-Type": "text/html" },
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
        renderHtml("Errore", `Token exchange fallito: ${tokenData.error_description || tokenData.error}`),
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
          // Use the known customer ID if available, otherwise first one
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
    const supabase = createClient(supabaseUrl, serviceKey);

    const { error: upsertError } = await supabase
      .from("oauth_tokens")
      .upsert(
        {
          brand_id: brandId,
          provider: "google_ads",
          account_id: accountId,
          access_token_encrypted: access_token,
          refresh_token_encrypted: refresh_token,
          expires_at: expiresAt,
          scopes: ["https://www.googleapis.com/auth/adwords.readonly"],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "brand_id,provider,account_id" }
      );

    if (upsertError) {
      console.error("Failed to save OAuth token:", upsertError);
      return new Response(
        renderHtml("Errore", `Salvataggio token fallito: ${upsertError.message}`),
        { status: 500, headers: { "Content-Type": "text/html" } }
      );
    }

    return new Response(
      renderHtml(
        "Collegamento Riuscito! ✅",
        `Account Google Ads <strong>${accountId}</strong> collegato con successo.<br>Puoi chiudere questa finestra.`
      ),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("google-oauth-callback error:", err);
    return new Response(
      renderHtml("Errore", err instanceof Error ? err.message : "Errore sconosciuto"),
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }
});

function renderHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}
  .card{background:#fff;border-radius:12px;padding:2rem;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:420px;text-align:center}
  h1{font-size:1.4rem;margin:0 0 .5rem}
  p{color:#6b7280;line-height:1.5}
</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body>
</html>`;
}
