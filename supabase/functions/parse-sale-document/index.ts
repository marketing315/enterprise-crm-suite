import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedSaleData {
  amount: number | null;
  date: string | null;
  customer_name: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
  }>;
  payment_method: string | null;
  notes: string | null;
  confidence: number;
  raw_text: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { image_base64, image_url } = await req.json();
    
    if (!image_base64 && !image_url) {
      return new Response(
        JSON.stringify({ error: "Missing image_base64 or image_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare image content for AI
    const imageContent = image_base64 
      ? { type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
      : { type: "image_url" as const, image_url: { url: image_url } };

    // Call Lovable AI with vision for document parsing
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Sei un esperto analizzatore di documenti di vendita italiani (scontrini, ricevute, fatture, preventivi).
Analizza l'immagine e estrai i dati di vendita in formato JSON strutturato.

IMPORTANTE:
- Importo totale in EUR (numero decimale, es: 150.50)
- Data in formato YYYY-MM-DD
- Nome cliente se visibile
- Lista prodotti/servizi con quantità e prezzo unitario
- Metodo pagamento se visibile (contanti, carta, bonifico, etc)
- Confidence score da 0 a 1 basato sulla leggibilità

Rispondi SOLO con JSON valido, senza markdown.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analizza questo documento di vendita ed estrai tutti i dati. Rispondi in JSON con: amount, date, customer_name, items (array con name, quantity, unit_price), payment_method, notes, confidence, raw_text."
              },
              imageContent
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "AI processing failed", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Parse AI response - try to extract JSON
    let parsedData: ParsedSaleData;
    try {
      // Clean up potential markdown code blocks
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
      
      parsedData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("B3: Failed to parse AI response:", content);
      parsedData = {
        amount: null,
        date: null,
        customer_name: null,
        items: [],
        payment_method: null,
        notes: content,
        confidence: 0.1,
        raw_text: content,
      };
      // B3 FIX: Return parsed:false so consumers know this is a fallback
      return new Response(
        JSON.stringify({ 
          success: true, 
          parsed: false,
          status: "partial",
          data: parsedData 
        }),
        { 
          status: 207, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        parsed: true,
        data: parsedData 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});