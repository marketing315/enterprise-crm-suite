import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============= Types =============

interface WebhookInboundEvent {
  id: string;
  brand_id: string;
  source: string;
  event_type: string;
  payload: Record<string, unknown>;
  received_at: string;
  attempts: number;
}

interface AutomationRule {
  id: string;
  brand_id: string;
  name: string;
  trigger_event_type: string;
  trigger_source: string | null;
  conditions: Condition | null;
  actions: Action[];
  stop_on_failure: boolean;
  priority: number;
}

interface Condition {
  all?: ConditionItem[];
  any?: ConditionItem[];
}

interface ConditionItem {
  path: string;
  op: "eq" | "neq" | "contains" | "starts_with" | "exists" | "not_exists" | "gt" | "gte" | "lt" | "lte" | "in";
  value?: unknown;
}

interface Action {
  type: "upsert_contact" | "add_tag" | "create_deal" | "create_ticket" | "send_outbound_webhook" | "set_callback_requested" | "log_note" | "schedule_job" | "update_contact_field";
  match?: Record<string, string>;
  fields?: Record<string, string>;
  entity?: "contact" | "deal" | "ticket";
  tag?: string;
  webhook_id?: string;
  value?: boolean;
  note?: string;
  // schedule_job fields
  endpoint?: string;
  job_type?: string;
  run_at_field?: string;
  payload_template?: string;
  // update_contact_field
  field?: string;
  field_value?: string;
}

interface StepLog {
  step: number;
  action_type: string;
  status: "success" | "failed" | "skipped";
  result?: Record<string, unknown>;
  error?: string;
  duration_ms: number;
}

// ============= Template Resolver =============

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function resolveTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const value = resolvePath(context, path.trim());
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

function resolveObject(obj: Record<string, string>, context: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = resolveTemplate(value, context);
  }
  return result;
}

// ============= Condition Evaluator =============

function evaluateCondition(condition: Condition | null, payload: Record<string, unknown>): boolean {
  if (!condition) return true;
  
  if (condition.all) {
    return condition.all.every((item) => evaluateConditionItem(item, payload));
  }
  
  if (condition.any) {
    return condition.any.some((item) => evaluateConditionItem(item, payload));
  }
  
  return true;
}

function evaluateConditionItem(item: ConditionItem, payload: Record<string, unknown>): boolean {
  const value = resolvePath(payload, item.path);
  
  switch (item.op) {
    case "exists":
      return value !== null && value !== undefined && value !== "";
    case "not_exists":
      return value === null || value === undefined || value === "";
    case "eq":
      return value === item.value;
    case "neq":
      return value !== item.value;
    case "contains":
      return typeof value === "string" && value.includes(String(item.value));
    case "starts_with":
      return typeof value === "string" && value.startsWith(String(item.value));
    case "gt":
      return typeof value === "number" && value > (item.value as number);
    case "gte":
      return typeof value === "number" && value >= (item.value as number);
    case "lt":
      return typeof value === "number" && value < (item.value as number);
    case "lte":
      return typeof value === "number" && value <= (item.value as number);
    case "in":
      return Array.isArray(item.value) && item.value.includes(value);
    default:
      return false;
  }
}

// ============= Action Executors =============

interface ActionContext {
  supabase: ReturnType<typeof createClient>;
  brandId: string;
  payload: Record<string, unknown>;
  createdEntities: Record<string, string>;
}

