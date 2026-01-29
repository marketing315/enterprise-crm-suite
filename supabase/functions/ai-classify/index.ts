import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

interface AIClassificationResult {
  lead_type: "trial" | "info" | "support" | "generic";
  priority: number;
  initial_stage_name: string;
  tags_to_apply: string[];
  should_create_ticket: boolean;
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

const SYSTEM_PROMPT = `Sei un classificatore AI per lead CRM. Analizza il payload del lead e restituisci SOLO un JSON valido senza testo extra.

Regole:
- lead_type: "trial" (prova gratuita), "info" (richiesta info), "support" (assistenza), "generic" (altro)
- priority: 1-5 (1=urgentissimo, 5=bassa priorità)
- initial_stage_name: nome stage pipeline (es: "Nuovo Lead", "Contatto Caldo", "Qualificato")
- tags_to_apply: array di tag da applicare (es: ["Interesse > Prova Gratuita", "Inbound > ADV"])
- should_create_ticket: true solo se è richiesta di supporto
- rationale: breve spiegazione della classificazione

NON assegnare venditori. Se non riesci a classificare, usa fallback: lead_type="generic", priority=3.

Rispondi SOLO con il JSON, nessun testo prima o dopo.`;

async function classifyLead(
  payload: Record<string, unknown>,
  apiKey: string
): Promise<AIClassificationResult> {
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
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error("No content in AI response");
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  }
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }

  const result = JSON.parse(jsonStr.trim()) as AIClassificationResult;
  
  // Validate and normalize
  return {
    lead_type: ["trial", "info", "support", "generic"].includes(result.lead_type) 
      ? result.lead_type 
      : "generic",
    priority: Math.min(5, Math.max(1, Math.round(result.priority || 3))),
    initial_stage_name: result.initial_stage_name || "Nuovo Lead",
    tags_to_apply: Array.isArray(result.tags_to_apply) ? result.tags_to_apply : [],
    should_create_ticket: result.lead_type === "support" || result.should_create_ticket === true,
    rationale: result.rationale || "Classificazione automatica",
  };
}

// deno-lint-ignore no-explicit-any
async function applyClassification(
  supabase: any,
  brandId: string,
  leadEventId: string,
  contactId: string | null,
  dealId: string | null,
  result: AIClassificationResult
): Promise<void> {
  // 1. Update lead_event
  await supabase
    .from("lead_events")
    .update({
      lead_type: result.lead_type,
      ai_priority: result.priority,
      ai_confidence: 0.85,
      ai_rationale: result.rationale,
      ai_processed: true,
      ai_processed_at: new Date().toISOString(),
      should_create_ticket: result.should_create_ticket,
    })
    .eq("id", leadEventId);

  // 2. Update deal stage if we have a deal
  if (dealId) {
    // Find stage by name
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

  // 3. Apply tags and find category tag for ticket
  let categoryTagId: string | null = null;
  
  if (result.tags_to_apply.length > 0) {
    // Get all tags for this brand
    const { data: allTags } = await supabase
      .from("tags")
      .select("id, name, parent_id")
      .eq("brand_id", brandId)
      .eq("is_active", true);

    const typedTags = allTags as Tag[] | null;
    
    if (typedTags) {
      // Build path lookup map
      const tagMap = new Map<string, string>();
      
      // Build full paths
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
              confidence: 0.85,
            }, {
              onConflict: "tag_id,lead_event_id",
              ignoreDuplicates: true,
            });
          
          // Use first matching tag as category for ticket
          if (!categoryTagId) {
            categoryTagId = tagId;
          }
        }
      }
    }
  }

  // 4. Create ticket if should_create_ticket and we have a contact
  if (result.should_create_ticket && contactId) {
    // Extract message from payload for ticket description
    const payload = result.rationale || "Richiesta di assistenza";
    
    const { data: ticketResult, error: ticketError } = await supabase.rpc(
      "find_or_create_ticket",
      {
        p_brand_id: brandId,
        p_contact_id: contactId,
        p_deal_id: dealId,
        p_lead_event_id: leadEventId,
        p_title: result.lead_type === "support" ? "Richiesta di Assistenza" : "Ticket Automatico",
        p_description: payload,
        p_priority: result.priority,
        p_category_tag_id: categoryTagId,
      }
    );

    if (ticketError) {
      console.error("Failed to create/attach ticket:", ticketError);
    } else if (ticketResult && ticketResult.length > 0) {
      const { ticket_id, is_new } = ticketResult[0];
      console.log(`Ticket ${is_new ? "created" : "attached"}: ${ticket_id}`);

      // 5. Auto-assign via Round Robin (only for new support tickets)
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
        } else if (assignResult && assignResult.length > 0 && assignResult[0].was_assigned) {
          console.log(`Ticket auto-assigned to: ${assignResult[0].assigned_user_name}`);
        }
      }
    }
  }
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: Require CRON_SECRET for cron-triggered functions
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  
  if (!cronSecret) {
    console.error("[AUTH] CRON_SECRET environment variable not configured");
    return new Response(
      JSON.stringify({ error: "Server misconfiguration: CRON_SECRET not set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  if (providedSecret !== cronSecret) {
    console.error("[AUTH] Invalid or missing x-cron-secret");
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
          // Apply fallback for stuck jobs at max attempts
          await supabase.rpc("apply_ai_fallback", { p_lead_event_id: stuck.lead_event_id });
          await supabase
            .from("ai_jobs")
            .update({ 
              status: "failed", 
              last_error: "Job stuck in processing, fallback applied",
              completed_at: new Date().toISOString(),
            })
            .eq("id", stuck.id);
        } else {
          // Reset to pending for retry
          await supabase
            .from("ai_jobs")
            .update({ status: "pending", last_error: "Reset after stuck in processing" })
            .eq("id", stuck.id);
        }
      }
    }

    // 2. Apply fallback to jobs that exceeded max attempts but are still pending
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

    // 3. Get pending jobs (limit to batch size)
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
        // Classify with AI
        const classification = await classifyLead(
          leadEvent.raw_payload,
          LOVABLE_API_KEY
        );

        // Apply classification
        await applyClassification(
          supabase,
          job.brand_id,
          job.lead_event_id,
          leadEvent.contact_id,
          leadEvent.deal_id,
          classification
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
        console.log(`Processed job ${job.id}: ${classification.lead_type}, priority ${classification.priority}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to process job ${job.id}:`, errorMessage);

        if (job.attempts + 1 >= job.max_attempts) {
          // Max attempts reached, apply fallback
          await supabase.rpc("apply_ai_fallback", { p_lead_event_id: job.lead_event_id });
          
          await supabase
            .from("ai_jobs")
            .update({ 
              status: "failed", 
              last_error: `Max attempts reached. Last error: ${errorMessage}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        } else {
          // Retry later
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
        total: typedJobs.length 
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
