import { createClient } from "npm:@supabase/supabase-js@2";
import { CallProposalsArraySchema, safeParseJsonString, validateAIOutput } from "../_shared/ai-output-validate.ts";
import { enforceAiQuota, capMaxTokens } from "../_shared/ai-quota.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const PROMPT_VERSION = "v1";

const SYSTEM_PROMPT = `Sei un assistente AI enterprise per un CRM. Analizzi la trascrizione di una chiamata e proponi azioni CRM concrete, ciascuna con un tipo specifico.

TIPI DI AZIONE DISPONIBILI:
- update_contact: aggiornare campi contatto (nome, email, telefono, indirizzo, note, ecc.)
- update_kanban_stage: spostare il deal a uno stage pipeline diverso
- create_or_update_ticket: creare o aggiornare un ticket di supporto
- create_or_update_appointment: creare o riprogrammare un appuntamento
- create_lead_event: registrare un evento/nota sul lead
- update_deal: aggiornare valore, note o status del deal
- add_action_suggestion: proporre un'azione futura (follow-up, invio documentazione, ecc.)
- update_call_log: aggiornare esito/note della chiamata

REGOLE:
1. Proponi SOLO azioni supportate da evidenze nella trascrizione.
2. Per ogni azione, indica l'estratto rilevante della trascrizione.
3. Assegna un punteggio di confidenza (0.0-1.0).
4. Fornisci una breve spiegazione (rationale) per ogni azione.
5. Le proposed_changes devono essere un oggetto JSON con i campi specifici da modificare.
6. NON proporre azioni ridondanti o duplicate.
7. Ordina le azioni per importanza (più importante prima).
8. Se la trascrizione è di bassa qualità o non contiene informazioni operative, restituisci un array vuoto.`;

const PROPOSALS_TOOL = {
  type: "function",
  function: {
    name: "generate_proposals",
    description: "Genera proposte di azioni CRM dalla trascrizione di una chiamata",
    parameters: {
      type: "object",
      properties: {
        proposals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action_type: {
                type: "string",
                enum: [
                  "update_contact", "update_kanban_stage", "create_or_update_ticket",
                  "create_or_update_appointment", "create_lead_event", "update_deal",
                  "add_action_suggestion", "update_call_log"
                ],
              },
              action_label: { type: "string", description: "Etichetta leggibile, es: 'Aggiorna indirizzo contatto'" },
              proposed_changes: { type: "object", description: "Campi da modificare con nuovi valori" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string", description: "Breve spiegazione (max 150 caratteri)" },
              transcript_excerpt: { type: "string", description: "Estratto rilevante dalla trascrizione" },
            },
            required: ["action_type", "action_label", "proposed_changes", "confidence", "rationale", "transcript_excerpt"],
          },
        },
      },
      required: ["proposals"],
    },
  },
};

interface ProposalInput {
  action_type: string;
  action_label: string;
  proposed_changes: Record<string, unknown>;
  confidence: number;
  rationale: string;
  transcript_excerpt: string;
}

