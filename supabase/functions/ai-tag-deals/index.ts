import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SYSTEM_PROMPT = `Sei un assistente AI per tagging automatico di deal CRM.
Analizza il contesto del deal (contatto, lead events, stage attuale) e suggerisci tag appropriati.

REGOLE:
1. Suggerisci 1-5 tag pertinenti basandoti sul contesto
2. USA SOLO i tag esistenti nel brand (forniti nel contesto)
3. Prioritizza tag specifici rispetto a generici
4. Considera: interesse prodotto, fonte lead, comportamento cliente, fase pipeline
5. Non suggerire tag se il contesto è insufficiente

IMPORTANTE: Restituisci SOLO nomi di tag che esistono nella lista fornita.`;

const TAG_SUGGESTION_TOOL = {
  type: "function" as const,
  function: {
    name: "suggest_deal_tags",
    description: "Suggerisce tag da applicare al deal basandosi sul contesto",
    parameters: {
      type: "object",
      properties: {
        tags_to_apply: {
          type: "array",
          items: { type: "string" },
          description: "Nomi esatti dei tag da applicare (devono esistere nella lista fornita)"
        },
        rationale: {
          type: "string",
          description: "Motivazione breve per la scelta dei tag"
        },
        confidence: {
          type: "number",
          description: "Livello di confidenza da 0.0 a 1.0"
        }
      },
      required: ["tags_to_apply", "rationale", "confidence"]
    }
  }
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret for automated calls
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    
    if (cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get pending jobs
    const { data: jobs, error: jobsError } = await supabase.rpc("get_pending_ai_tag_jobs", { p_limit: 5 });
    
    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      throw jobsError;
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: "No pending jobs", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${jobs.length} AI tag jobs`);
    let processed = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        await processTagJob(supabase, job, LOVABLE_API_KEY);
        processed++;
      } catch (error) {
        console.error(`Error processing job ${job.job_id}:`, error);
        await supabase.rpc("complete_ai_tag_job", { 
          p_job_id: job.job_id, 
          p_error: error instanceof Error ? error.message : "Unknown error" 
        });
        failed++;
      }
    }

    return new Response(JSON.stringify({ 
      message: "Jobs processed", 
      processed, 
      failed,
      total: jobs.length 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("ai-tag-deals error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processTagJob(
  supabase: any,
  job: { job_id: string; brand_id: string; deal_id: string; trigger_reason: string },
  apiKey: string
) {
  // 1. Fetch deal context
  const context = await fetchDealContext(supabase, job.deal_id, job.brand_id);
  
  if (!context.availableTags || context.availableTags.length === 0) {
    console.log(`No tags available for brand ${job.brand_id}, skipping`);
    await supabase.rpc("complete_ai_tag_job", { p_job_id: job.job_id });
    return;
  }

  // 2. Build prompt
  const userPrompt = buildPrompt(context, job.trigger_reason);

  // 3. Call AI
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      tools: [TAG_SUGGESTION_TOOL],
      tool_choice: { type: "function", function: { name: "suggest_deal_tags" } },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI gateway error: ${response.status} - ${errorText}`);
  }

  const aiResponse = await response.json();
  
  // 4. Parse tool call response
  const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function.name !== "suggest_deal_tags") {
    console.log("No valid tool call in response, skipping");
    await supabase.rpc("complete_ai_tag_job", { p_job_id: job.job_id });
    return;
  }

  const suggestion = JSON.parse(toolCall.function.arguments) as {
    tags_to_apply: string[];
    rationale: string;
    confidence: number;
  };

  console.log(`AI suggested tags for deal ${job.deal_id}:`, suggestion);

  // 5. Map tag names to IDs (only valid ones)
  const tagNameToId = new Map(context.availableTags.map(t => [t.name.toLowerCase(), t.id]));
  const validTagIds = suggestion.tags_to_apply
    .map(name => tagNameToId.get(name.toLowerCase()))
    .filter((id): id is string => id !== undefined);

  if (validTagIds.length === 0) {
    console.log("No valid tags to apply after filtering");
    await supabase.rpc("complete_ai_tag_job", { p_job_id: job.job_id });
    return;
  }

  // 6. Apply tags via RPC
  const { data: appliedCount, error: applyError } = await supabase.rpc("apply_ai_deal_tags", {
    p_deal_id: job.deal_id,
    p_tag_ids: validTagIds,
    p_confidence: suggestion.confidence || 0.8,
  });

  if (applyError) {
    throw applyError;
  }

  console.log(`Applied ${appliedCount} tags to deal ${job.deal_id}`);

  // 7. Mark job as completed
  await supabase.rpc("complete_ai_tag_job", { p_job_id: job.job_id });
}

