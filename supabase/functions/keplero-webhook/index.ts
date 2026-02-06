import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-keplero-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NormalizedPhone {
  normalized: string;
  countryCode: string;
  assumedCountry: boolean;
  raw: string;
}

function normalizePhone(phone: string, defaultCountry = "IT"): NormalizedPhone {
  const raw = phone;
  let normalized = phone.replace(/\D/g, "");
  let countryCode = defaultCountry;
  let assumedCountry = true;

  // Remove leading 39 for Italian numbers
  if (normalized.startsWith("39") && normalized.length > 10) {
    normalized = normalized.slice(2);
    countryCode = "IT";
    assumedCountry = false;
  }

  return { normalized, countryCode, assumedCountry, raw };
}

// Parse Italian date formats: "30-01-2026" or "2026-02-01"
function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr === "" || dateStr === "0") return null;
  
  // Try DD-MM-YYYY format
  const ddmmyyyy = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  // Try YYYY-MM-DD format (ISO)
  const iso = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return dateStr;
  }
  
  return null;
}

// Parse time "14:30" or "17:30"
function parseTime(timeStr: string): string {
  if (!timeStr || timeStr === "") return "10:00";
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return "10:00";
}

// Map pacemaker string to enum
function mapPacemakerStatus(value: string): "assente" | "presente" | "non_chiaro" | null {
  if (!value || value === "") return null;
  const v = value.toLowerCase();
  if (v === "no") return "assente";
  if (v === "si" || v === "sì") return "presente";
  if (v === "non_so") return "non_chiaro";
  return null;
}

// Map esito_chiamata to appointment status
function mapAppointmentStatus(esito: string): "scheduled" | "confirmed" | "cancelled" {
  if (!esito) return "scheduled";
  const e = esito.toLowerCase();
  if (e === "appuntamento_fissato") return "confirmed";
  if (e === "rifiuto") return "cancelled";
  if (e === "da_ricontattare") return "scheduled";
  return "scheduled";
}

// Extract brand name from email subject or body
function extractBrandName(config: Record<string, unknown>): string | null {
  const subject = (config.subject as string) || "";
  const body = (config.body as string) || "";
  
  // Look for "BRAND: Excell" pattern in body
  const brandMatch = body.match(/BRAND:\s*(\w+)/i);
  if (brandMatch) return brandMatch[1].toLowerCase();
  
  // Look for brand name in subject
  const subjectMatch = subject.match(/(EXCELL|MYMED|SONIMED)/i);
  if (subjectMatch) return subjectMatch[1].toLowerCase();
  
  return null;
}

