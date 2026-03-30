import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-keplero-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Pragma": "no-cache",
  "Expires": "0",
  "Surrogate-Control": "no-store",
  "Vary": "*",
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

  // Log essential request metadata for troubleshooting (no sensitive data)
  const phoneParams = url.searchParams.getAll("phone");
  console.log("[KepleroLookup] Incoming request", JSON.stringify({
    method: req.method,
    phoneParamsCount: phoneParams.length,
  }));

  // Keplero sends duplicate query params (e.g. phone={{placeholder}}&phone=realNumber)
  // getAll returns all values; we pick the last one that looks like a real value
  const phoneAll = phoneParams;
  let phoneRaw: string | null = phoneAll.reverse().find(p => p && !p.includes("{{") && !p.includes("}}")) || phoneAll[0] || null;
  let brandSlug: string | null = url.searchParams.get("brand_slug") || url.searchParams.get("brand");
  let brandIdParam: string | null = url.searchParams.get("brand_id");
  // Sanitize secret: strip zero-width spaces, non-breaking spaces, other invisible chars
  const rawSecret = url.searchParams.get("secret") || url.searchParams.get("x-keplero-secret");
  const secretFromQuery = rawSecret ? rawSecret.replace(/[\u200B\u200C\u200D\uFEFF\u00A0\s]/g, "") : null;
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

  // Reject unresolved placeholders or non-numeric values
  const digitsOnly = phoneRaw.replace(/\D/g, "");
  if (phoneRaw.includes("{{") || phoneRaw.includes("}}") || digitsOnly.length < 6) {
    return new Response(
      JSON.stringify({ error: `Phone placeholder not resolved or invalid: "${phoneRaw}". Send a real phone number.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // DEBUG: If phone is the special test number 3333333333, return random data
  // This helps Keplero's team diagnose caching issues on their platform
  const testNumber = "3333333333";
  const normalizedForTest = normalizePhone(phoneRaw);
  if (normalizedForTest === testNumber || digitsOnly === testNumber || digitsOnly === `39${testNumber}`) {
    const randomStatuses = ["new", "active", "qualified", "unqualified"];
    const randomData = {
      id: crypto.randomUUID(),
      first_name: "Test",
      last_name: "CacheDebug",
      full_name: "Test CacheDebug",
      email: "",
      phone: testNumber,
      status: randomStatuses[Math.floor(Math.random() * randomStatuses.length)],
      city: "",
      cap: "",
      address: "",
      province: "",
      country: "",
      lead_type: "",
      lead_message: "",
      lead_note: "",
      esito_chiamata: "",
      notes: "",
      ha_appuntamento: Math.random() > 0.5,
      prossimo_appuntamento: Math.random() > 0.5
        ? {
            data: new Date(Date.now() + Math.floor(Math.random() * 7 * 86400000)).toISOString(),
            stato: Math.random() > 0.5 ? "scheduled" : "confirmed",
            tipo: "visita",
            note: `Random test at ${new Date().toISOString()}`,
          }
        : null,
      custom_fields: {},
      _debug: {
        generated_at: new Date().toISOString(),
        random_seed: Math.random(),
        note: "This is random test data for cache debugging",
      },
    };
    console.log("[KepleroLookup] DEBUG test number detected, returning random data", {
      generated_at: randomData._debug.generated_at,
      status: randomData.status,
      ha_appuntamento: randomData.ha_appuntamento,
    });
    return new Response(JSON.stringify(randomData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

  console.log("[KepleroLookup] Brand resolved", {
    input_brand_slug: brandSlug,
    input_brand_id: brandIdParam,
    resolved_brand_id: brandId,
    resolved_brand_slug: resolvedBrandSlug,
  });

  // FR3: Validate secret - accepts header, body (POST), or query param fallback
  // Sanitize all secret sources from invisible Unicode chars
  const sanitizeSecret = (s: string | null) => s ? s.replace(/[\u200B\u200C\u200D\uFEFF\u00A0\s]/g, "") : null;
  const headerSecret = sanitizeSecret(req.headers.get("x-keplero-secret"));
  const providedSecret = headerSecret || sanitizeSecret(secretFromBody) || secretFromQuery;
  if (!providedSecret) {
    return new Response(
      JSON.stringify({ error: "Missing secret (x-keplero-secret header, secret in POST body, or ?secret=... query param)" }),
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
  const normalizedNoPrefix =
    normalizedPhone.startsWith("39") && normalizedPhone.length > 10
      ? normalizedPhone.slice(2)
      : normalizedPhone;
  const normalizedWithPrefix = normalizedNoPrefix.startsWith("39")
    ? normalizedNoPrefix
    : `39${normalizedNoPrefix}`;
  const candidatePhones = Array.from(
    new Set([normalizedPhone, normalizedNoPrefix, normalizedWithPrefix])
  ).filter(Boolean);

  // FR5: Search phone record by multiple normalized candidates within brand
  const { data: phoneRecords, error: phoneError } = await supabaseAdmin
    .from("contact_phones")
    .select("contact_id, brand_id, phone_normalized, is_primary")
    .eq("brand_id", brandId)
    .in("phone_normalized", candidatePhones)
    .order("is_primary", { ascending: false })
    .limit(5);

  if (phoneError) {
    console.error("[KepleroLookup] Phone query error:", phoneError.message);
  }

  console.log("[KepleroLookup] Phone match attempt", {
    phone_raw: phoneRaw,
    normalized_phone: normalizedPhone,
    candidate_phones: candidatePhones,
    brand_id: brandId,
    found_phone_records: phoneRecords?.length ?? 0,
    phone_query_error: phoneError?.message ?? null,
  });

  // FR6/FR7: Standard response
  if (!phoneRecords || phoneRecords.length === 0) {
    await supabaseAdmin.from("audit_log").insert({
      brand_id: brandId,
      entity_type: "keplero_lookup",
      entity_id: normalizedPhone,
      action: "lookup_not_found",
      metadata: { phone_raw: phoneRaw, normalized_candidates: candidatePhones, brand_slug: resolvedBrandSlug },
    });

    return new Response(
      JSON.stringify({}),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const selectedPhone = phoneRecords[0] as any;
  const { data: contact, error: contactError } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("id", selectedPhone.contact_id)
    .eq("brand_id", brandId)
    .maybeSingle();

  if (contactError) {
    console.error("[KepleroLookup] Contact query error:", contactError.message);
  }

  if (!contact) {
    console.log("[KepleroLookup] Contact not found after phone match", {
      selected_contact_id: selectedPhone?.contact_id ?? null,
      selected_phone_normalized: selectedPhone?.phone_normalized ?? null,
      brand_id: brandId,
    });
    return new Response(
      JSON.stringify({}),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Fetch tags for this contact
  const { data: tagLinks } = await supabaseAdmin
    .from("entity_tags")
    .select("tags(name)")
    .eq("entity_id", contact.id)
    .eq("entity_type", "contact");

  const tags = (tagLinks || []).map((tl: any) => tl.tags?.name).filter(Boolean);

  // Fetch custom field values with their labels
  const { data: customFieldValues } = await supabaseAdmin
    .from("contact_field_values")
    .select("value_text, value_number, value_bool, value_date, value_json, field_definition_id")
    .eq("contact_id", contact.id)
    .eq("brand_id", brandId);

  let customFields: Record<string, any> = {};
  if (customFieldValues && customFieldValues.length > 0) {
    const defIds = customFieldValues.map((v: any) => v.field_definition_id);
    const { data: defs } = await supabaseAdmin
      .from("contact_field_definitions")
      .select("id, key, label")
      .in("id", defIds);
    const defMap = new Map((defs || []).map((d: any) => [d.id, d]));
    for (const val of customFieldValues) {
      const def = defMap.get(val.field_definition_id);
      const key = def?.key || val.field_definition_id;
      const resolved = val.value_text ?? val.value_number ?? val.value_bool ?? val.value_date ?? val.value_json;
      if (resolved !== null && resolved !== undefined && resolved !== "") {
        customFields[key] = resolved;
      }
    }
  }

  // Fetch appointments for this contact
  const { data: appointments } = await supabaseAdmin
    .from("appointments")
    .select("id, scheduled_at, status, appointment_type, notes")
    .eq("contact_id", contact.id)
    .eq("brand_id", brandId)
    .order("scheduled_at", { ascending: false })
    .limit(5);

  const nextAppointment = (appointments || []).find(
    (a: any) => ["scheduled", "confirmed"].includes(a.status)
  );

  // ha_appuntamento: true if the deal's current stage is >= "Fissato" by order_index
  let hasAppointment = false;
  const { data: openDeal } = await supabaseAdmin
    .from("deals")
    .select("current_stage_id")
    .eq("contact_id", contact.id)
    .eq("brand_id", brandId)
    .eq("status", "open")
    .maybeSingle();

  if (openDeal?.current_stage_id) {
    // Get "Fissato" stage order_index and current stage order_index
    const { data: allStages } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id, name, order_index")
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    const fissatoStage = (allStages || []).find((s: any) =>
      s.name.toLowerCase().includes("fissat")
    );
    const currentStage = (allStages || []).find(
      (s: any) => s.id === openDeal.current_stage_id
    );

    if (fissatoStage && currentStage) {
      hasAppointment = currentStage.order_index >= fissatoStage.order_index;
    }
  }

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
      id: contact.id,
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      full_name: fullName,
      email: contact.email || "",
      phone: normalizedPhone,
      status: contact.status || "",
      city: contact.city || "",
      cap: contact.cap || "",
      address: contact.address || "",
      province: contact.province || "",
      country: contact.country || "",
      lead_type: contact.lead_type || "",
      lead_message: contact.lead_message || "",
      lead_note: contact.lead_note || "",
      esito_chiamata: contact.esito_chiamata || "",
      notes: contact.notes || "",
      ha_appuntamento: hasAppointment,
      prossimo_appuntamento: nextAppointment ? {
        data: nextAppointment.scheduled_at,
        stato: nextAppointment.status,
        tipo: nextAppointment.appointment_type || "",
        note: nextAppointment.notes || "",
      } : null,
      custom_fields: customFields,
      _nocache_ts: new Date().toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