async function executeUpsertContact(action: Action, ctx: ActionContext): Promise<Record<string, unknown>> {
  const match = action.match ? resolveObject(action.match, { payload: ctx.payload }) : {};
  const fields = action.fields ? resolveObject(action.fields, { payload: ctx.payload }) : {};
  
  // Normalize phone if provided
  const phone = match.phone || match.telefono || fields.phone;
  if (!phone) {
    throw new Error("upsert_contact requires phone in match or fields");
  }
  
  const phoneNormalized = phone.replace(/\D/g, "").replace(/^39/, "");
  
  // Check callback_requested in fields
  const callbackRequested = fields.callback_requested === "true" || fields.callback_requested === "1";
  
  // Find or create contact
  const { data: contactId, error: contactError } = await ctx.supabase.rpc("find_or_create_contact", {
    p_brand_id: ctx.brandId,
    p_phone_normalized: phoneNormalized,
    p_phone_raw: phone,
    p_country_code: "IT",
    p_assumed_country: true,
    p_first_name: fields.first_name || fields.nome || null,
    p_last_name: fields.last_name || fields.cognome || null,
    p_email: fields.email || null,
    p_city: fields.city || fields.citta || null,
    p_cap: fields.cap || null,
  });
  
  if (contactError) throw contactError;
  
  // Update additional fields including callback_requested
  const updateFields: Record<string, unknown> = {};
  if (fields.address) updateFields.address = fields.address;
  if (fields.notes) updateFields.notes = fields.notes;
  if (callbackRequested) updateFields.callback_requested = true;
  
  if (Object.keys(updateFields).length > 0) {
    await ctx.supabase.from("contacts").update(updateFields).eq("id", contactId);
  }
  
  ctx.createdEntities.contact_id = contactId;
  return { contact_id: contactId };
}

async function executeAddTag(action: Action, ctx: ActionContext): Promise<Record<string, unknown>> {
  const tagName = action.tag ? resolveTemplate(action.tag, { payload: ctx.payload }) : null;
  if (!tagName) throw new Error("add_tag requires tag name");
  
  const entityType = action.entity || "contact";
  const entityId = ctx.createdEntities[`${entityType}_id`];
  
  if (!entityId) throw new Error(`No ${entityType} found to tag`);
  
  // Find or create tag
  const { data: tag } = await ctx.supabase
    .from("tags")
    .select("id")
    .eq("brand_id", ctx.brandId)
    .eq("name", tagName)
    .single();
  
  let tagId = tag?.id;
  
  if (!tagId) {
    const { data: newTag, error } = await ctx.supabase
      .from("tags")
      .insert({ brand_id: ctx.brandId, name: tagName, scope: entityType })
      .select("id")
      .single();
    if (error) throw error;
    tagId = newTag.id;
  }
  
  // Add entity tag
  const tableName = entityType === "contact" ? "contact_tags" : entityType === "deal" ? "deal_tags" : "ticket_tags";
  const entityColumn = `${entityType}_id`;
  
  const { error: tagError } = await ctx.supabase.from(tableName).upsert({
    [entityColumn]: entityId,
    tag_id: tagId,
    assigned_by: "rule",
  }, { onConflict: `${entityColumn},tag_id` });

  if (tagError) {
    throw new Error(`Failed to upsert tag in ${tableName}: ${tagError.message}`);
  }
  
  return { tag_id: tagId, entity_id: entityId };
}

async function executeCreateDeal(action: Action, ctx: ActionContext): Promise<Record<string, unknown>> {
  const contactId = ctx.createdEntities.contact_id;
  if (!contactId) throw new Error("create_deal requires contact_id (run upsert_contact first)");
  
  const { data: dealId, error } = await ctx.supabase.rpc("find_or_create_deal", {
    p_brand_id: ctx.brandId,
    p_contact_id: contactId,
  });
  
  if (error) throw error;
  
  ctx.createdEntities.deal_id = dealId;
  return { deal_id: dealId };
}

async function executeCreateTicket(action: Action, ctx: ActionContext): Promise<Record<string, unknown>> {
  const contactId = ctx.createdEntities.contact_id;
  const dealId = ctx.createdEntities.deal_id;
  const fields = action.fields ? resolveObject(action.fields, { payload: ctx.payload }) : {};
  
  const { data: ticket, error } = await ctx.supabase
    .from("tickets")
    .insert({
      brand_id: ctx.brandId,
      contact_id: contactId || null,
      deal_id: dealId || null,
      title: fields.title || "Ticket da automazione",
      description: fields.description || null,
      type: fields.type || "assistenza",
      priority: fields.priority || "medium",
      status: "open",
    })
    .select("id")
    .single();
  
  if (error) throw error;
  
  ctx.createdEntities.ticket_id = ticket.id;
  return { ticket_id: ticket.id };
}