interface KepleroArgs {
  Nome?: string;
  Cognome?: string;
  telefono_principale?: string;
  telefono_secondario?: string;
  citta?: string;
  cap?: number | string;
  indirizzo_completo?: string;
  zona?: string;
  data_appuntamento?: string;
  ora_appuntamento?: string;
  pacemaker?: string;
  ha_gia_dispositivo?: string;
  motivo_contatto?: string;
  esito_chiamata?: string;
  motivo_rifiuto?: string;
  note?: string;
  disponibilita_orarie?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Optional: verify shared secret
  const expectedSecret = Deno.env.get("KEPLERO_WEBHOOK_SECRET");
  if (expectedSecret) {
    const providedSecret = req.headers.get("x-keplero-secret");
    if (providedSecret !== expectedSecret) {
      console.error("Invalid Keplero secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("Keplero payload received:", JSON.stringify(payload));

  // Extract args and config from Keplero structure
  const args = (payload.args || payload) as KepleroArgs;
  const config = (payload.config || {}) as Record<string, unknown>;

  // Find brand by name from email content
  const brandName = extractBrandName(config);
  let brandId: string | null = null;

  if (brandName) {
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("id")
      .ilike("name", brandName)
      .single();
    
    if (brand) {
      brandId = brand.id;
    }
  }

  // Fallback to default brand if not found
  if (!brandId) {
    const { data: defaultBrand } = await supabaseAdmin
      .from("brands")
      .select("id")
      .eq("is_system", false)
      .limit(1)
      .single();
    
    brandId = defaultBrand?.id || null;
  }

  if (!brandId) {
    return new Response(JSON.stringify({ error: "No brand configured" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Determine event type based on esito_chiamata
  const esito = args.esito_chiamata?.toLowerCase() || "";
  let eventType = "keplero.lead"; // default
  if (esito === "da_ricontattare" || esito.includes("ricontatt")) {
    eventType = "keplero.ricontatto";
  } else if (esito === "appuntamento_fissato") {
    eventType = "keplero.appuntamento";
  } else if (esito === "rifiuto") {
    eventType = "keplero.rifiuto";
  }

  // Emit inbound event for automation processing
  const { data: inboundEvent, error: inboundError } = await supabaseAdmin
    .from("webhook_inbound_events")
    .insert({
      brand_id: brandId,
      source: "keplero",
      event_type: eventType,
      payload: payload,
      status: "pending",
    })
    .select("id")
    .single();

  if (inboundError) {
    console.warn("Failed to create inbound event:", inboundError);
  } else {
    console.log("Inbound event created:", inboundEvent.id, "type:", eventType);
  }

  // Extract phone (required)
  const phoneRaw = args.telefono_principale || "";
  if (!phoneRaw) {
    console.error("Missing phone number in Keplero payload");
    return new Response(JSON.stringify({ error: "Phone number required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const normalizedPhone = normalizePhone(phoneRaw);

  // Find or create contact
  const { data: contactId, error: contactError } = await supabaseAdmin.rpc(
    "find_or_create_contact",
    {
      p_brand_id: brandId,
      p_phone_normalized: normalizedPhone.normalized,
      p_phone_raw: normalizedPhone.raw,
      p_country_code: normalizedPhone.countryCode,
      p_assumed_country: normalizedPhone.assumedCountry,
      p_first_name: args.Nome || null,
      p_last_name: args.Cognome || null,
      p_email: null,
      p_city: args.citta || null,
      p_cap: args.cap?.toString() || null,
    }
  );

  if (contactError || !contactId) {
    console.error("Failed to find/create contact:", contactError);
    return new Response(JSON.stringify({ error: "Contact creation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update contact address if provided
  if (args.indirizzo_completo) {
    await supabaseAdmin
      .from("contacts")
      .update({ address: args.indirizzo_completo })
      .eq("id", contactId);
  }

  // Add secondary phone if provided
  if (args.telefono_secondario) {
    const secondaryNormalized = normalizePhone(args.telefono_secondario);
    await supabaseAdmin.rpc("add_contact_phone", {
      p_contact_id: contactId,
      p_phone_raw: secondaryNormalized.raw,
      p_is_primary: false,
    }).catch(err => console.warn("Secondary phone add failed:", err));
  }

  // Find or create deal
  const { data: dealId } = await supabaseAdmin.rpc("find_or_create_deal", {
    p_brand_id: brandId,
    p_contact_id: contactId,
  });

  // Parse appointment date/time
  const dateStr = parseDate(args.data_appuntamento || "");
  const timeStr = parseTime(args.ora_appuntamento || "");
  
  let scheduledAt: string | null = null;
  if (dateStr) {
    // Combine date and time into ISO string (assume Europe/Rome timezone)
    scheduledAt = `${dateStr}T${timeStr}:00+01:00`;
  }

  // Map pacemaker status
  const pacemakerStatus = mapPacemakerStatus(args.pacemaker || "");

  // Build notes combining various fields
  const notesParts: string[] = [];
  if (args.note) notesParts.push(args.note);
  if (args.motivo_contatto) notesParts.push(`Motivo contatto: ${args.motivo_contatto}`);
  if (args.disponibilita_orarie) notesParts.push(`Disponibilità: ${args.disponibilita_orarie}`);
  if (args.ha_gia_dispositivo) notesParts.push(`Ha già dispositivo: ${args.ha_gia_dispositivo}`);
  if (args.motivo_rifiuto) notesParts.push(`Motivo rifiuto: ${args.motivo_rifiuto}`);
  if (args.zona) notesParts.push(`Zona: ${args.zona}`);
  const combinedNotes = notesParts.join("\n");

  // Create lead_event with qualification metadata
  const { data: leadEvent, error: leadEventError } = await supabaseAdmin
    .from("lead_events")
    .insert({
      brand_id: brandId,
      contact_id: contactId,
      deal_id: dealId,
      source: "webhook" as const,
      source_name: "keplero",
      raw_payload: payload,
      occurred_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
      lead_source_channel: "other" as const,
      contact_channel: "chat" as const, // WhatsApp
      pacemaker_status: pacemakerStatus,
      booking_notes: combinedNotes || null,
      logistics_notes: args.disponibilita_orarie || null,
    })
    .select("id")
    .single();

  if (leadEventError) {
    console.error("Failed to create lead event:", leadEventError);
  }

  // Create appointment if we have a valid date
  let appointmentId: string | null = null;
  if (scheduledAt) {
    const appointmentStatus = mapAppointmentStatus(args.esito_chiamata || "");
    
    // Insert appointment directly (bypass RPC for service role)
    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .insert({
        brand_id: brandId,
        contact_id: contactId,
        deal_id: dealId,
        scheduled_at: scheduledAt,
        duration_minutes: 60,
        address: args.indirizzo_completo || null,
        city: args.citta || null,
        cap: args.cap?.toString() || null,
        notes: combinedNotes || null,
        status: appointmentStatus,
        appointment_type: "primo_appuntamento" as const,
      })
      .select("id")
      .single();

    if (appointmentError) {
      console.error("Failed to create appointment:", appointmentError);
    } else {
      appointmentId = appointment?.id || null;
    }

    // Log appointment creation in audit
    if (appointmentId) {
      await supabaseAdmin.from("audit_log").insert({
        brand_id: brandId,
        entity_type: "appointment",
        entity_id: appointmentId,
        action: "create",
        actor_user_id: null, // System action
        metadata: { source: "keplero" },
      });
    }
  }

  console.log(JSON.stringify({
    outcome: "success",
    brand_id: brandId,
    contact_id: contactId,
    deal_id: dealId,
    lead_event_id: leadEvent?.id,
    appointment_id: appointmentId,
    brand_name: brandName,
  }));

  return new Response(
    JSON.stringify({
      success: true,
      contact_id: contactId,
      deal_id: dealId,
      lead_event_id: leadEvent?.id || null,
      appointment_id: appointmentId,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