interface DealContext {
  deal: {
    id: string;
    status: string;
    value: number | null;
    notes: string | null;
    stage_name: string | null;
    created_at: string;
  } | null;
  contact: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    city: string | null;
    status: string;
  } | null;
  leadEvents: Array<{
    source: string;
    source_name: string | null;
    lead_type: string | null;
    ai_rationale: string | null;
    customer_sentiment: string | null;
    occurred_at: string;
  }>;
  existingTags: string[];
  availableTags: Array<{ id: string; name: string; description: string | null }>;
}

async function fetchDealContext(
  supabase: any,
  dealId: string,
  brandId: string
): Promise<DealContext> {
  // Fetch deal with stage
  const { data: deal } = await supabase
    .from("deals")
    .select(`
      id, status, value, notes, created_at,
      current_stage:pipeline_stages(name)
    `)
    .eq("id", dealId)
    .single();

  // Fetch contact
  const { data: dealData } = await supabase
    .from("deals")
    .select("contact_id")
    .eq("id", dealId)
    .single();

  let contact = null;
  let leadEvents: DealContext["leadEvents"] = [];

  if (dealData?.contact_id) {
    const { data: contactData } = await supabase
      .from("contacts")
      .select("first_name, last_name, email, city, status")
      .eq("id", dealData.contact_id)
      .single();
    contact = contactData;

    // Fetch lead events for this contact
    const { data: events } = await supabase
      .from("lead_events")
      .select("source, source_name, lead_type, ai_rationale, customer_sentiment, occurred_at")
      .eq("contact_id", dealData.contact_id)
      .order("occurred_at", { ascending: false })
      .limit(5);
    leadEvents = events || [];
  }

  // Fetch existing tags on this deal
  const { data: existingAssignments } = await supabase
    .from("tag_assignments")
    .select("tag:tags(name)")
    .eq("deal_id", dealId);
  
  const existingTags = (existingAssignments || [])
    .map((a: any) => a.tag?.name)
    .filter(Boolean) as string[];

  // Fetch available tags for this brand (deal scope)
  const { data: availableTags } = await supabase
    .from("tags")
    .select("id, name, description")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .or("scope.eq.deal,scope.eq.mixed");

  return {
    deal: deal ? {
      id: deal.id,
      status: deal.status,
      value: deal.value,
      notes: deal.notes,
      stage_name: (deal.current_stage as any)?.name || null,
      created_at: deal.created_at,
    } : null,
    contact,
    leadEvents,
    existingTags,
    availableTags: availableTags || [],
  };
}

function buildPrompt(context: DealContext, triggerReason: string): string {
  const parts: string[] = [];

  parts.push(`TRIGGER: ${triggerReason}`);
  parts.push("");

  if (context.deal) {
    parts.push("=== DEAL ===");
    parts.push(`Stage: ${context.deal.stage_name || "Non assegnato"}`);
    parts.push(`Status: ${context.deal.status}`);
    if (context.deal.value) parts.push(`Valore: €${context.deal.value}`);
    if (context.deal.notes) parts.push(`Note: ${context.deal.notes}`);
    parts.push("");
  }

  if (context.contact) {
    parts.push("=== CONTATTO ===");
    const name = [context.contact.first_name, context.contact.last_name].filter(Boolean).join(" ") || "Sconosciuto";
    parts.push(`Nome: ${name}`);
    if (context.contact.city) parts.push(`Città: ${context.contact.city}`);
    parts.push(`Status: ${context.contact.status}`);
    parts.push("");
  }

  if (context.leadEvents.length > 0) {
    parts.push("=== ULTIMI LEAD EVENTS ===");
    for (const event of context.leadEvents) {
      const eventInfo = [
        event.source,
        event.source_name,
        event.lead_type,
        event.customer_sentiment ? `sentiment: ${event.customer_sentiment}` : null,
      ].filter(Boolean).join(" | ");
      parts.push(`- ${eventInfo}`);
      if (event.ai_rationale) {
        parts.push(`  Rationale AI: ${event.ai_rationale}`);
      }
    }
    parts.push("");
  }

  if (context.existingTags.length > 0) {
    parts.push(`TAG GIÀ ASSEGNATI: ${context.existingTags.join(", ")}`);
    parts.push("(Non suggerire questi tag già presenti)");
    parts.push("");
  }

  parts.push("=== TAG DISPONIBILI ===");
  for (const tag of context.availableTags) {
    const desc = tag.description ? ` - ${tag.description}` : "";
    parts.push(`- ${tag.name}${desc}`);
  }

  parts.push("");
  parts.push("Suggerisci i tag più appropriati per questo deal.");

  return parts.join("\n");
}