async function executeSendOutboundWebhook(action: Action, ctx: ActionContext): Promise<Record<string, unknown>> {
  if (!action.webhook_id) throw new Error("send_outbound_webhook requires webhook_id");
  
  // Queue a webhook delivery
  const { data, error } = await ctx.supabase.rpc("enqueue_webhook_delivery", {
    p_webhook_id: action.webhook_id,
    p_event_type: "automation.triggered",
    p_event_id: ctx.createdEntities.contact_id || ctx.createdEntities.deal_id || null,
    p_payload: { ...ctx.payload, automation_entities: ctx.createdEntities },
  });
  
  if (error) throw error;
  return { delivery_id: data };
}

async function executeSetCallbackRequested(action: Action, ctx: ActionContext): Promise<Record<string, unknown>> {
  const contactId = ctx.createdEntities.contact_id;
  if (!contactId) throw new Error("set_callback_requested requires contact_id");
  
  const value = action.value !== false;
  
  const { error } = await ctx.supabase
    .from("contacts")
    .update({ callback_requested: value })
    .eq("id", contactId);
  
  if (error) throw error;
  return { contact_id: contactId, callback_requested: value };
}

async function executeLogNote(action: Action, ctx: ActionContext): Promise<Record<string, unknown>> {
  const note = action.note ? resolveTemplate(action.note, { payload: ctx.payload }) : "";
  const entityType = action.entity || "contact";
  const entityId = ctx.createdEntities[`${entityType}_id`];
  
  if (!entityId || !note) throw new Error("log_note requires entity and note");
  
  const { data, error } = await ctx.supabase
    .from("admin_notes")
    .insert({
      brand_id: ctx.brandId,
      ref_table: entityType === "contact" ? "contacts" : entityType === "deal" ? "deals" : "tickets",
      ref_id: entityId,
      type: "automation",
      content: note,
      created_by: null, // System
    })
    .select("id")
    .single();
  
  if (error) throw error;
  return { note_id: data.id };
}

async function executeScheduleJob(action: Action, ctx: ActionContext): Promise<Record<string, unknown>> {
  const contactId = ctx.createdEntities.contact_id;
  const endpoint = action.endpoint || "";
  const jobType = action.job_type || "keplero.callback";
  
  if (!endpoint) throw new Error("schedule_job requires endpoint");
  
  // Parse run_at from esito_chiamata field
  const esitoChiamata = action.run_at_field 
    ? resolveTemplate(action.run_at_field, { payload: ctx.payload })
    : resolvePath(ctx.payload, "args.esito_chiamata") as string || "";
  
  const { parseCallbackTime } = await import("../_shared/parseCallbackTime.ts");
  const parseResult = parseCallbackTime(esitoChiamata);
  
  // Build payload from template or default user snapshot
  let jobPayload: Record<string, unknown>;
  
  if (action.payload_template) {
    const template = resolveTemplate(action.payload_template, { payload: ctx.payload, entities: ctx.createdEntities });
    try {
      jobPayload = JSON.parse(template);
    } catch {
      jobPayload = { raw: template };
    }
  } else {
    // Build full user snapshot payload
    jobPayload = await buildKepleroPayload(ctx, esitoChiamata, parseResult);
  }
  
  // Create scheduled job
  const { data: job, error } = await ctx.supabase
    .from("automation_jobs")
    .insert({
      brand_id: ctx.brandId,
      source_event_id: (ctx as ActionContextWithEvent).eventId || null,
      contact_id: contactId || null,
      job_type: jobType,
      run_at: parseResult.run_at_utc,
      endpoint,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      payload: jobPayload,
      status: "scheduled",
    })
    .select("id")
    .single();
  
  if (error) throw error;
  
  ctx.createdEntities.automation_job_id = job.id;
  
  return { 
    job_id: job.id, 
    run_at: parseResult.run_at_local,
    run_at_utc: parseResult.run_at_utc,
    confidence: parseResult.confidence,
    strategy: parseResult.strategy,
    notes: parseResult.notes,
  };
}

