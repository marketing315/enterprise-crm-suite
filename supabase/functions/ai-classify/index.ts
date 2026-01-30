import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
const PROMPT_VERSION = "v2";

// PRD-aligned strict output schema
interface AIClassificationResult {
  lead_type: "trial" | "info" | "support" | "generic";
  priority: number; // 1-5 where 5=URGENT, 1=low
  initial_stage_name: string;
  tags_to_apply: string[];
  should_create_ticket: boolean;
  ticket_type: string | null;
  should_create_or_update_appointment: boolean;
  appointment_action: "create" | "update" | "none";
  rationale: string;
}

interface LeadEvent {
  id: string;
  raw_payload: Record<string, unknown>;
  deal_id: string | null;
  contact_id: string | null;
}

interface AIJob {
  id: string;
  brand_id: string;
  lead_event_id: string;
  attempts: number;
  max_attempts: number;
  lead_events: LeadEvent;
}

interface PipelineStage {
  id: string;
  name: string;
}

interface Tag {
  id: string;
  name: string;
  parent_id: string | null;
}

// System prompt with PRD-aligned semantics
const SYSTEM_PROMPT = `Sei un classificatore AI enterprise per lead CRM. Analizza il payload del lead e classifica secondo regole precise.

SEMANTICA PRIORITÀ (PRD-aligned):
- 5 = URGENTE (azione immediata richiesta, cliente pronto all'acquisto, reclamo critico)
- 4 = ALTA (cliente caldo, richiesta tempo-sensitiva)
- 3 = MEDIA (interesse standard, follow-up normale)
- 2 = BASSA (richiesta informativa generica)
- 1 = MINIMA (lead freddo, curiosità)

TIPI LEAD:
- "trial": richiesta prova gratuita/demo
- "info": richiesta informazioni prodotto/servizio
- "support": assistenza, reclamo, problema tecnico
- "generic": altro/non classificabile

REGOLE TICKET:
- should_create_ticket=true SOLO per tipo "support" o reclami espliciti
- ticket_type: "support_request", "complaint", "technical_issue", null

REGOLE APPUNTAMENTO:
- should_create_or_update_appointment=true se cliente richiede incontro/visita
- appointment_action: "create" (nuovo), "update" (modifica esistente), "none"

STAGE PIPELINE:
- Suggerisci uno stage iniziale: "Nuovo Lead", "Contatto Caldo", "Qualificato", "Da Richiamare"

TAG:
- Usa path gerarchici: "Interesse > Prova", "Canale > ADV", "Prodotto > Premium"

Se non riesci a classificare con confidenza, usa fallback: lead_type="generic", priority=3.`;

// Tool definition for strict JSON output
const CLASSIFICATION_TOOL = {
  type: "function",
  function: {
    name: "classify_lead",
    description: "Classifica un lead CRM con output strutturato PRD-compliant",
    parameters: {
      type: "object",
      properties: {
        lead_type: {
          type: "string",
          enum: ["trial", "info", "support", "generic"],
          description: "Tipo di lead"
        },
        priority: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "Priorità 1-5 (5=URGENTE, 1=minima)"
        },
        initial_stage_name: {
          type: "string",
          description: "Nome stage pipeline iniziale"
        },
        tags_to_apply: {
          type: "array",
          items: { type: "string" },
          description: "Array di tag da applicare (path gerarchici)"
        },
        should_create_ticket: {
          type: "boolean",
          description: "Creare ticket di supporto"
        },
        ticket_type: {
          type: "string",
          enum: ["support_request", "complaint", "technical_issue"],
          nullable: true,
          description: "Tipo ticket se should_create_ticket=true"
        },
        should_create_or_update_appointment: {
          type: "boolean",
          description: "Gestire appuntamento"
        },
        appointment_action: {
          type: "string",
          enum: ["create", "update", "none"],
          description: "Azione appuntamento"
        },
        rationale: {
          type: "string",
          description: "Breve spiegazione della classificazione (max 200 caratteri)"
        }
      },
      required: [
        "lead_type",
        "priority",
        "initial_stage_name",
        "tags_to_apply",
        "should_create_ticket",
        "should_create_or_update_appointment",
        "appointment_action",
        "rationale"
      ],
      additionalProperties: false
    }
  }
};

