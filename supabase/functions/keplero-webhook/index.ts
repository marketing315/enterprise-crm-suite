import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-keplero-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Phone normalization ───────────────────────────────────────
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

  if (normalized.startsWith("39") && normalized.length > 10) {
    normalized = normalized.slice(2);
    countryCode = "IT";
    assumedCountry = false;
  }

  return { normalized, countryCode, assumedCountry, raw };
}

// ─── Date/time helpers ─────────────────────────────────────────
function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr === "" || dateStr === "0") return null;
  const ddmmyyyy = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const iso = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return dateStr;
  return null;
}

function parseTime(timeStr: string): string {
  if (!timeStr || timeStr === "") return "10:00";
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return "10:00";
}

// ─── Mapping helpers ───────────────────────────────────────────
function mapPacemakerStatus(value: string): string | null {
  if (!value || value === "") return null;
  const v = value.toLowerCase();
  if (v === "no") return "assente";
  if (v === "si" || v === "sì") return "presente";
  if (v === "non_so") return "non_chiaro";
  return null;
}

function mapAppointmentStatus(esito: string): "scheduled" | "confirmed" | "cancelled" {
  if (!esito) return "scheduled";
  const e = esito.toLowerCase();
  if (e === "appuntamento_fissato") return "scheduled";
  if (e === "rifiuto") return "cancelled";
  return "scheduled";
}

function extractBrandName(config: Record<string, unknown>): string | null {
  const body = (config.body as string) || "";
  const subject = (config.subject as string) || "";
  const brandMatch = body.match(/BRAND:\s*(\w+)/i);
  if (brandMatch) return brandMatch[1].toLowerCase();
  const subjectMatch = subject.match(/(EXCELL|MYMED|SONIMED)/i);
  if (subjectMatch) return subjectMatch[1].toLowerCase();
  return null;
}

function parseBooleanish(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const v = val.toLowerCase().trim();
    return v === "true" || v === "si" || v === "sì" || v === "1" || v === "yes";
  }
  return false;
}

function parseHasDevice(val: string | undefined): boolean | null {
  if (!val || val === "") return null;
  const v = val.toLowerCase();
  if (v === "si" || v === "sì" || v === "yes") return true;
  if (v === "no") return false;
  return null;
}