interface ParseResult {
  run_at: Date;
  run_at_utc: string;
  run_at_local: string;
  confidence: number;
  strategy: string;
  notes: string;
}

interface ActionContextWithEvent extends ActionContext {
  eventId?: string;
}

// Extract normalized scheduling text from raw esito
function extractNormalizedText(text: string): string {
  const lowerText = text.toLowerCase().trim();
  
  // Extract the core scheduling part
  const patterns = [
    /tra\s+\d+\s*min\w*/i,
    /tra\s+\d+\s*or[ae]/i,
    /tra\s+mezz['']?\s*ora/i,
    /tra\s+un['']?\s*ora/i,
    /domani\s*(mattina|pomeriggio|sera)?/i,
    /oggi\s*(pomeriggio|sera)?/i,
    /stasera/i,
    /stamattina/i,
    /(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)/i,
    /\d{1,2}[\/\-]\d{1,2}(\s+(?:alle|ore)\s*\d{1,2}[:\.]\d{2})?/i,
    /(?:alle|ore)\s*\d{1,2}[:\.]\d{2}/i,
  ];
  
  for (const pattern of patterns) {
    const match = lowerText.match(pattern);
    if (match) return match[0].trim();
  }
  
  return lowerText;
}

async function buildKepleroPayload(
  ctx: ActionContext,
  esitoChiamata: string,
  parseResult: ParseResult
): Promise<Record<string, unknown>> {
  const contactId = ctx.createdEntities.contact_id;
  
  // Fetch contact data with tracking
  let contact: Record<string, unknown> | null = null;
  let phones: Array<Record<string, unknown>> = [];
  let tags: string[] = [];
  let tracking: Record<string, unknown> | null = null;
  
  if (contactId) {
    const { data: contactData } = await ctx.supabase
      .from("contacts")
      .select("*, contact_phones(*), contact_tracking(*)")
      .eq("id", contactId)
      .single();
    
    if (contactData) {
      contact = contactData;
      phones = contactData.contact_phones || [];
      tracking = Array.isArray(contactData.contact_tracking) 
        ? contactData.contact_tracking[0] 
        : contactData.contact_tracking;
    }
    
    // Fetch tags
    const { data: tagData } = await ctx.supabase
      .from("contact_tags")
      .select("tags(name)")
      .eq("contact_id", contactId);
    
    tags = tagData?.map((t: { tags: { name: string } }) => t.tags.name) || [];
  }
  
  // Fetch brand info
  const { data: brand } = await ctx.supabase
    .from("brands")
    .select("id, name")
    .eq("id", ctx.brandId)
    .single();
  
  // Fetch active deals
  const { data: deals } = await ctx.supabase
    .from("deals")
    .select("*, pipeline_stages(name), users(full_name)")
    .eq("brand_id", ctx.brandId)
    .eq("contact_id", contactId || "")
    .eq("status", "open")
    .limit(5);
  
  // Fetch open tickets
  const { data: tickets } = await ctx.supabase
    .from("tickets")
    .select("id, status, priority, created_at, title")
    .eq("brand_id", ctx.brandId)
    .eq("contact_id", contactId || "")
    .eq("status", "open")
    .limit(5);
  
  // Fetch sales orders
  const { data: orders } = await ctx.supabase
    .from("sales_orders")
    .select("id, confirmed_at, status, total_amount, currency, payment_method")
    .eq("brand_id", ctx.brandId)
    .eq("contact_id", contactId || "")
    .order("confirmed_at", { ascending: false })
    .limit(10);

  // Fetch last call log
  const { data: lastCall } = await ctx.supabase
    .from("call_logs")
    .select("*")
    .eq("contact_id", contactId || "")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch recent inbound events (last 5)
  const { data: recentEvents } = await ctx.supabase
    .from("webhook_inbound_events")
    .select("id, event_type, source, received_at, payload")
    .eq("brand_id", ctx.brandId)
    .order("received_at", { ascending: false })
    .limit(5);
  
  const now = new Date().toISOString();
  const primaryPhone = phones.find((p: Record<string, unknown>) => p.is_primary) || phones[0];
  
  // Format phone to E.164
  const phoneE164 = primaryPhone?.phone_normalized 
    ? (primaryPhone.phone_normalized.toString().startsWith("+") 
        ? primaryPhone.phone_normalized 
        : `+39${primaryPhone.phone_normalized}`)
    : null;
  
  return {
    schema_version: "crm.keplero.user_snapshot.v1",
    event: {
      name: "recontact_scheduled",
      source: "crm",
      occurred_at: now,
      timezone: "Europe/Rome",
      trigger: {
        type: "inbound_webhook",
        webhook_name: "Ricontatto Keplero",
        inbound_event_id: (ctx as ActionContextWithEvent).eventId || null,
        raw: ctx.payload,
      },
    },
    schedule: {
      requested_text: esitoChiamata,
      normalized_text: extractNormalizedText(esitoChiamata),
      run_at: parseResult.run_at_local,
      run_at_utc: parseResult.run_at_utc,
      parser: {
        strategy: parseResult.strategy,
        confidence: parseResult.confidence,
        notes: parseResult.notes,
      },
    },
    brand: {
      id: brand?.id,
      name: brand?.name,
      external_refs: {
        meta_pixel_id: null,
        meta_ad_account: null,
      },
    },
    // Stable identifiers for reconciliation
    external_ids: {
      crm_contact_id: contactId || null,
      crm_brand_id: ctx.brandId,
      phone_primary_e164: phoneE164,
    },
    contact: contact ? {
      id: contact.id,
      created_at: contact.created_at,
      updated_at: contact.updated_at,
      identity: {
        first_name: contact.first_name,
        last_name: contact.last_name,
        full_name: [contact.first_name, contact.last_name].filter(Boolean).join(" "),
        email: contact.email,
        emails: contact.email ? [contact.email] : [],
        company: {
          ragione_sociale: contact.company_name || null,
          partita_iva: contact.vat_number || null,
          codice_fiscale: contact.fiscal_code || null,
        },
      },
      phones: {
        primary: primaryPhone?.phone_normalized || null,
        primary_e164: phoneE164,
        all: phones.map((p: Record<string, unknown>) => ({
          phone_normalized: p.phone_normalized,
          phone_raw: p.phone_raw,
          is_primary: p.is_primary,
          is_active: p.is_active,
        })),
      },
      address: {
        indirizzo: contact.address,
        citta: contact.city,
        prov: contact.province,
        cap: contact.cap,
        nazione: contact.country || "IT",
      },
      crm_fields: {
        esito_chiamata: contact.esito_chiamata || esitoChiamata,
        notes: contact.notes,
        status: contact.status,
        callback_requested: contact.callback_requested || false,
        lead_type: contact.lead_type || null,
        lead_message: contact.lead_message || null,
      },
      tags,
    } : null,
    // Privacy/compliance
    consent: {
      marketing: contact?.marketing_consent || null,
      profiling: contact?.profiling_consent || null,
      updated_at: contact?.consent_updated_at || null,
    },
    tracking: {
      first_touch_at: contact?.created_at || null,
      // B15 FIX: Use correct schema field names (client_ip, client_user_agent)
      client: {
        ip: tracking?.client_ip || null,
        user_agent: tracking?.client_user_agent || null,
      },
      meta: {
        fbp: tracking?.fbp || null,
        fbc: tracking?.fbc || null,
      },
      google: {
        gclid: tracking?.gclid || null,
        wbraid: tracking?.wbraid || null,
        gbraid: tracking?.gbraid || null,
      },
      utm: {
        source: tracking?.utm_source || null,
        medium: tracking?.utm_medium || null,
        campaign: tracking?.utm_campaign || null,
        content: tracking?.utm_content || null,
        term: tracking?.utm_term || null,
      },
    },
    sales: {
      summary: {
        orders_count: orders?.length || 0,
        orders_total: orders?.reduce((sum, o: { total_amount: number }) => sum + (o.total_amount || 0), 0) || 0,
        currency: "EUR",
        last_order_at: orders?.[0]?.confirmed_at || null,
      },
      orders: orders?.slice(0, 5) || [],
    },
    pipeline: {
      deals_summary: {
        open: deals?.filter((d: { status: string }) => d.status === "open").length || 0,
        won: 0,
        lost: 0,
        last_deal_at: deals?.[0]?.created_at || null,
      },
      active_deals: deals?.map((d: Record<string, unknown>) => ({
        id: d.id,
        title: `Deal ${d.id}`,
        status: d.status,
        stage: (d.pipeline_stages as { name: string })?.name || null,
        value: d.value,
        currency: "EUR",
        created_at: d.created_at,
        updated_at: d.updated_at,
        owner: d.users ? { user_id: d.assigned_user_id, name: (d.users as { full_name: string }).full_name } : null,
      })) || [],
    },
    support: {
      tickets_summary: {
        open: tickets?.length || 0,
        closed: 0,
        last_ticket_at: tickets?.[0]?.created_at || null,
      },
      open_tickets: tickets || [],
    },
    communications: {
      calls: {
        last_call_at: lastCall?.started_at || null,
        last_call_status: lastCall?.status || null,
        last_call_duration_seconds: lastCall?.duration_seconds || null,
        total_calls_30d: 0, // Would require separate count query
      },
      chats: { last_message_at: null, channels: [], unread_count: 0 },
      emails: { last_email_at: null },
    },
    automation: {
      job: {
        job_id: ctx.createdEntities.automation_job_id || null,
        job_type: "keplero.callback",
        status: "scheduled",
        attempts: 0,
      },
    },
    // Raw entities dump for full data access
    raw_entities: {
      contacts: contact ? {
        id: contact.id,
        brand_id: contact.brand_id,
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        city: contact.city,
        cap: contact.cap,
        address: contact.address,
        province: contact.province,
        country: contact.country,
        status: contact.status,
        notes: contact.notes,
        esito_chiamata: contact.esito_chiamata,
        callback_requested: contact.callback_requested,
        company_name: contact.company_name,
        vat_number: contact.vat_number,
        fiscal_code: contact.fiscal_code,
        lead_type: contact.lead_type,
        lead_message: contact.lead_message,
        lead_cost: contact.lead_cost,
        note1: contact.note1,
        note2: contact.note2,
        note3: contact.note3,
        note4: contact.note4,
        note5: contact.note5,
        created_at: contact.created_at,
        updated_at: contact.updated_at,
      } : null,
      contact_phones: phones.map((p: Record<string, unknown>) => ({
        id: p.id,
        phone_raw: p.phone_raw,
        phone_normalized: p.phone_normalized,
        country_code: p.country_code,
        is_primary: p.is_primary,
        is_active: p.is_active,
      })),
      contact_tracking: tracking || null,
      tags,
      last_call_log: lastCall || null,
      last_webhook_events: recentEvents?.slice(0, 3) || [],
    },
  };
}

