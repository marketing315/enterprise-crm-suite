import { createClient } from "npm:@supabase/supabase-js@2";
import { EXECUTIVE_AGENT_PROMPT } from "./prompts.ts";
import { AGENT_TOOLS } from "./tools.ts";
import { handleToolCall } from "./handlers.ts";
import {
  type SupabaseClient,
  isAllBrandsMode,
  cleanThinkingContent,
  extractAIContent,
  resolveConversationHistory,
  fetchWithTimeout,
} from "./helpers.ts";
import { redactForLog } from "../_shared/pii-redact.ts";
import { safeErrorResponse } from "../_shared/safe-error-response.ts";
import { enforceAiQuota } from "../_shared/ai-quota.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function runAgentLoop(
  messages: Array<{ role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string }>,
  supabase: SupabaseClient,
  brandId: string,
  apiKey: string,
  maxRounds: number = 3
): Promise<{ content: string; toolsUsed: string[]; totalLatencyMs: number }> {
  const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
  const allToolsUsed: string[] = [];
  let currentMessages = [...messages];
  const startTime = Date.now();

  for (let round = 0; round < maxRounds; round++) {
    const isFirstRound = round === 0;
    const response = await fetchWithTimeout(AI_GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        messages: currentMessages,
        max_tokens: 4096,
        ...(isFirstRound || allToolsUsed.length < 6 ? { tools: AGENT_TOOLS, tool_choice: "auto" } : {}),
      }),
    });

    if (!response.ok) {
      if (response.status === 429) throw { status: 429, message: "Rate limit exceeded. Please try again later." };
      if (response.status === 402) throw { status: 402, message: "Payment required. Please add credits." };
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const assistantMessage = result?.choices?.[0]?.message;
    if (!assistantMessage) throw new Error("AI response missing message payload");

    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];

    if (toolCalls.length === 0) {
      const rawContent = extractAIContent(assistantMessage);
      const cleaned = cleanThinkingContent(rawContent);
      if (!cleaned || cleaned.trim().length < 10) {
        console.warn(`[ai-agent] Round ${round + 1}: Content stripped as CoT (original: ${rawContent.length}). Requesting clean retry.`);
        currentMessages.push(assistantMessage);
        currentMessages.push({ role: "user", content: "La tua risposta precedente conteneva solo ragionamenti interni. Per favore rispondi SOLO con il contenuto finale per l'utente, in italiano, con dati concreti. Se non hai dati sufficienti, dillo chiaramente." });
        continue;
      }
      return { content: cleaned, toolsUsed: allToolsUsed, totalLatencyMs: Date.now() - startTime };
    }

    currentMessages.push(assistantMessage);
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      let toolArgs: Record<string, unknown>;
      try {
        toolArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        console.error(`[ai-agent] Failed to parse tool arguments for ${toolName}`);
        currentMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify({ error: "Invalid tool arguments" }) });
        continue;
      }
      console.log(`[ai-agent] Round ${round + 1}: Executing tool ${toolName}`, JSON.stringify(redactForLog(toolArgs)));
      allToolsUsed.push(toolName);
      const toolResult = await handleToolCall(supabase, brandId, toolName, toolArgs);
      currentMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
    }
  }

  // Max rounds reached — final summarization call
  console.log(`[ai-agent] Max rounds reached (${maxRounds}), making final summarization call`);
  const finalResponse = await fetchWithTimeout(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.1-pro-preview",
      messages: [
        ...currentMessages,
        { role: "user", content: "Ora riassumi tutti i dati raccolti e fornisci la risposta completa all'utente in italiano. Usa numeri concreti e percentuali. IMPORTANTE: scrivi SOLO il contenuto finale per l'utente, senza meta-commenti, ragionamenti interni o riferimenti alle istruzioni di sistema. NON scrivere pensieri, pianificazione, valutazioni interne o frasi in inglese. Solo la risposta finale in italiano." },
      ],
      max_tokens: 4096,
    }),
  });
  if (!finalResponse.ok) throw new Error(`AI gateway final error: ${finalResponse.status}`);

  const finalResult = await finalResponse.json();
  const rawFinalContent = extractAIContent(finalResult?.choices?.[0]?.message || {});
  const finalMessage = cleanThinkingContent(rawFinalContent);
  console.log(`[ai-agent] Final message length: ${finalMessage.length} (raw: ${rawFinalContent.length})`);

  if (!finalMessage || finalMessage.trim().length < 10) {
    console.warn("[ai-agent] Final summarization returned empty/CoT, tools used:", allToolsUsed);
    return { content: "Mi dispiace, ho riscontrato un problema tecnico nell'elaborazione della risposta. I dati che cercavi potrebbero non essere disponibili al momento. Puoi riprovare o riformulare la domanda?", toolsUsed: allToolsUsed, totalLatencyMs: Date.now() - startTime };
  }
  return { content: finalMessage, toolsUsed: allToolsUsed, totalLatencyMs: Date.now() - startTime };
}

