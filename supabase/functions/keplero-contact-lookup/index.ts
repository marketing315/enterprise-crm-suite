import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-keplero-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function normalizePhone(phone: string): string {
  let normalized = phone.replace(/\D/g, "");
  // Remove leading 39 for Italian numbers
  if (normalized.startsWith("39") && normalized.length > 10) {
    normalized = normalized.slice(2);
  }
  // Remove leading 0039
  if (normalized.startsWith("0039")) {
    normalized = normalized.slice(4);
  }
  return normalized;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const url = new URL(req.url);
  let phoneRaw: string | null = url.searchParams.get("phone");
  let brandSlug: string | null = url.searchParams.get("brand_slug");
  let brandIdParam: string | null = url.searchParams.get("brand_id");
  let secretFromBody: string | null = null;
  const requestedAt = new Date().toISOString();

  if (req.method === "POST") {
    try {
      const body = await req.json();
      phoneRaw = phoneRaw ?? body?.phone ?? null;
      brandSlug = brandSlug ?? body?.brand_slug ?? null;
      brandIdParam = brandIdParam ?? body?.brand_id ?? null;
      secretFromBody = typeof body?.secret === "string" ? body.secret : null;
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // FR2: phone is required
  if (!phoneRaw) {
    return new Response(
      JSON.stringify({ error: "Missing required parameter: phone" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // FR2: brand_slug or brand_id required
  if (!brandSlug && !brandIdParam) {
    return new Response(
      JSON.stringify({ error: "Missing required parameter: brand_slug or brand_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Resolve brand
  let brandId: string | null = null;
  let resolvedBrandSlug = brandSlug || "";

  if (brandIdParam) {
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("id, name")
      .eq("id", brandIdParam)
      .eq("is_system", false)
      .single();
    if (brand) {
      brandId = brand.id;
      resolvedBrandSlug = brand.name?.toLowerCase() || "";
    }
  } else if (brandSlug) {
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("id, name")
      .ilike("name", brandSlug)
      .eq("is_system", false)
      .single();
    if (brand) {
      brandId = brand.id;
      resolvedBrandSlug = brand.name?.toLowerCase() || brandSlug;
    }
  }

  if (!brandId) {
    return new Response(
      JSON.stringify({ error: "Brand not found" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // FR3: Validate secret - check brand-specific secret first, then global
  const providedSecret = req.headers.get("x-keplero-secret") || secretFromBody;
  if (!providedSecret) {
    return new Response(
      JSON.stringify({ error: "Missing x-keplero-secret header (or secret in body for POST)" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Hash the provided secret for comparison
  const encoder = new TextEncoder();
  const data = encoder.encode(providedSecret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const providedHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Check brand-specific secret first, then global (brand_id IS NULL)
  const { data: secrets } = await supabaseAdmin
    .from("keplero_lookup_secrets")
    .select("secret_hash, brand_id")
    .eq("is_active", true)
    .or(`brand_id.eq.${brandId},brand_id.is.null`)
    .order("brand_id", { ascending: false, nullsFirst: false });

  const secretValid = secrets?.some((s: any) => s.secret_hash === providedHash);

  if (!secretValid) {
    console.error("[KepleroLookup] Invalid secret for brand:", brandId);
    return new Response(
      JSON.stringify({ error: "Invalid secret" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Check if lookup is enabled (brand override > global)
  const { data: settings } = await supabaseAdmin
    .from("keplero_lookup_settings")
    .select("is_enabled, brand_id")
    .or(`brand_id.eq.${brandId},brand_id.is.null`)
    .order("brand_id", { ascending: false, nullsFirst: false });

  // Brand-specific setting takes priority, then global, default disabled
  const effectiveSetting = settings?.[0];
  if (!effectiveSetting?.is_enabled) {
    return new Response(
      JSON.stringify({ error: "Keplero lookup is disabled for this brand" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // FR4: Normalize phone server-side
  const normalizedPhone = normalizePhone(phoneRaw);

  // FR5: Search contact by phone within brand only
  const { data: phoneRecords, error: phoneError } = await supabaseAdmin
    .from("contact_phones")
    .select("contact_id, brand_id, contacts(id, first_name, last_name, email, status, city, brand_id)")
    .eq("phone_normalized", normalizedPhone)
    .eq("brand_id", brandId)
    .limit(1);

  if (phoneError) {
    console.error("[KepleroLookup] Phone query error:", phoneError.message);
  }

  // FR6/FR7: Standard response
  if (!phoneRecords || phoneRecords.length === 0) {
    // Log lookup
    await supabaseAdmin.from("audit_log").insert({
      brand_id: brandId,
      entity_type: "keplero_lookup",
      entity_id: normalizedPhone,
      action: "lookup_not_found",
      metadata: { phone_raw: phoneRaw, brand_slug: resolvedBrandSlug },
    });

    return new Response(
      JSON.stringify({
        success: true,
        found: false,
        contact: null,
        meta: { brand_slug: resolvedBrandSlug, requested_at: requestedAt },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const contact = (phoneRecords[0] as any).contacts;

  // Fetch tags for this contact
  const { data: tagLinks } = await supabaseAdmin
    .from("entity_tags")
    .select("tags(name)")
    .eq("entity_id", contact.id)
    .eq("entity_type", "contact");

  const tags = (tagLinks || []).map((tl: any) => tl.tags?.name).filter(Boolean);

  // Log successful lookup
  await supabaseAdmin.from("audit_log").insert({
    brand_id: brandId,
    entity_type: "keplero_lookup",
    entity_id: contact.id,
    action: "lookup_found",
    metadata: { phone_raw: phoneRaw, brand_slug: resolvedBrandSlug },
  });

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ");

  return new Response(
    JSON.stringify({
      success: true,
      found: true,
      contact: {
        id: contact.id,
        first_name: contact.first_name || "",
        last_name: contact.last_name || "",
        full_name: fullName,
        email: contact.email || "",
        phone: normalizedPhone,
        status: contact.status || "",
        city: contact.city || "",
        tags,
      },
      meta: { brand_slug: resolvedBrandSlug, requested_at: requestedAt },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