async function executeUpdateContactField(action: Action, ctx: ActionContext): Promise<Record<string, unknown>> {
  const contactId = ctx.createdEntities.contact_id;
  if (!contactId) throw new Error("update_contact_field requires contact_id");
  
  const fieldName = action.field || "";
  const fieldValue = action.field_value 
    ? resolveTemplate(action.field_value, { payload: ctx.payload })
    : "";
  
  if (!fieldName) throw new Error("update_contact_field requires field name");
  
  // Allowed fields to update
  const allowedFields = ["esito_chiamata", "notes", "address", "city", "cap", "province", "country"];
  if (!allowedFields.includes(fieldName)) {
    throw new Error(`Field ${fieldName} not allowed for update_contact_field`);
  }
  
  const { error } = await ctx.supabase
    .from("contacts")
    .update({ [fieldName]: fieldValue })
    .eq("id", contactId);
  
  if (error) throw error;
  return { contact_id: contactId, field: fieldName, value: fieldValue };
}

async function executeAction(action: Action, ctx: ActionContext): Promise<Record<string, unknown>> {
  switch (action.type) {
    case "upsert_contact":
      return executeUpsertContact(action, ctx);
    case "add_tag":
      return executeAddTag(action, ctx);
    case "create_deal":
      return executeCreateDeal(action, ctx);
    case "create_ticket":
      return executeCreateTicket(action, ctx);
    case "send_outbound_webhook":
      return executeSendOutboundWebhook(action, ctx);
    case "set_callback_requested":
      return executeSetCallbackRequested(action, ctx);
    case "log_note":
      return executeLogNote(action, ctx);
    case "schedule_job":
      return executeScheduleJob(action, ctx);
    case "update_contact_field":
      return executeUpdateContactField(action, ctx);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// ============= Main Runner =============

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  event: WebhookInboundEvent,
  rules: AutomationRule[]
): Promise<{ success: boolean; rulesExecuted: number; errors: string[] }> {
  const errors: string[] = [];
  let rulesExecuted = 0;
  
  // Sort rules by priority
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
  
  for (const rule of sortedRules) {
    // B14 FIX: Explicit wildcard vs exact match to prevent false positives
    const triggerType = rule.trigger_event_type;
    let matches = false;
    if (triggerType.endsWith(".*")) {
      // Prefix match: "keplero.*" matches "keplero.lead", "keplero.ricontatto", etc.
      const prefix = triggerType.slice(0, -2); // Remove ".*"
      matches = event.event_type === prefix || event.event_type.startsWith(prefix + ".");
    } else {
      // Exact match only
      matches = triggerType === event.event_type;
    }
    
    if (!matches) {
      continue;
    }
    
    if (rule.trigger_source && rule.trigger_source !== event.source) {
      continue;
    }
    
    // Evaluate conditions
    if (!evaluateCondition(rule.conditions as Condition, event.payload)) {
      // Log skipped run
      await supabase.from("automation_logs").insert({
        brand_id: event.brand_id,
        rule_id: rule.id,
        event_id: event.id,
        entity_type: "webhook_event",
        entity_id: event.id,
        action_taken: "conditions_not_met",
        status: "skipped",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      });
      continue;
    }
    
    // Execute actions
    const startTime = Date.now();
    const stepsLog: StepLog[] = [];
    const createdEntities: Record<string, string> = {};
    let hasError = false;
    
    const ctx: ActionContext = {
      supabase,
      brandId: event.brand_id,
      payload: event.payload,
      createdEntities,
    };
    
    for (let i = 0; i < (rule.actions as Action[]).length; i++) {
      const action = (rule.actions as Action[])[i];
      const stepStart = Date.now();
      
      try {
        const result = await executeAction(action, ctx);
        stepsLog.push({
          step: i + 1,
          action_type: action.type,
          status: "success",
          result,
          duration_ms: Date.now() - stepStart,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        stepsLog.push({
          step: i + 1,
          action_type: action.type,
          status: "failed",
          error: errorMsg,
          duration_ms: Date.now() - stepStart,
        });
        errors.push(`Rule ${rule.name}, Action ${action.type}: ${errorMsg}`);
        hasError = true;
        
        if (rule.stop_on_failure) break;
      }
    }
    
    // Log run
    await supabase.from("automation_logs").insert({
      brand_id: event.brand_id,
      rule_id: rule.id,
      event_id: event.id,
      entity_type: "webhook_event",
      entity_id: event.id,
      action_taken: "execute_actions",
      action_details: { actions: rule.actions },
      status: hasError ? "failed" : "success",
      started_at: new Date(startTime).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      steps_log: stepsLog,
      created_entities: createdEntities,
      error_message: hasError ? errors.join("; ") : null,
    });
    
    rulesExecuted++;
  }
  
  return { success: errors.length === 0, rulesExecuted, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  // B01 FIX: Validate cron secret OR verify JWT signature server-side
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
  const authHeader = req.headers.get("authorization");
  
  const hasValidCronSecret = expectedSecret && cronSecret && 
    (cronSecret === expectedSecret || (cronSecretPrev && cronSecret === cronSecretPrev));
  
  let hasValidJwt = false;
  if (!hasValidCronSecret && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    try {
      const verifyClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData, error: claimsErr } = await verifyClient.auth.getClaims(token);
      if (!claimsErr && claimsData?.claims) {
        const role = claimsData.claims.role as string;
        if (role === "service_role" || role === "anon") {
          hasValidJwt = true;
        }
      }
    } catch { /* invalid JWT, fall through */ }
  }
  
  if (!hasValidCronSecret && !hasValidJwt) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  
  // Claim pending events (FOR UPDATE SKIP LOCKED pattern)
  const { data: events, error: claimError } = await supabase.rpc("claim_inbound_events", {
    p_limit: 50,
  });
  
  if (claimError) {
    console.error("Failed to claim events:", claimError);
    return new Response(JSON.stringify({ error: claimError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  if (!events || events.length === 0) {
    return new Response(JSON.stringify({ message: "No pending events", processed: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  console.log(`Processing ${events.length} events`);
  
  let totalProcessed = 0;
  let totalErrors = 0;
  
  for (const event of events as WebhookInboundEvent[]) {
    try {
      // Load active rules for this brand and event type
      const { data: rules } = await supabase
        .from("automation_rules")
        .select("*")
        .eq("brand_id", event.brand_id)
        .eq("is_active", true)
        .or(`trigger_event_type.eq.${event.event_type},trigger_event_type.like.%.\\*`);
      
      if (rules && rules.length > 0) {
        const result = await processEvent(supabase, event, rules as AutomationRule[]);
        
        if (result.errors.length > 0) {
          totalErrors++;
          await supabase
            .from("webhook_inbound_events")
            .update({
              status: "failed",
              processed_at: new Date().toISOString(),
              attempts: event.attempts + 1,
              last_error: result.errors.join("; "),
            })
            .eq("id", event.id);
        } else {
          await supabase
            .from("webhook_inbound_events")
            .update({
              status: "processed",
              processed_at: new Date().toISOString(),
            })
            .eq("id", event.id);
        }
      } else {
        // No rules matched, mark as processed
        await supabase
          .from("webhook_inbound_events")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", event.id);
      }
      
      totalProcessed++;
    } catch (error) {
      console.error(`Error processing event ${event.id}:`, error);
      totalErrors++;
      
      await supabase
        .from("webhook_inbound_events")
        .update({
          status: "failed",
          processed_at: new Date().toISOString(),
          attempts: event.attempts + 1,
          last_error: error instanceof Error ? error.message : String(error),
        })
        .eq("id", event.id);
    }
  }
  
  console.log(`Processed ${totalProcessed} events, ${totalErrors} errors`);
  
  return new Response(
    JSON.stringify({
      processed: totalProcessed,
      errors: totalErrors,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