async function buildContext(supabase: any, brandId: string, contactId: string | null, dealId: string | null) {
  const context: Record<string, unknown> = {};

  if (contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, email, city, cap, address, notes, status")
      .eq("id", contactId)
      .single();
    if (contact) context.contact = contact;

    const { data: phones } = await supabase
      .from("contact_phones")
      .select("phone_raw, is_primary")
      .eq("contact_id", contactId)
      .eq("is_active", true);
    if (phones) context.phones = phones;
  }

  if (dealId) {
    const { data: deal } = await supabase
      .from("deals")
      .select("id, status, value, notes, current_stage_id")
      .eq("id", dealId)
      .single();
    if (deal) {
      context.deal = deal;
      if (deal.current_stage_id) {
        const { data: stage } = await supabase
          .from("pipeline_stages")
          .select("id, name")
          .eq("id", deal.current_stage_id)
          .single();
        if (stage) context.current_stage = stage;
      }
    }
  }

  // Available pipeline stages
  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("id, name, order_index")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("order_index");
  if (stages) context.available_stages = stages;

  return context;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Auth: verify JWT
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for DB operations
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get user's internal ID
    const { data: internalUser } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_auth_id", user.id)
      .single();
    if (!internalUser) {
      return new Response(JSON.stringify({ error: "user not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { call_log_id, brand_id } = await req.json();
    if (!call_log_id || !brand_id) {
      return new Response(JSON.stringify({ error: "call_log_id and brand_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch call log + transcript
    const { data: callLog, error: clErr } = await supabase
      .from("call_logs")
      .select("id, contact_id, deal_id, phone_number, call_type, status, duration_seconds, notes, outcome")
      .eq("id", call_log_id)
      .eq("brand_id", brand_id)
      .single();
    if (clErr || !callLog) {
      return new Response(JSON.stringify({ error: "call_log not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: transcript } = await supabase
      .from("call_transcripts")
      .select("id, full_text, summary")
      .eq("call_log_id", call_log_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const transcriptText = transcript?.full_text || transcript?.summary;
    if (!transcriptText) {
      return new Response(JSON.stringify({ error: "no transcript available", proposals: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build CRM context
    const crmContext = await buildContext(supabase, brand_id, callLog.contact_id, callLog.deal_id);

    // Build current snapshots for diff
    const currentSnapshots: Record<string, unknown> = {};
    if (crmContext.contact) currentSnapshots.contact = crmContext.contact;
    if (crmContext.deal) currentSnapshots.deal = crmContext.deal;
    if (crmContext.current_stage) currentSnapshots.current_stage = crmContext.current_stage;

    // C6: enforce AI quota (system job per brand)
    const userPromptText = `TRASCRIZIONE CHIAMATA:\n${transcriptText}\n\nCONTESTO CRM ATTUALE:\n${JSON.stringify(crmContext, null, 2)}\n\nGenera le proposte di azione CRM basate sulla trascrizione.`;
    const quota = await enforceAiQuota({
      supabase,
      userId: null,
      brandId: brand_id,
      endpoint: "ai-call-proposals",
      inputChars: userPromptText.length,
    });
    if (!quota.ok) return quota.response;

    // Call AI
    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPromptText },
        ],
        tools: [PROPOSALS_TOOL],
        tool_choice: { type: "function", function: { name: "generate_proposals" } },
        temperature: 0.2,
        max_tokens: capMaxTokens(undefined, "ai-call-proposals"),
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI Gateway error: ${aiResponse.status} - ${errText}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let proposals: ProposalInput[] = [];
    if (toolCall?.function?.name === "generate_proposals") {
      const j = safeParseJsonString(toolCall.function.arguments);
      if (!j.ok) {
        console.warn(`[ai-call-proposals] tool_call parse failed: ${j.error}`);
      } else {
        const v = validateAIOutput(CallProposalsArraySchema, j.value);
        if (!v.ok) {
          console.warn(`[ai-call-proposals] ${v.error}`);
        } else {
          proposals = v.data.proposals as ProposalInput[];
        }
      }
    }

    // Filter & normalize (post-Zod, defense-in-depth)
    const validTypes = [
      "update_contact", "update_kanban_stage", "create_or_update_ticket",
      "create_or_update_appointment", "create_lead_event", "update_deal",
      "add_action_suggestion", "update_call_log",
    ];
    proposals = proposals.filter(p => validTypes.includes(p.action_type));

    // Insert proposals
    if (proposals.length > 0) {
      const rows = proposals.map((p, idx) => ({
        brand_id,
        call_log_id,
        transcript_id: transcript?.id || null,
        contact_id: callLog.contact_id,
        deal_id: callLog.deal_id,
        ai_model: MODEL,
        ai_prompt_version: PROMPT_VERSION,
        ai_confidence: Math.min(1, Math.max(0, Number(p.confidence) || 0.5)),
        ai_rationale: p.rationale,
        transcript_excerpt: p.transcript_excerpt,
        action_type: p.action_type,
        action_label: p.action_label,
        proposed_changes: p.proposed_changes,
        current_snapshot: currentSnapshots,
        decision_status: "pending_approval",
        display_order: idx,
      }));

      const { data: inserted, error: insertErr } = await supabase
        .from("ai_call_action_proposals")
        .insert(rows)
        .select("id, action_type, action_label, ai_confidence, decision_status, display_order");

      if (insertErr) throw new Error(`Failed to insert proposals: ${insertErr.message}`);

      return new Response(JSON.stringify({ proposals: inserted, count: inserted?.length || 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ proposals: [], count: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ai-call-proposals] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