// ─── Fingerprint for idempotency ───────────────────────────────
function computeFingerprint(brandId: string, args: KepleroArgs): string {
  const key = [
    brandId,
    args.telefono_utente || args.telefono_principale || "",
    args.telefono_principale || "",
    args.data_appuntamento || "",
    args.ora_appuntamento || "",
    args.esito_chiamata || "",
    args.Nome || "",
    args.Cognome || "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

// ─── Types ─────────────────────────────────────────────────────
interface KepleroArgs {
  Nome?: string;
  Cognome?: string;
  telefono_utente?: string;
  telefono_principale?: string;
  telefono_secondario?: string;
  citta?: string;
  cap?: number | string;
  indirizzo?: string;
  indirizzo_completo?: string;
  numero_civico?: string;
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
  fissato_keplero?: string | boolean;
}

// ─── Main handler ──────────────────────────────────────────────
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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Auth: accept internal forwarding (dedicated token) OR KEPLERO_WEBHOOK_SECRET ──
  const internalServiceToken = Deno.env.get("INTERNAL_SERVICE_TOKEN") || "";
  const internalForward = req.headers.get("x-internal-forward");
  const kepleroSecret = req.headers.get("x-keplero-secret");
  const expectedSecret = Deno.env.get("KEPLERO_WEBHOOK_SECRET");

  const isInternalCall = internalServiceToken && internalForward && internalForward === internalServiceToken;
  const isDirectCall = expectedSecret && kepleroSecret === expectedSecret;

  if (!isInternalCall && !isDirectCall) {
    console.error("[Keplero] Unauthorized: no valid internal token or keplero secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Parse payload ──
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  console.log("[Keplero] Payload received:", JSON.stringify(payload));

  // ── Global try/catch to prevent unhandled 500s ──
  try {
    return await handleKepleroPayload(supabaseAdmin, req, payload);
  } catch (err) {
    console.error("[Keplero] UNHANDLED ERROR:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error("[Keplero] Stack:", errorStack);
    return new Response(
      JSON.stringify({ error: "Internal processing error", detail: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Extracted handler for global error boundary ───────────────
async function handleKepleroPayload(
  supabaseAdmin: ReturnType<typeof createClient>,
  req: Request,
  payload: Record<string, unknown>,
): Promise<Response> {
  const args = (payload.args || payload) as KepleroArgs;
  const config = (payload.config || {}) as Record<string, unknown>;

  // ── Resolve brand ──
  const url = new URL(req.url);
  const brandParam = url.searchParams.get("brand")?.trim().toLowerCase() || null;
  const brandName = brandParam || extractBrandName(config);
  let brandId: string | null = null;

  if (brandName) {
    const { data: bySlug } = await supabaseAdmin
      .from("brands").select("id").eq("slug", brandName).maybeSingle();
    if (bySlug) {
      brandId = bySlug.id;
    } else {
      const { data: byName } = await supabaseAdmin
        .from("brands").select("id").ilike("name", brandName).maybeSingle();
      if (byName) brandId = byName.id;
    }
  }
  if (!brandId) {
    console.error("[Keplero] Brand not resolved", { brandParam, brandName });
    return new Response(JSON.stringify({ error: "Brand not resolved. Use ?brand=<slug>." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Determine requester phone (telefono_utente) vs beneficiary (telefono_principale) ──
  const requesterPhoneRaw = args.telefono_utente || args.telefono_principale || "";
  const beneficiaryPhoneRaw = args.telefono_principale || "";

  if (!requesterPhoneRaw) {
    console.error("[Keplero] No phone number in payload");
    return new Response(JSON.stringify({ error: "Phone number required (telefono_utente or telefono_principale)" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requesterPhone = normalizePhone(requesterPhoneRaw);
  const beneficiaryPhone = beneficiaryPhoneRaw ? normalizePhone(beneficiaryPhoneRaw) : null;
  const isSamePerson = !beneficiaryPhone || requesterPhone.normalized === beneficiaryPhone.normalized;

  // ── Idempotency check ──
  const fingerprint = computeFingerprint(brandId, args);
  const { data: existingInteraction } = await supabaseAdmin
    .from("keplero_interactions")
    .select("id")
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (existingInteraction) {
    console.log("[Keplero] Duplicate detected, fingerprint:", fingerprint);
    return new Response(JSON.stringify({ success: true, duplicate: true, interaction_id: existingInteraction.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Emit inbound event ──
  const esito = args.esito_chiamata?.toLowerCase() || "";
  const isFissatoFlag = parseBooleanish(args.fissato_keplero);
  let eventType = "keplero.lead";
  if (esito === "da_ricontattare" || esito.includes("ricontatt")) eventType = "keplero.ricontatto";
  else if (esito === "appuntamento_fissato") eventType = "keplero.appuntamento";
  else if (esito === "rifiuto") eventType = "keplero.rifiuto";
  // Fallback: se fissato_keplero=true, forza appuntamento indipendentemente dall'esito
  if (isFissatoFlag && eventType === "keplero.lead") eventType = "keplero.appuntamento";

  const { data: inboundEvent } = await supabaseAdmin
    .from("webhook_inbound_events")
    .insert({ brand_id: brandId, source: "keplero", event_type: eventType, payload, status: "pending" })
    .select("id").single();

  // ── Find or create household contact (using requester phone) ──
  // NO overwrite on existing root contact — find_or_create_contact only fills NULLs via COALESCE
  // Build full address from parts
  const addressParts = [args.indirizzo || args.indirizzo_completo, args.numero_civico].filter(Boolean);
  const fullAddress = addressParts.length > 0
    ? [addressParts.join(" "), args.cap?.toString(), args.citta].filter(Boolean).join(", ")
    : null;

  const { data: contactId, error: contactError } = await supabaseAdmin.rpc(
    "find_or_create_contact",
    {
      p_brand_id: brandId,
      p_phone_normalized: requesterPhone.normalized,
      p_phone_raw: requesterPhone.raw,
      p_country_code: requesterPhone.countryCode,
      p_assumed_country: requesterPhone.assumedCountry,
      p_first_name: args.Nome || null,
      p_last_name: args.Cognome || null,
      p_email: null,
      p_city: args.citta || null,
      p_cap: args.cap?.toString() || null,
      p_address: fullAddress,
    }
  );

  if (contactError || !contactId) {
    console.error("[Keplero] Contact creation failed:", contactError);
    return new Response(JSON.stringify({ error: "Contact creation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Link household people ──
  const pacemakerStatus = mapPacemakerStatus(args.pacemaker || "");
  const hasDevice = parseHasDevice(args.ha_gia_dispositivo);

  // Requester person
  const { data: requesterPersonId, error: requesterError } = await supabaseAdmin.rpc("find_or_link_household_person", {
    p_contact_id: contactId,
    p_brand_id: brandId,
    p_role: "requester",
    p_phone_raw: requesterPhone.raw,
    p_phone_normalized: requesterPhone.normalized,
    p_first_name: args.Nome || null,
    p_last_name: args.Cognome || null,
    p_pacemaker_status: isSamePerson ? pacemakerStatus : null,
    p_has_device: isSamePerson ? hasDevice : null,
  });
  if (requesterError) {
    console.error("[Keplero] Requester household link failed:", requesterError.message);
  }

  // Beneficiary person (only if different from requester)
  let beneficiaryPersonId: string | null = null;
  if (!isSamePerson && beneficiaryPhone) {
    const { data: bpId, error: beneficiaryError } = await supabaseAdmin.rpc("find_or_link_household_person", {
      p_contact_id: contactId,
      p_brand_id: brandId,
      p_role: "beneficiary",
      p_phone_raw: beneficiaryPhone.raw,
      p_phone_normalized: beneficiaryPhone.normalized,
      p_first_name: null,
      p_last_name: null,
      p_pacemaker_status: pacemakerStatus,
      p_has_device: hasDevice,
    });
    if (beneficiaryError) {
      console.error("[Keplero] Beneficiary household link failed:", beneficiaryError.message);
    }
    beneficiaryPersonId = bpId;
  }

  // ── Add secondary phone as alias ──
  if (args.telefono_secondario) {
    const secondaryNormalized = normalizePhone(args.telefono_secondario);
    const { error: secondaryPhoneError } = await supabaseAdmin.rpc("add_contact_phone", {
      p_contact_id: contactId,
      p_phone_raw: secondaryNormalized.raw,
      p_is_primary: false,
    });
    if (secondaryPhoneError) {
      console.error("[Keplero] Failed to add secondary phone:", secondaryPhoneError.message);
    }
  }

  // ── Find or create deal ──
  const { data: dealId, error: dealError } = await supabaseAdmin.rpc("find_or_create_deal", {
    p_brand_id: brandId,
    p_contact_id: contactId,
  });
  if (dealError) {
    console.error("[Keplero] Deal find/create failed:", dealError.message);
  }

  // ── Create appointment (always new if date present) ──
  const dateStr = parseDate(args.data_appuntamento || "");
  const timeStr = parseTime(args.ora_appuntamento || "");
  let scheduledAt: string | null = null;
  if (dateStr) scheduledAt = `${dateStr}T${timeStr}:00+01:00`;

  const addressFull = [args.indirizzo || args.indirizzo_completo, args.numero_civico]
    .filter(Boolean).join(" ").trim() || null;

  const notesParts: string[] = [];
  if (args.note) notesParts.push(args.note);
  if (args.motivo_contatto) notesParts.push(`Motivo contatto: ${args.motivo_contatto}`);
  if (args.disponibilita_orarie) notesParts.push(`Disponibilità: ${args.disponibilita_orarie}`);
  if (args.ha_gia_dispositivo) notesParts.push(`Ha già dispositivo: ${args.ha_gia_dispositivo}`);
  if (args.motivo_rifiuto) notesParts.push(`Motivo rifiuto: ${args.motivo_rifiuto}`);
  if (args.zona) notesParts.push(`Zona: ${args.zona}`);
  const combinedNotes = notesParts.join("\n") || null;

  let appointmentId: string | null = null;
  if (scheduledAt) {
    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .insert({
        brand_id: brandId,
        contact_id: contactId,
        deal_id: dealId,
        scheduled_at: scheduledAt,
        duration_minutes: 60,
        address: addressFull,
        city: args.citta || null,
        cap: args.cap?.toString() || null,
        notes: combinedNotes,
        status: mapAppointmentStatus(args.esito_chiamata || ""),
        appointment_type: "primo_appuntamento",
      })
      .select("id").single();

    if (appointmentError) {
      console.error("[Keplero] Appointment creation failed:", appointmentError);
    } else {
      appointmentId = appointment?.id || null;
      if (appointmentId) {
        await supabaseAdmin.from("audit_log").insert({
          brand_id: brandId,
          entity_type: "appointment",
          entity_id: appointmentId,
          action: "create",
          actor_user_id: null,
          metadata: { source: "keplero", fingerprint },
        });
      }
    }
  }

  // ── fissato_keplero → auto-stage deal to "Fissato" ──
  const isFissato = isFissatoFlag;
  if (isFissato && dealId) {
    // Find the "Fissato" global stage
    const { data: fissatoStage } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id")
      .eq("name", "Fissato")
      .is("brand_id", null)
      .eq("is_active", true)
      .maybeSingle();

    if (fissatoStage) {
      // Get current stage for audit
      const { data: currentDeal } = await supabaseAdmin
        .from("deals")
        .select("current_stage_id")
        .eq("id", dealId)
        .single();

      const fromStageId = currentDeal?.current_stage_id || null;

      if (fromStageId !== fissatoStage.id) {
        const { error: dealUpdateError } = await supabaseAdmin
          .from("deals")
          .update({ current_stage_id: fissatoStage.id, updated_at: new Date().toISOString() })
          .eq("id", dealId);
        
        if (dealUpdateError) {
          console.error("[Keplero] Deal update to Fissato FAILED:", dealUpdateError);
        } else {
          console.log("[Keplero] Deal updated to Fissato successfully:", dealId);
        }

        await supabaseAdmin.from("deal_stage_history").insert({
          deal_id: dealId,
          from_stage_id: fromStageId,
          to_stage_id: fissatoStage.id,
          notes: "Auto-stage da Keplero: fissato_keplero=true",
        });

        await supabaseAdmin.from("audit_log").insert({
          brand_id: brandId,
          entity_type: "deal",
          entity_id: dealId,
          action: "auto_stage_fissato",
          actor_user_id: null,
          metadata: { source: "keplero", fingerprint, from_stage_id: fromStageId, to_stage_id: fissatoStage.id },
        });

        console.log("[Keplero] Deal auto-staged to Fissato:", dealId);
      }
    }
  }

  // ── Create lead_event (append-only) ──
  const { data: leadEvent, error: leadEventError } = await supabaseAdmin
    .from("lead_events")
    .insert({
      brand_id: brandId,
      contact_id: contactId,
      deal_id: dealId,
      source: "webhook",
      source_name: "keplero",
      raw_payload: payload,
      occurred_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
      lead_source_channel: "other",
      contact_channel: "chat",
      pacemaker_status: pacemakerStatus,
      booking_notes: combinedNotes,
      logistics_notes: args.disponibilita_orarie || null,
    })
    .select("id").single();
  if (leadEventError) {
    console.error("[Keplero] Lead event insert failed:", leadEventError.message);
  }

  // ── Create keplero_interaction record (append-only, idempotent) ──
  const { data: interaction, error: interactionError } = await supabaseAdmin
    .from("keplero_interactions")
    .insert({
      brand_id: brandId,
      contact_id: contactId,
      deal_id: dealId,
      requester_person_id: requesterPersonId || null,
      beneficiary_person_id: isSamePerson ? (requesterPersonId || null) : (beneficiaryPersonId || null),
      esito_chiamata: args.esito_chiamata || null,
      motivo_contatto: args.motivo_contatto || null,
      motivo_rifiuto: args.motivo_rifiuto || null,
      disponibilita_orarie: args.disponibilita_orarie || null,
      fissato_keplero: isFissato,
      appointment_id: appointmentId,
      fingerprint,
      raw_payload: payload,
    })
    .select("id").single();

  if (interactionError) {
    console.error("[Keplero] Interaction insert error:", interactionError);
  }

  // ── Upsert custom field values ──
  const fieldMap: Record<string, string | undefined> = {
    cap_keplero: args.cap?.toString(),
    nome_keplero: args.Nome,
    numero_keplero: args.telefono_utente || args.telefono_principale,
    zona_keplero: args.zona,
    citta_keplero: args.citta,
    cognome_keplero: args.Cognome,
    indirizzo_keplero: addressFull || undefined,
    pacemaker_keplero: args.pacemaker,
    numero_civico_keplero: args.numero_civico,
    esito_chiamata_keplero: args.esito_chiamata,
    motivo_rifiuto_keplero: args.motivo_rifiuto,
    motivo_contatto_keplero: args.motivo_contatto,
    ora_appuntamento_keplero: args.ora_appuntamento,
    data_appuntamento_keplero: args.data_appuntamento,
    ha_gia_dispositivo_keplero: args.ha_gia_dispositivo,
    telefono_principale_keplero: args.telefono_principale,
    telefono_secondario_keplero: args.telefono_secondario,
    disponibilita_orarie_keplero: args.disponibilita_orarie,
    fissato_keplero: isFissato ? "sì" : "no",
  };

  // Build field values array for upsert
  const fieldEntries = Object.entries(fieldMap)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([key, value]) => ({ field_key: key, value: value as string }));

  if (fieldEntries.length > 0) {
    const { error: fieldsError } = await supabaseAdmin.rpc("upsert_contact_field_values_by_key", {
      p_contact_id: contactId,
      p_brand_id: brandId,
      p_field_values: fieldEntries,
    });
    if (fieldsError) {
      console.error("[Keplero] Custom fields upsert error:", fieldsError.message);
    }
  }

  // ── Response ──
  const result = {
    success: true,
    contact_id: contactId,
    deal_id: dealId,
    lead_event_id: leadEvent?.id || null,
    appointment_id: appointmentId,
    interaction_id: interaction?.id || null,
    requester_person_id: requesterPersonId || null,
    beneficiary_person_id: isSamePerson ? null : (beneficiaryPersonId || null),
    fissato_applied: isFissato,
    inbound_event_id: inboundEvent?.id || null,
  };

  console.log("[Keplero] Success:", JSON.stringify(result));

  // Update inbound event status to processed
  if (inboundEvent?.id) {
    await supabaseAdmin
      .from("webhook_inbound_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", inboundEvent.id);
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
