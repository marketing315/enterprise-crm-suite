import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Sei un assistente che genera configurazioni per regole di automazione CRM.

L'utente descriverà in linguaggio naturale cosa vuole automatizzare. Tu devi generare una configurazione JSON valida.

TIPI DI TRIGGER DISPONIBILI:
- "webhook_event": si attiva quando arriva un webhook (keplero.*, meta.lead, voispeed.*, inbound.*)
- "cron": si attiva su schedule (espressione cron standard)

TIPI DI EVENTO TRIGGER (per webhook_event):
- "keplero.ricontatto": richiesta di ricontatto da Keplero
- "keplero.appuntamento": nuovo appuntamento da Keplero  
- "keplero.rifiuto": rifiuto da Keplero
- "keplero.lead": nuovo lead da Keplero
- "keplero.*": tutti gli eventi Keplero
- "meta.lead": lead da Meta Lead Ads
- "voispeed.call_start": inizio chiamata VOIspeed
- "voispeed.call_end": fine chiamata VOIspeed
- "voispeed.call_answered": chiamata risposta
- "voispeed.call_missed": chiamata persa
- "voispeed.*": tutti eventi VOIspeed
- "inbound.*": tutti i webhook inbound generici
- "inbound.<source_name>": webhook da una specifica sorgente

AZIONI DISPONIBILI:
- "upsert_contact": crea o aggiorna un contatto. Usa match.phone per il telefono e fields per altri campi
- "add_tag": aggiunge un tag. Usa tag per il nome e entity per "contact"|"deal"|"ticket"
- "create_deal": crea un deal per il contatto (richiede upsert_contact prima)
- "create_ticket": crea un ticket. Usa fields.title e fields.priority
- "set_callback_requested": imposta richiesta ricontatto. Usa value: true/false
- "send_outbound_webhook": invia a webhook outbound. Usa webhook_id
- "log_note": aggiunge nota. Usa note per il testo e entity per l'entità

TEMPLATE DISPONIBILI per estrarre dati dal payload:
- {{payload.args.Nome}}
- {{payload.args.Cognome}}
- {{payload.args.telefono_principale}}
- {{payload.args.telefono_secondario}}
- {{payload.args.citta}}
- {{payload.args.cap}}
- {{payload.args.indirizzo_completo}}
- {{payload.args.esito_chiamata}}
- {{payload.args.data_appuntamento}}
- {{payload.args.ora_appuntamento}}
- {{payload.args.pacemaker}}
- {{payload.args.note}}

OPERATORI CONDIZIONE:
- "exists": il campo esiste e non è vuoto
- "not_exists": il campo non esiste o è vuoto
- "eq": uguale a value
- "neq": diverso da value
- "contains": contiene value (solo stringhe)
- "starts_with": inizia con value (solo stringhe)
- "gt", "gte", "lt", "lte": confronti numerici
- "in": value è un array e il campo è uno dei valori

CRON EXPRESSIONS (per trigger_type: "cron"):
- "* * * * *": ogni minuto
- "0 * * * *": ogni ora
- "0 9 * * *": ogni giorno alle 9:00
- "0 9 * * 1": ogni lunedì alle 9:00
- "0 0 1 * *": primo giorno del mese a mezzanotte

Rispondi SOLO con un JSON valido nel seguente formato:
{
  "name": "Nome descrittivo della regola",
  "description": "Descrizione opzionale",
  "trigger_type": "webhook_event" | "cron",
  "trigger_event_type": "tipo.evento" (solo per webhook_event),
  "cron_expression": "* * * * *" (solo per cron),
  "conditions": { "all": [ { "path": "payload.xxx", "op": "exists" } ] } | null,
  "actions": [ { "type": "upsert_contact", "match": { "phone": "{{payload.args.telefono_principale}}" }, "fields": { "first_name": "{{payload.args.Nome}}" } } ],
  "stop_on_failure": true,
  "priority": 100
}`;

async function readRequestBody(req: Request): Promise<{ prompt?: string; eventTypes?: { value: string; label: string }[] } | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestBody = await readRequestBody(req);
  
  if (!requestBody) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { prompt, eventTypes } = requestBody;

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Prompt richiesto" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Add context about available event types
    const eventTypesContext = eventTypes?.length 
      ? `\n\nEVENT TYPES DISPONIBILI NEL SISTEMA:\n${eventTypes.map((e) => `- "${e.value}": ${e.label}`).join("\n")}`
      : "";

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout (under 60s edge function limit)

    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT + eventTypesContext },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return new Response(JSON.stringify({ error: "Timeout: la richiesta ha impiegato troppo tempo" }), {
          status: 504,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("Fetch error:", fetchError);
      return new Response(JSON.stringify({ error: "Errore di connessione al servizio AI" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit superato, riprova tra poco." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crediti AI esauriti." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let errorText = "Unknown error";
      try {
        errorText = await response.text();
      } catch {
        // Ignore read errors
      }
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Errore del gateway AI");
    }

    // Read response body with error handling
    let responseText: string;
    try {
      responseText = await response.text();
    } catch (readError) {
      console.error("Failed to read response body:", readError);
      return new Response(JSON.stringify({ error: "Errore nella lettura della risposta AI" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let aiResponse: { choices?: { message?: { content?: string } }[] };
    try {
      aiResponse = JSON.parse(responseText);
    } catch {
      console.error("Failed to parse AI response:", responseText.substring(0, 200));
      throw new Error("Risposta AI non valida");
    }
    
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Risposta AI vuota");
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    let automation: { name?: string; actions?: unknown[] };
    try {
      automation = JSON.parse(jsonStr.trim());
    } catch {
      console.error("Failed to parse automation JSON:", jsonStr);
      throw new Error("Impossibile parsare la configurazione generata");
    }

    // Validate required fields
    if (!automation.name || !automation.actions || !Array.isArray(automation.actions)) {
      throw new Error("Configurazione generata non valida");
    }

    return new Response(JSON.stringify({ automation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-generate-automation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Errore sconosciuto" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
