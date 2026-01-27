import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NormalizedPhone {
  normalized: string;
  countryCode: string;
  assumedCountry: boolean;
  raw: string;
}

// Phone normalization with country detection
function normalizePhone(phone: string, defaultCountry = "IT"): NormalizedPhone {
  const raw = phone;
  let normalized = phone.replace(/\D/g, "");
  let countryCode = defaultCountry;
  let assumedCountry = true;

  const prefixes: Record<string, string> = {
    "39": "IT",
    "44": "GB",
    "49": "DE",
    "33": "FR",
    "34": "ES",
    "41": "CH",
    "43": "AT",
    "1": "US",
  };

  const sortedPrefixes = Object.entries(prefixes).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [prefix, country] of sortedPrefixes) {
    if (normalized.startsWith(prefix) && normalized.length > 10) {
      normalized = normalized.slice(prefix.length);
      countryCode = country;
      assumedCountry = false;
      break;
    }
  }

  return { normalized, countryCode, assumedCountry, raw };
}

// Verify API key using constant-time comparison
async function verifyApiKey(
  providedKey: string,
  storedHash: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(providedKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const providedHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return providedHash === storedHash;
}

// Hash API key for storage
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Apply field mapping from webhook source config
function applyMapping(
  payload: Record<string, unknown>,
  mapping: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [targetField, sourceField] of Object.entries(mapping)) {
    if (sourceField in payload) {
      result[targetField] = payload[sourceField];
    }
  }

  // Keep unmapped fields
  for (const [key, value] of Object.entries(payload)) {
    if (!Object.values(mapping).includes(key)) {
      result[key] = value;
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const sourceId = pathParts[pathParts.length - 1];

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!sourceId || sourceId === "webhook-ingest" || !uuidRegex.test(sourceId)) {
      return new Response(
        JSON.stringify({ error: "Valid source ID (UUID) required in URL path" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing X-API-Key header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin client (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find webhook source by UUID and DERIVE brand_id (server-side only)
    const { data: source, error: sourceError } = await supabaseAdmin
      .from("webhook_sources")
      .select("id, name, brand_id, api_key_hash, rate_limit_per_min, mapping, is_active")
      .eq("id", sourceId)
      .maybeSingle();

    if (sourceError || !source) {
      return new Response(JSON.stringify({ error: "Unknown webhook source" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if source is active - return 409 if inactive
    if (!source.is_active) {
      return new Response(
        JSON.stringify({ error: "inactive_source", message: "Webhook source is not active" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate API key
    const isValidKey = await verifyApiKey(apiKey, source.api_key_hash);
    if (!isValidKey) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // brand_id derived server-side, never from client
    const brandId = source.brand_id;

    // Rate limit check
    const { data: hasToken, error: rateLimitError } = await supabaseAdmin.rpc(
      "consume_rate_limit_token",
      { p_source_id: source.id }
    );

    if (rateLimitError || !hasToken) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", retry_after: 60 }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        }
      );
    }

    // Parse body
    let rawBody: Record<string, unknown>;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store incoming request for audit
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const { data: incomingRequest, error: incomingError } = await supabaseAdmin
      .from("incoming_requests")
      .insert({
        source_id: source.id,
        brand_id: brandId,
        raw_body: rawBody,
        headers: Object.fromEntries(req.headers.entries()),
        ip_address: ipAddress,
        processed: false,
      })
      .select("id")
      .single();

    if (incomingError) {
      console.error("Failed to log incoming request:", incomingError);
    }

    // Apply field mapping
    const mappedPayload = source.mapping
      ? applyMapping(rawBody, source.mapping as Record<string, string>)
      : rawBody;

    // Extract phone and normalize
    const phoneRaw = String(
      mappedPayload.phone || mappedPayload.telefono || mappedPayload.mobile || ""
    ).trim();

    if (!phoneRaw) {
      // Update incoming request with error
      if (incomingRequest?.id) {
        await supabaseAdmin
          .from("incoming_requests")
          .update({ processed: true, error_message: "No phone number provided" })
          .eq("id", incomingRequest.id);
      }

      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const normalizedPhone = normalizePhone(phoneRaw);

    // Extract other fields
    const firstName = String(
      mappedPayload.first_name ||
        mappedPayload.firstName ||
        mappedPayload.nome ||
        ""
    ).trim() || null;

    const lastName = String(
      mappedPayload.last_name ||
        mappedPayload.lastName ||
        mappedPayload.cognome ||
        ""
    ).trim() || null;

    const email = String(mappedPayload.email || "").trim() || null;
    const city = String(mappedPayload.city || mappedPayload.citta || "").trim() || null;
    const cap = String(mappedPayload.cap || mappedPayload.zip || "").trim() || null;

    // Find or create contact (deduplication by normalized phone)
    const { data: contactId, error: contactError } = await supabaseAdmin.rpc(
      "find_or_create_contact",
      {
        p_brand_id: brandId,
        p_phone_normalized: normalizedPhone.normalized,
        p_phone_raw: normalizedPhone.raw,
        p_country_code: normalizedPhone.countryCode,
        p_assumed_country: normalizedPhone.assumedCountry,
        p_first_name: firstName,
        p_last_name: lastName,
        p_email: email,
        p_city: city,
        p_cap: cap,
      }
    );

    if (contactError || !contactId) {
      console.error("Failed to find/create contact:", contactError);

      if (incomingRequest?.id) {
        await supabaseAdmin
          .from("incoming_requests")
          .update({
            processed: true,
            error_message: `Contact creation failed: ${contactError?.message}`,
          })
          .eq("id", incomingRequest.id);
      }

      return new Response(
        JSON.stringify({ error: "Failed to process contact" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // M2.3: Find or create deal for this contact
    const { data: dealId, error: dealError } = await supabaseAdmin.rpc(
      "find_or_create_deal",
      { p_brand_id: brandId, p_contact_id: contactId }
    );

    if (dealError) {
      console.error("Failed to find/create deal:", dealError);
    }

    // Create lead event (append-only) with deal_id
    const { data: leadEvent, error: leadEventError } = await supabaseAdmin
      .from("lead_events")
      .insert({
        brand_id: brandId,
        contact_id: contactId,
        deal_id: dealId || null,
        source: "webhook",
        source_name: source.name,
        raw_payload: rawBody,
        occurred_at: new Date().toISOString(),
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (leadEventError) {
      console.error("Failed to create lead event:", leadEventError);
    }

    // Update incoming request as processed
    if (incomingRequest?.id) {
      await supabaseAdmin
        .from("incoming_requests")
        .update({
          processed: true,
          lead_event_id: leadEvent?.id || null,
        })
        .eq("id", incomingRequest.id);
    }

    // M9: Call sheets-export (fire-and-forget with short timeout)
    // This is async and won't block the ingest response
    if (leadEvent?.id) {
      const sheetsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sheets-export`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
        
        fetch(sheetsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ lead_event_id: leadEvent.id }),
          signal: controller.signal,
        })
          .then((res) => {
            clearTimeout(timeoutId);
            if (!res.ok) {
              console.error("Sheets export failed:", res.status);
            }
          })
          .catch((err) => {
            clearTimeout(timeoutId);
            console.error("Sheets export error (non-blocking):", err.message);
          });
      } catch (err) {
        // Fire-and-forget: don't block ingest on sheets errors
        console.error("Sheets export setup error:", err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        contact_id: contactId,
        deal_id: dealId || null,
        lead_event_id: leadEvent?.id || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
