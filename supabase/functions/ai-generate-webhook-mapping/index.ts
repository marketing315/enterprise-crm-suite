import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Available source fields from lead_event payload (documented for AI context)
const AVAILABLE_SOURCE_FIELDS = `
Available source fields in the webhook payload (use dot notation):

## Contact Snapshot (contact_snapshot.*)
- contact_snapshot.id - UUID contatto
- contact_snapshot.first_name - Nome
- contact_snapshot.last_name - Cognome
- contact_snapshot.email - Email
- contact_snapshot.phone - Telefono principale (E.164)
- contact_snapshot.address - Indirizzo
- contact_snapshot.city - Città
- contact_snapshot.cap - CAP
- contact_snapshot.province - Provincia
- contact_snapshot.company_name - Ragione sociale
- contact_snapshot.company_address - Indirizzo azienda
- contact_snapshot.company_zip - CAP azienda
- contact_snapshot.company_city - Città azienda
- contact_snapshot.company_province - Provincia azienda
- contact_snapshot.vat_number - Partita IVA
- contact_snapshot.fiscal_code - Codice Fiscale
- contact_snapshot.lead_type - Tipo lead
- contact_snapshot.lead_message - Messaggio lead
- contact_snapshot.lead_cost - Costo lead
- contact_snapshot.lead_valid - Lead valido (boolean)
- contact_snapshot.lead_state_id - ID stato lead (numerico)
- contact_snapshot.note1 through contact_snapshot.note10 - Campi note personalizzati

## Event Data (root level)
- event_type - Tipo evento (es. "lead_event.created")
- event_id - UUID evento
- source - Sorgente (es. "webhook", "manual")
- source_name - Nome sorgente (es. "MyMed Landing")
- raw_data - Dati grezzi originali (JSON)
- created_at - Data creazione (ISO 8601)

## Tracking Data (tracking.*)
- tracking.utm_source
- tracking.utm_medium
- tracking.utm_campaign
- tracking.utm_content
- tracking.utm_term
- tracking.gclid
- tracking.fbp
- tracking.fbc

## Qualification Data (qualification.*)
- qualification.sentiment
- qualification.pacemaker_status
- qualification.clinical_topics
`;

interface GenerateMappingRequest {
  prompt: string;
  brandId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt, brandId } = await req.json() as GenerateMappingRequest;

    if (!prompt || !brandId) {
      return new Response(JSON.stringify({ error: "prompt and brandId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user has access to brand via user_roles
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: crmUser } = await adminClient
      .from("users")
      .select("id")
      .eq("supabase_auth_id", user.id)
      .single();

    if (!crmUser) {
      return new Response(JSON.stringify({ error: "brand_access_denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: brandAccess, error: brandError } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", crmUser.id)
      .eq("brand_id", brandId)
      .limit(1)
      .maybeSingle();

    if (brandError || !brandAccess) {
      return new Response(JSON.stringify({ error: "brand_access_denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Lovable AI to generate the mapping
    const lovableAiUrl = Deno.env.get("LOVABLE_AI_URL") || "https://ai-backend.lovable.dev";
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Sei un assistente che genera mapping JSON per webhook outbound.
L'utente ti descrive quali campi vuole mappare dal payload sorgente ai campi destinazione.
Devi restituire SOLO un oggetto JSON valido con il formato:
{
  "campo_destinazione": "percorso.sorgente"
}

${AVAILABLE_SOURCE_FIELDS}

REGOLE IMPORTANTI:
1. Restituisci SOLO il JSON, senza markdown, senza spiegazioni
2. I campi destinazione sono quelli richiesti dall'utente (es. "nome", "cognome", "telefono")
3. I percorsi sorgente devono corrispondere ai campi disponibili sopra
4. Usa la notazione con punto per campi annidati (es. "contact_snapshot.first_name")
5. Se l'utente menziona campi non disponibili, ignorali
6. Per campi come "data privacy" o "consenso" che non esistono, usa note1-note10 o ignora
`;

    const aiResponse = await fetch(`${lovableAiUrl}/api/ai/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[AI_ERROR]", aiResponse.status, errorText);
      return new Response(JSON.stringify({ error: "AI service error", details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || aiResult.content || "";

    // Extract JSON from response (handle markdown code blocks)
    let mappingJson: Record<string, string>;
    try {
      // Remove markdown code blocks if present
      let cleanContent = rawContent.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      cleanContent = cleanContent.trim();
      
      mappingJson = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("[PARSE_ERROR]", rawContent);
      return new Response(JSON.stringify({ 
        error: "invalid_ai_response", 
        raw: rawContent 
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate mapping structure
    if (typeof mappingJson !== "object" || Array.isArray(mappingJson)) {
      return new Response(JSON.stringify({ 
        error: "invalid_mapping_structure", 
        raw: rawContent 
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[AI_MAPPING] Generated ${Object.keys(mappingJson).length} field mappings for brand=${brandId}`);

    return new Response(JSON.stringify({ 
      mapping: mappingJson,
      field_count: Object.keys(mappingJson).length,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[FATAL]", error);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