async function classifyLead(
  payload: Record<string, unknown>,
  apiKey: string
): Promise<{ result: AIClassificationResult; rawResponse: unknown }> {
  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { 
          role: "user", 
          content: `Classifica questo lead:\n${JSON.stringify(payload, null, 2)}` 
        },
      ],
      tools: [CLASSIFICATION_TOOL],
      tool_choice: { type: "function", function: { name: "classify_lead" } },
      temperature: 0.1, // Lower for more deterministic output
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("AI rate limit exceeded");
    }
    if (response.status === 402) {
      throw new Error("AI credits exhausted");
    }
    const errorText = await response.text();
    throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Extract tool call result
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  
  if (!toolCall || toolCall.function.name !== "classify_lead") {
    // Fallback to content parsing if tool call not present
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      let jsonStr = content.trim();
      if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
      if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
      
      const parsed = JSON.parse(jsonStr.trim());
      return { 
        result: validateAndNormalize(parsed), 
        rawResponse: data 
      };
    }
    throw new Error("No tool call or content in AI response");
  }

  const parsed = JSON.parse(toolCall.function.arguments);
  return { 
    result: validateAndNormalize(parsed), 
    rawResponse: data 
  };
}

function validateAndNormalize(raw: Record<string, unknown>): AIClassificationResult {
  return {
    lead_type: ["trial", "info", "support", "generic"].includes(raw.lead_type as string) 
      ? (raw.lead_type as AIClassificationResult["lead_type"])
      : "generic",
    priority: Math.min(5, Math.max(1, Math.round(Number(raw.priority) || 3))),
    initial_stage_name: String(raw.initial_stage_name || "Nuovo Lead"),
    tags_to_apply: Array.isArray(raw.tags_to_apply) 
      ? raw.tags_to_apply.map(String) 
      : [],
    should_create_ticket: raw.lead_type === "support" || raw.should_create_ticket === true,
    ticket_type: raw.ticket_type ? String(raw.ticket_type) : null,
    should_create_or_update_appointment: raw.should_create_or_update_appointment === true,
    appointment_action: ["create", "update", "none"].includes(raw.appointment_action as string)
      ? (raw.appointment_action as AIClassificationResult["appointment_action"])
      : "none",
    rationale: String(raw.rationale || "Classificazione automatica"),
  };
}

// deno-lint-ignore no-explicit-any
async function logAIDecision(
  supabase: any,
  brandId: string,
  leadEventId: string,
  jobId: string,
  result: AIClassificationResult,
  rawResponse: unknown,
  confidence: number
): Promise<void> {
  await supabase.from("ai_decision_logs").insert({
    brand_id: brandId,
    lead_event_id: leadEventId,
    ai_job_id: jobId,
    lead_type: result.lead_type,
    priority: result.priority,
    initial_stage_name: result.initial_stage_name,
    tags_to_apply: result.tags_to_apply,
    should_create_ticket: result.should_create_ticket,
    ticket_type: result.ticket_type,
    should_create_or_update_appointment: result.should_create_or_update_appointment,
    appointment_action: result.appointment_action,
    rationale: result.rationale,
    model_version: MODEL,
    prompt_version: PROMPT_VERSION,
    confidence: confidence,
    raw_response: rawResponse,
  });
}

