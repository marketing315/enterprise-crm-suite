import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

interface EntityContext {
  type: string;
  id: string;
  contact?: {
    name: string;
    email?: string;
    city?: string;
    status: string;
  };
  deal?: {
    status: string;
    stage?: string;
    value?: number;
  };
  events?: Array<{
    source: string;
    priority?: number;
    created_at: string;
    lead_type?: string;
  }>;
  appointments?: Array<{
    status: string;
    scheduled_at: string;
    type?: string;
  }>;
  tickets?: Array<{
    status: string;
    priority: number;
    title: string;
  }>;
}

const SYSTEM_PROMPT = `Sei un assistente AI interno per operatori CRM. Hai accesso al contesto dell'entità corrente (contatto, deal, eventi, appuntamenti, ticket).

CAPACITÀ:
1. Riassumere la timeline del contatto
2. Suggerire la prossima azione (script chiamata, follow-up)
3. Proporre tag/stage con motivazione
4. Generare bozze di risposta (email/WhatsApp)
5. Rispondere a domande sul cliente

REGOLE:
- Rispondi in italiano
- Sii conciso e azionabile
- Non inventare dati non presenti nel contesto
- Suggerisci sempre azioni concrete
- Usa formattazione markdown quando utile

CONTESTO ENTITÀ:
{entity_context}`;

// deno-lint-ignore no-explicit-any
async function fetchEntityContext(supabase: any, entityType: string, entityId: string, brandId: string): Promise<EntityContext> {
  const context: EntityContext = { type: entityType, id: entityId };

  if (entityType === "contact" || entityType === "deal") {
    // Fetch contact
    let contactId = entityId;
    
    if (entityType === "deal") {
      const { data: deal } = await supabase
        .from("deals")
        .select("contact_id, status, value, current_stage_id, pipeline_stages(name)")
        .eq("id", entityId)
        .single();
      
      if (deal) {
        contactId = deal.contact_id;
        context.deal = {
          status: deal.status,
          stage: deal.pipeline_stages?.name,
          value: deal.value,
        };
      }
    }

    // Fetch contact info
    const { data: contact } = await supabase
      .from("contacts")
      .select("first_name, last_name, email, city, status")
      .eq("id", contactId)
      .single();

    if (contact) {
      context.contact = {
        name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "N/A",
        email: contact.email,
        city: contact.city,
        status: contact.status,
      };
    }

    // Fetch recent events
    const { data: events } = await supabase
      .from("lead_events")
      .select("source, ai_priority, created_at, lead_type")
      .eq("contact_id", contactId)
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (events) {
      context.events = events.map((e: { source: string; ai_priority: number; created_at: string; lead_type: string }) => ({
        source: e.source,
        priority: e.ai_priority,
        created_at: e.created_at,
        lead_type: e.lead_type,
      }));
    }

    // Fetch appointments
    const { data: appointments } = await supabase
      .from("appointments")
      .select("status, scheduled_at, appointment_type")
      .eq("contact_id", contactId)
      .eq("brand_id", brandId)
      .order("scheduled_at", { ascending: false })
      .limit(3);

    if (appointments) {
      context.appointments = appointments.map((a: { status: string; scheduled_at: string; appointment_type: string }) => ({
        status: a.status,
        scheduled_at: a.scheduled_at,
        type: a.appointment_type,
      }));
    }
  }

  if (entityType === "ticket") {
    const { data: ticket } = await supabase
      .from("tickets")
      .select("status, priority, title, contact_id")
      .eq("id", entityId)
      .single();

    if (ticket) {
      context.tickets = [{
        status: ticket.status,
        priority: ticket.priority,
        title: ticket.title,
      }];

      // Fetch contact for ticket
      if (ticket.contact_id) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("first_name, last_name, email, status")
          .eq("id", ticket.contact_id)
          .single();

        if (contact) {
          context.contact = {
            name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "N/A",
            email: contact.email,
            status: contact.status,
          };
        }
      }
    }
  }

  return context;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { threadId, message, entityType, entityId, brandId } = await req.json();

    if (!threadId || !message || !brandId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch entity context if available
    let entityContext: EntityContext | null = null;
    if (entityType && entityId) {
      entityContext = await fetchEntityContext(supabase, entityType, entityId, brandId);
    }

    // Fetch recent messages for context
    const { data: recentMessages } = await supabase
      .from("chat_messages")
      .select("sender_type, message_text")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(10);

    const messagesForAI = (recentMessages || [])
      .reverse()
      .map((m: { sender_type: string; message_text: string }) => ({
        role: m.sender_type === "ai" ? "assistant" : "user",
        content: m.message_text,
      }));

    // Add current message
    messagesForAI.push({ role: "user", content: message });

    // Build system prompt with context
    const systemPrompt = SYSTEM_PROMPT.replace(
      "{entity_context}",
      entityContext ? JSON.stringify(entityContext, null, 2) : "Nessun contesto entità disponibile"
    );

    // Call AI
    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...messagesForAI,
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
    }

    const aiResponse = await response.json();
    const aiMessage = aiResponse.choices?.[0]?.message?.content || "Mi dispiace, non sono riuscito a generare una risposta.";

    // Save AI message to chat
    const { data: savedMessage, error: saveError } = await supabase
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        brand_id: brandId,
        sender_type: "ai",
        message_text: aiMessage,
        ai_context: entityContext ? { entity: entityContext } : null,
      })
      .select("id")
      .single();

    if (saveError) {
      console.error("Failed to save AI message:", saveError);
    }

    return new Response(
      JSON.stringify({ 
        message: aiMessage,
        messageId: savedMessage?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("AI Chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
