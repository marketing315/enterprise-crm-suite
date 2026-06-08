// SECURITY: Output forzato a schema Zod (ParsedSaleSchema) — non aggiungere mai
// un campo `raw_text` in risposta o nella tabella di destinazione. Persistere
// testo libero generato dall'AI riapre il finding H14 (PII/prompt-leak risk).
// Vedi finding H14/C6 nell'audit Q2 2026 (docs/security-remediation-2026-q2.md)
// e mem://features/h14-parse-sale-structured-output.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { safeParseJsonString, validateAIOutput } from "../_shared/ai-output-validate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// H14: Strict structured output. NO raw_text persisted (privacy + injection surface).
// Only typed fields with hard caps survive validation; non-conformant responses are dropped.
const ParsedSaleSchema = z.object({
  amount: z.number().finite().min(0).max(1_000_000).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  customer_name: z.string().max(200).nullable(),
  items: z
    .array(
      z.object({
        name: z.string().max(200),
        quantity: z.number().finite().min(0).max(10_000),
        unit_price: z.number().finite().min(0).max(1_000_000),
      }),
    )
    .max(100)
    .default([]),
  payment_method: z.string().max(50).nullable(),
  notes: z.string().max(2_000).nullable(),
  confidence: z.coerce.number().min(0).max(1).default(0),
}).strip();

type ParsedSaleData = z.infer<typeof ParsedSaleSchema>;

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

    // SSRF guard: validate image_url is a safe public https URL before forwarding to AI gateway.
    if (image_url) {
      const { assertSafeUrl } = await import("../_shared/safe-outbound.ts");
      const check = await assertSafeUrl(String(image_url));
      if (!check.ok) {
        return new Response(
          JSON.stringify({ error: "Invalid image_url", code: check.error }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const imageContent = image_base64
      ? { type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
      : { type: "image_url" as const, image_url: { url: image_url } };

    // H14: force structured output via response_format JSON Schema (drops free-text raw_text).
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
Estrai i dati strutturati. Importi in EUR (decimale), date YYYY-MM-DD.
Confidence 0-1 in base a leggibilità. NON includere testo libero o markdown.
Rispondi SOLO con JSON conforme allo schema.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Estrai i dati strutturati di vendita da questo documento. Solo JSON conforme allo schema.",
              },
              imageContent,
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "parsed_sale",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["amount", "date", "customer_name", "items", "payment_method", "notes", "confidence"],
              properties: {
                amount: { type: ["number", "null"] },
                date: { type: ["string", "null"] },
                customer_name: { type: ["string", "null"] },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "quantity", "unit_price"],
                    properties: {
                      name: { type: "string" },
                      quantity: { type: "number" },
                      unit_price: { type: "number" },
                    },
                  },
                },
                payment_method: { type: ["string", "null"] },
                notes: { type: ["string", "null"] },
                confidence: { type: "number" },
              },
            },
          },
        },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error", { status: aiResponse.status, len: errorText.length });
      return new Response(
        JSON.stringify({ error: "AI processing failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Strip optional code-fence (defensive — structured output should not include it)
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);

    const parsedJson = safeParseJsonString(jsonStr.trim());
    if (!parsedJson.ok) {
      console.warn("H14: AI response not valid JSON — discarded", { reason: parsedJson.error });
      return new Response(
        JSON.stringify({
          success: false,
          parsed: false,
          error: "ai_output_not_json",
          message: "Il documento non è stato interpretato. Inserisci manualmente i dati.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validated = validateAIOutput<ParsedSaleData>(ParsedSaleSchema, parsedJson.value);
    if (!validated.ok) {
      console.warn("H14: AI response failed schema validation — discarded", { error: validated.error });
      return new Response(
        JSON.stringify({
          success: false,
          parsed: false,
          error: "ai_output_invalid_schema",
          message: "Il documento non è stato interpretato. Inserisci manualmente i dati.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only typed, validated fields are returned. raw_text intentionally omitted (H14).
    return new Response(
      JSON.stringify({
        success: true,
        parsed: true,
        data: validated.data,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Error", { message: error instanceof Error ? error.message : String(error) });
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