// deno-lint-ignore no-explicit-any
async function applyClassification(
  supabase: any,
  brandId: string,
  leadEventId: string,
  contactId: string | null,
  dealId: string | null,
  jobId: string,
  result: AIClassificationResult,
  rawResponse: unknown
): Promise<void> {
  const confidence = 0.85;

  // 1. Log the AI decision
  await logAIDecision(supabase, brandId, leadEventId, jobId, result, rawResponse, confidence);

  // 2. Update lead_event with PRD-aligned fields
  await supabase
    .from("lead_events")
    .update({
      lead_type: result.lead_type,
      ai_priority: result.priority,
      ai_confidence: confidence,
      ai_rationale: result.rationale,
      ai_processed: true,
      ai_processed_at: new Date().toISOString(),
      ai_model_version: MODEL,
      ai_prompt_version: PROMPT_VERSION,
      should_create_ticket: result.should_create_ticket,
    })
    .eq("id", leadEventId);

  // 3. Update deal stage if we have a deal
  if (dealId) {
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, name")
      .eq("brand_id", brandId)
      .eq("is_active", true);

    const typedStages = stages as PipelineStage[] | null;
    const matchedStage = typedStages?.find(
      (s) => s.name.toLowerCase() === result.initial_stage_name.toLowerCase()
    );

    if (matchedStage) {
      await supabase
        .from("deals")
        .update({ current_stage_id: matchedStage.id })
        .eq("id", dealId);
    }
  }

  // 4. Apply tags and find category tag for ticket
  let categoryTagId: string | null = null;
  
  if (result.tags_to_apply.length > 0) {
    const { data: allTags } = await supabase
      .from("tags")
      .select("id, name, parent_id")
      .eq("brand_id", brandId)
      .eq("is_active", true);

    const typedTags = allTags as Tag[] | null;
    
    if (typedTags) {
      // Build path lookup map
      const tagMap = new Map<string, string>();
      
      for (const tag of typedTags) {
        let path = tag.name;
        let currentParentId = tag.parent_id;
        
        while (currentParentId) {
          const parentTag = typedTags.find((t) => t.id === currentParentId);
          if (parentTag) {
            path = `${parentTag.name} > ${path}`;
            currentParentId = parentTag.parent_id;
          } else {
            break;
          }
        }
        
        tagMap.set(path.toLowerCase(), tag.id);
        tagMap.set(tag.name.toLowerCase(), tag.id);
      }

      // Match and assign tags
      for (const tagPath of result.tags_to_apply) {
        const tagId = tagMap.get(tagPath.toLowerCase());
        if (tagId) {
          await supabase
            .from("tag_assignments")
            .upsert({
              brand_id: brandId,
              tag_id: tagId,
              lead_event_id: leadEventId,
              assigned_by: "ai",
              confidence: confidence,
            }, {
              onConflict: "tag_id,lead_event_id",
              ignoreDuplicates: true,
            });
          
          if (!categoryTagId) {
            categoryTagId = tagId;
          }
        }
      }
    }
  }

  // 5. Create ticket if should_create_ticket and we have a contact
  if (result.should_create_ticket && contactId) {
    const ticketTitle = result.ticket_type === "complaint" 
      ? "Reclamo Cliente"
      : result.ticket_type === "technical_issue"
        ? "Problema Tecnico"
        : "Richiesta di Assistenza";

    const { data: ticketResult, error: ticketError } = await supabase.rpc(
      "find_or_create_ticket",
      {
        p_brand_id: brandId,
        p_contact_id: contactId,
        p_deal_id: dealId,
        p_lead_event_id: leadEventId,
        p_title: ticketTitle,
        p_description: result.rationale,
        p_priority: result.priority,
        p_category_tag_id: categoryTagId,
      }
    );

    if (ticketError) {
      console.error("Failed to create/attach ticket:", ticketError);
    } else if (ticketResult && ticketResult.length > 0) {
      const { ticket_id, is_new } = ticketResult[0];
      console.log(`Ticket ${is_new ? "created" : "attached"}: ${ticket_id}`);

      // Auto-assign via Round Robin (only for new support tickets)
      if (is_new && result.lead_type === "support") {
        const { data: assignResult, error: assignError } = await supabase.rpc(
          "assign_ticket_round_robin",
          {
            p_brand_id: brandId,
            p_ticket_id: ticket_id,
          }
        );

        if (assignError) {
          console.error("Failed to auto-assign ticket:", assignError);
        } else if (assignResult?.[0]?.was_assigned) {
          console.log(`Ticket auto-assigned to: ${assignResult[0].assigned_user_name}`);
        }
      }
    }
  }

  // 6. Handle appointment if requested (placeholder for future implementation)
  if (result.should_create_or_update_appointment && result.appointment_action !== "none") {
    console.log(`Appointment action requested: ${result.appointment_action}`);
    // TODO: Implement appointment creation/update based on AI suggestion
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: Require CRON_SECRET
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  
  if (!cronSecret) {
    console.error("[AUTH] CRON_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Server misconfiguration" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  if (providedSecret !== cronSecret) {
    console.error("[AUTH] Invalid x-cron-secret");
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Recovery: Reset stuck jobs (processing for >5 min)
    const { data: stuckJobs } = await supabase
      .from("ai_jobs")
      .select("id, lead_event_id, attempts, max_attempts")
      .eq("status", "processing")
      .lt("started_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

    interface StuckJob {
      id: string;
      lead_event_id: string;
      attempts: number;
      max_attempts: number;
    }

    const typedStuckJobs = stuckJobs as StuckJob[] | null;

    if (typedStuckJobs && typedStuckJobs.length > 0) {
      console.log(`Recovering ${typedStuckJobs.length} stuck jobs`);
      for (const stuck of typedStuckJobs) {
        if (stuck.attempts >= stuck.max_attempts) {
          await supabase.rpc("apply_ai_fallback", { p_lead_event_id: stuck.lead_event_id });
          await supabase
            .from("ai_jobs")
            .update({ 
              status: "failed", 
              last_error: "Job stuck, fallback applied",
              completed_at: new Date().toISOString(),
            })
            .eq("id", stuck.id);
        } else {
          await supabase
            .from("ai_jobs")
            .update({ status: "pending", last_error: "Reset after stuck" })
            .eq("id", stuck.id);
        }
      }
    }

    // 2. Apply fallback to exhausted jobs
    const { data: exhaustedJobs } = await supabase
      .from("ai_jobs")
      .select("id, lead_event_id")
      .eq("status", "pending")
      .gte("attempts", 3);

    interface ExhaustedJob {
      id: string;
      lead_event_id: string;
    }

    const typedExhaustedJobs = exhaustedJobs as ExhaustedJob[] | null;

    if (typedExhaustedJobs && typedExhaustedJobs.length > 0) {
      console.log(`Applying fallback to ${typedExhaustedJobs.length} exhausted jobs`);
      for (const exhausted of typedExhaustedJobs) {
        await supabase.rpc("apply_ai_fallback", { p_lead_event_id: exhausted.lead_event_id });
        await supabase
          .from("ai_jobs")
          .update({ 
            status: "failed", 
            last_error: "Max attempts exceeded, fallback applied",
            completed_at: new Date().toISOString(),
          })
          .eq("id", exhausted.id);
      }
    }

    // 3. Get pending jobs
    const { data: jobs, error: jobsError } = await supabase
      .from("ai_jobs")
      .select(`
        id,
        brand_id,
        lead_event_id,
        attempts,
        max_attempts,
        lead_events!inner (
          id,
          raw_payload,
          deal_id,
          contact_id
        )
      `)
      .eq("status", "pending")
      .lt("attempts", 3)
      .order("created_at", { ascending: true })
      .limit(10);

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      throw jobsError;
    }

    const typedJobs = jobs as unknown as AIJob[] | null;
    const recoveredStuck = typedStuckJobs?.length || 0;
    const recoveredExhausted = typedExhaustedJobs?.length || 0;

    if (!typedJobs || typedJobs.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: "No pending jobs", 
          processed: 0,
          recovered_stuck: recoveredStuck,
          recovered_exhausted: recoveredExhausted
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let failed = 0;

    for (const job of typedJobs) {
      const leadEvent = job.lead_events;

      // Mark as processing
      await supabase
        .from("ai_jobs")
        .update({ 
          status: "processing", 
          started_at: new Date().toISOString(),
          attempts: job.attempts + 1,
        })
        .eq("id", job.id);

      try {
        // Classify with AI using tool calling
        const { result: classification, rawResponse } = await classifyLead(
          leadEvent.raw_payload,
          LOVABLE_API_KEY
        );

        // Apply classification with logging
        await applyClassification(
          supabase,
          job.brand_id,
          job.lead_event_id,
          leadEvent.contact_id,
          leadEvent.deal_id,
          job.id,
          classification,
          rawResponse
        );

        // Mark as completed
        await supabase
          .from("ai_jobs")
          .update({ 
            status: "completed", 
            completed_at: new Date().toISOString() 
          })
          .eq("id", job.id);

        processed++;
        console.log(
          `Processed job ${job.id}: type=${classification.lead_type}, priority=${classification.priority} (5=urgent)`
        );

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to process job ${job.id}:`, errorMessage);

        if (job.attempts + 1 >= job.max_attempts) {
          await supabase.rpc("apply_ai_fallback", { p_lead_event_id: job.lead_event_id });
          
          await supabase
            .from("ai_jobs")
            .update({ 
              status: "failed", 
              last_error: `Max attempts. Last: ${errorMessage}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        } else {
          await supabase
            .from("ai_jobs")
            .update({ 
              status: "pending", 
              last_error: errorMessage,
            })
            .eq("id", job.id);
        }

        failed++;
      }
    }

    return new Response(
      JSON.stringify({ 
        message: "Processing complete", 
        processed, 
        failed,
        total: typedJobs.length,
        prompt_version: PROMPT_VERSION
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("ai-classify error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