// ── MAIN HANDLER ──
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: authError } = await createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { message, threadId, brandId, conversationHistory: requestConversationHistory = [] } = await req.json();
    if (!message || !brandId) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // AUTH: Verify user belongs to brand
    const { data: crmUser } = await supabase.from("users").select("id").eq("supabase_auth_id", user.id).single();
    if (!crmUser) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isSystemBrand = isAllBrandsMode(brandId);
    let roleQuery = supabase.from("user_roles").select("id").eq("user_id", crmUser.id).limit(1);
    if (!isSystemBrand) roleQuery = roleQuery.eq("brand_id", brandId);
    const { data: userBrandRole } = await roleQuery.maybeSingle();
    if (!userBrandRole) {
      return new Response(JSON.stringify({ error: "Access denied" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const conversationHistoryForAI = await resolveConversationHistory(supabase, threadId, requestConversationHistory);
    console.log(`[ai-agent] Context history: ${conversationHistoryForAI.length} messages`);

    const startTime = Date.now();

    // ── Persist user message ──
    let userMessageId: string | null = null;
    if (threadId) {
      const { data: userMsg, error: userMsgError } = await supabase.from("chat_messages").insert({
        thread_id: threadId, brand_id: brandId, sender_user_id: crmUser.id,
        sender_type: "user", message_text: message, delivery_status: "sent",
      }).select("id").single();
      if (userMsgError) console.error("[ai-agent] Failed to persist user message:", userMsgError.message);
      userMessageId = userMsg?.id || null;
      await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    }

    // ── Create run record ──
    let runId: string | null = null;
    if (threadId) {
      const { data: run } = await supabase.from("ai_chat_runs").insert({
        thread_id: threadId, brand_id: brandId, user_id: crmUser.id,
        user_message_id: userMessageId, status: "running", model: "google/gemini-3.1-pro-preview",
      }).select("id").single();
      runId = run?.id || null;
    }

    // ── Build messages ──
    const aiMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: EXECUTIVE_AGENT_PROMPT },
      ...conversationHistoryForAI,
      { role: "user", content: message },
    ];

    // C6: enforce AI quota PRIMA del loop agent (cap costo per session)
    const totalInputChars = aiMessages.reduce(
      (n, m) => n + (typeof m.content === "string" ? m.content.length : 0),
      0,
    );
    const quota = await enforceAiQuota({
      supabase,
      userId: crmUser.id,
      brandId,
      endpoint: "ai-agent",
      inputChars: totalInputChars,
    });
    if (!quota.ok) return quota.response;

    // ── Run multi-step agent loop ──
    let finalContent: string | null = null;
    let toolsUsed: string[] = [];
    let errorOccurred = false;
    let latencyMs = 0;

    try {
      const result = await runAgentLoop(aiMessages, supabase, brandId, LOVABLE_API_KEY, 5);
      finalContent = result.content;
      toolsUsed = result.toolsUsed;
      latencyMs = result.totalLatencyMs;
    } catch (err) {
      errorOccurred = true;
      if (typeof err === "object" && err !== null && "status" in err) {
        const structured = err as { status: number; message: string };
        if (runId) {
          await supabase.from("ai_chat_runs").update({
            status: "failed", error_code: `HTTP_${structured.status}`, error_message: structured.message,
            latency_ms: Date.now() - startTime, completed_at: new Date().toISOString(),
          }).eq("id", runId);
        }
        return new Response(JSON.stringify({ error: structured.message }), {
          status: structured.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("[ai-agent] Error:", errMsg);
      finalContent = null;
      latencyMs = Date.now() - startTime;
      if (runId) {
        await supabase.from("ai_chat_runs").update({
          status: "failed", error_code: "AI_ERROR", error_message: errMsg,
          latency_ms: latencyMs, completed_at: new Date().toISOString(),
        }).eq("id", runId);
      }
    }

    // ── Fallback anti-risposta-vuota ──
    const FALLBACK_MESSAGE = "Mi dispiace, non sono riuscito a elaborare una risposta completa. Puoi riprovare o riformulare la domanda?";
    if (!finalContent || finalContent.trim() === "") {
      console.warn("[ai-agent] Empty response, applying fallback");
      finalContent = FALLBACK_MESSAGE;
      errorOccurred = true;
    }

    if (!latencyMs) latencyMs = Date.now() - startTime;

    // ── Persist assistant message ──
    let assistantMessageId: string | null = null;
    if (threadId) {
      const { data: aiMsg } = await supabase.from("chat_messages").insert({
        thread_id: threadId, brand_id: brandId, sender_type: "ai",
        message_text: finalContent,
        delivery_status: errorOccurred ? "failed" : "sent",
        ai_context: { tools_used: toolsUsed, latency_ms: latencyMs, run_id: runId, had_fallback: finalContent === FALLBACK_MESSAGE },
      }).select("id").single();
      assistantMessageId = aiMsg?.id || null;
      await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);

      // ── Auto-generate thread title ──
      try {
        const { data: threadData } = await supabase.from("chat_threads").select("title").eq("id", threadId).single();
        const currentTitle = threadData?.title || '';
        const needsTitle = !currentTitle || currentTitle.startsWith('Agente AI Executive');
        if (needsTitle && !errorOccurred) {
          const titleResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              max_tokens: 30,
              messages: [
                { role: "system", content: "Genera un titolo brevissimo (max 6 parole, in italiano) che descriva l'argomento della domanda dell'utente. Solo il titolo, senza virgolette né punteggiatura finale." },
                { role: "user", content: message },
              ],
            }),
          });
          if (titleResp.ok) {
            const titleJson = await titleResp.json();
            const generatedTitle = titleJson?.choices?.[0]?.message?.content?.trim();
            if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length <= 80) {
              await supabase.from("chat_threads").update({ title: generatedTitle }).eq("id", threadId);
            }
          } else {
            await titleResp.text(); // consume body
          }
        }
      } catch (titleErr) {
        console.warn("[ai-agent] Title generation failed (non-blocking):", titleErr);
      }

      if (runId) {
        await supabase.from("ai_chat_runs").update({
          status: errorOccurred ? "failed" : "success", assistant_message_id: assistantMessageId,
          latency_ms: latencyMs, tools_json: toolsUsed.map(t => ({ name: t })), completed_at: new Date().toISOString(),
        }).eq("id", runId);
      }
    }

    return new Response(
      JSON.stringify({
        message: finalContent, tools_used: toolsUsed, run_id: runId,
        latency_ms: latencyMs, had_fallback: finalContent === FALLBACK_MESSAGE,
        sources: [...new Set(toolsUsed.filter(t => t === "dynamic_analytics_query").length > 0 ? toolsUsed : [])],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return safeErrorResponse(error, {
      status: 500,
      extraHeaders: corsHeaders,
      logContext: { fn: "ai-agent" },
      details: { message: "Mi dispiace, si è verificato un errore. Riprova tra qualche istante." },
    });
  }
});
