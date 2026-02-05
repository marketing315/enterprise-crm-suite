import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  
  await ctx.supabase.from(tableName).upsert({
    [entityColumn]: entityId,
    tag_id: tagId,
    assigned_by: "rule",
  }, { onConflict: `${entityColumn},tag_id` });
  
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
    // Check if rule matches event
    if (rule.trigger_event_type !== event.event_type && 
        !rule.trigger_event_type.endsWith(".*") &&
        !event.event_type.startsWith(rule.trigger_event_type.replace(".*", ""))) {
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
  
  // Verify cron secret or JWT
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("authorization");
  
  if (cronSecret !== expectedSecret && !authHeader?.startsWith("Bearer ")) {
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
