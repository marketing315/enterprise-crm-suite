import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── SYSTEM PROMPT with metric catalog ──
const EXECUTIVE_AGENT_PROMPT = `Sei un assistente AI executive premium per il CRM. Hai accesso COMPLETO ai dati della piattaforma tramite strumenti analitici avanzati.

## DATA CORRENTE
Oggi è: ${new Date().toISOString().split('T')[0]} (usala come riferimento per "oggi", "ultimi 3 giorni", "questa settimana", ecc.)

## CAPACITÀ PREMIUM
1. **Dynamic Analytics**: Puoi interrogare QUALSIASI metrica CRM con filtri, raggruppamenti e periodi personalizzati
2. **Analisi Geografica**: Breakdown per regione/provincia/città usando i CAP dei contatti
3. **Trend & Confronti**: Confronti temporali (WoW, MoM, periodi custom)
4. **Search & Timeline**: Ricerca contatti con timeline completa
5. **Multi-step Reasoning**: Posso combinare più query per analisi complesse

## CATALOGO METRICHE (usa dynamic_analytics_query)
| Metrica | Dataset | Metric param | Note |
|---------|---------|-------------|------|
| Lead totali (eventi) | leads | count | Conta eventi lead_events |
| Lead unici (contatti) | leads | count_distinct_contacts | Contatti unici con lead |
| Contatti totali | contacts | count | |
| Deal aperti | deals | count | Filtra status=open |
| Valore pipeline | deals | sum_value | Filtra status=open |
| Ticket aperti | tickets | count | Filtra status in [open,in_progress] |
| Appuntamenti | appointments | count | |
| Chiamate | calls | count | |
| Costo lead | leads | sum_lead_cost | Costo acquisizione |

## RAGGRUPPAMENTI DISPONIBILI (group_by)
- **Temporali**: date, week, month
- **Geografici**: regione, provincia, city
- **Business**: status, priority, source_name, lead_type, outcome, appointment_type, call_type

## FILTRI DISPONIBILI (filters)
status, priority, source_name, lead_type, outcome, appointment_type, call_type, assigned_user_id, created_by_user_id, contact_id, deal_id, lead_valid

## REGOLE DI RISPOSTA
- Rispondi SEMPRE in italiano
- Usa dati concreti con numeri E percentuali
- Per domande geografiche usa group_by=regione o provincia
- Per periodi custom parsa le date in formato ISO
- Se dati insufficienti, spiega cosa manca e suggerisci domande alternative
- Formatta con markdown: tabelle, liste, bold, emoji (📈📉⚠️✅💼🎫🗺️)
- Concludi con 1-2 suggerimenti actionable
- MAI inventare dati: se il tool ritorna vuoto, dillo
- Per analisi complesse, usa più tool calls in sequenza

## STRATEGIA MULTI-STEP
1. Prima ottieni il totale generale
2. Poi il breakdown (geo/temporale/business)
3. Calcola percentuali dal totale
4. Confronta con periodo precedente se rilevante`;

// ── TOOL DEFINITIONS ──
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "dynamic_analytics_query",
      description: `Query analitica dinamica su qualsiasi dataset CRM. Supporta filtri, raggruppamenti temporali/geografici/business, e diverse metriche.
Datasets: leads, contacts, deals, tickets, appointments, calls.
Metriche: count, count_distinct_contacts, sum_value, avg_value, sum_lead_cost.
Group by: date, week, month, regione, provincia, city, status, priority, source_name, lead_type, outcome, appointment_type, call_type.
Filtri: status, priority, source_name, lead_type, outcome, appointment_type, call_type, assigned_user_id, lead_valid.
USA QUESTO TOOL per qualsiasi domanda su numeri, KPI, analisi, breakdown, confronti. È il tool principale.`,
      parameters: {
        type: "object",
        properties: {
          dataset: {
            type: "string",
            enum: ["leads", "contacts", "deals", "tickets", "appointments", "calls"],
            description: "Dataset da interrogare",
          },
          metric: {
            type: "string",
            enum: ["count", "count_distinct_contacts", "sum_value", "avg_value", "sum_lead_cost"],
            description: "Metrica da calcolare (default: count)",
          },
          date_from: {
            type: "string",
            description: "Data inizio in formato ISO 8601 (es: 2026-03-01T00:00:00Z). Per 'oggi' usa inizio giornata corrente, per 'ultimi 7 giorni' usa 7 giorni fa, ecc.",
          },
          date_to: {
            type: "string",
            description: "Data fine in formato ISO 8601 (es: 2026-03-06T23:59:59Z). Default: ora corrente.",
          },
          group_by: {
            type: "string",
            enum: ["date", "week", "month", "regione", "provincia", "city", "status", "priority", "source_name", "lead_type", "outcome", "appointment_type", "call_type"],
            description: "Campo per raggruppare i risultati. Usa 'regione' per breakdown geografico per regione italiana.",
          },
          filters: {
            type: "object",
            description: "Filtri aggiuntivi come oggetto chiave-valore. Es: {\"status\": \"open\"} o {\"priority\": [1,2]} o {\"lead_valid\": true}",
          },
          limit: {
            type: "integer",
            description: "Numero massimo di risultati raggruppati (default: 50)",
          },
        },
        required: ["dataset"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_contacts",
      description: "Cerca contatti per nome, email, telefono o azienda. Restituisce dati di contatto con CAP, città, provincia per analisi geo.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Termine di ricerca (nome, email, telefono, azienda)" },
          limit: { type: "integer", description: "Numero massimo di risultati (default: 5)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_contact_timeline",
      description: "Timeline completa di un contatto: lead, deal, ticket, appuntamenti, chiamate. Usa dopo search_contacts per approfondire.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "UUID del contatto" },
        },
        required: ["contact_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_status",
      description: "Snapshot pipeline: deal per stage con conteggio e valore. Usa per domande su pipeline, vendite, funnel.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_operator_performance",
      description: "Performance operatori: ticket gestiti, risolti, tempi medi. Usa per domande su team, operatori, performance.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "7d", "30d"], description: "Periodo di riferimento" },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ad_performance",
      description: `Analisi performance advertising (Meta Ads, Google Ads). Restituisce dati aggregati su spesa, impressioni, click, CTR, CPC, CPM, reach, frequenza, conversioni. Include breakdown per campagna, per creatività e per demografica. USA QUESTO TOOL per QUALSIASI domanda su: ads, advertising, campagne pubblicitarie, spesa adv, Meta Ads, Google Ads, budget pubblicitario, CTR, CPC, CPM, ROAS, ottimizzazione ads, creatività, target demografico.`,
      parameters: {
        type: "object",
        properties: {
          date_from: {
            type: "string",
            description: "Data inizio in formato ISO 8601 (es: 2026-03-01). Default: ultimi 30 giorni.",
          },
          date_to: {
            type: "string",
            description: "Data fine in formato ISO 8601 (es: 2026-03-09). Default: oggi.",
          },
          platform: {
            type: "string",
            enum: ["meta", "google"],
            description: "Filtra per piattaforma. Se omesso, restituisce tutte.",
          },
          include_creatives: {
            type: "boolean",
            description: "Se true, include breakdown per creatività/ad singolo. Default: false.",
          },
          include_demographics: {
            type: "boolean",
            description: "Se true, include breakdown per età e genere. Default: false.",
          },
        },
        required: [],
      },
    },
  },
];

// ── HELPERS ──
function getPeriodDates(period: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  switch (period) {
    case "today": { const s = new Date(now); s.setHours(0, 0, 0, 0); return { from: s.toISOString(), to }; }
    case "week": case "7d": { const s = new Date(now); s.setDate(s.getDate() - 7); return { from: s.toISOString(), to }; }
    case "month": case "30d": { const s = new Date(now); s.setDate(s.getDate() - 30); return { from: s.toISOString(), to }; }
    default: { const s = new Date(now); s.setDate(s.getDate() - 7); return { from: s.toISOString(), to }; }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// ── TOOL HANDLERS ──
async function handleToolCall(
  supabase: SupabaseClient,
  brandId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "dynamic_analytics_query":
      return await executeDynamicQuery(supabase, brandId, args);
    case "search_contacts":
      return await searchContacts(supabase, brandId, args.query as string, (args.limit as number) || 5);
    case "get_contact_timeline":
      return await getContactTimeline(supabase, brandId, args.contact_id as string);
    case "get_pipeline_status":
      return await getPipelineStatus(supabase, brandId);
    case "get_operator_performance":
      return await getOperatorPerformance(supabase, brandId, (args.period as string) || "7d");
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// Dynamic analytics via RPC
async function executeDynamicQuery(supabase: SupabaseClient, brandId: string, args: Record<string, unknown>) {
  try {
    const { data, error } = await supabase.rpc("dynamic_analytics_query", {
      p_brand_id: brandId,
      p_dataset: args.dataset as string,
      p_metric: (args.metric as string) || "count",
      p_date_from: (args.date_from as string) || null,
      p_date_to: (args.date_to as string) || null,
      p_group_by: (args.group_by as string) || null,
      p_filters: args.filters || {},
      p_limit: (args.limit as number) || 50,
    });
    if (error) {
      console.error("[dynamic_analytics_query] RPC error:", error.message);
      return { error: error.message, hint: "Verifica che dataset, metric, group_by e filters siano validi." };
    }
    return {
      dataset: args.dataset,
      metric: args.metric || "count",
      group_by: args.group_by || null,
      date_from: args.date_from || null,
      date_to: args.date_to || null,
      filters: args.filters || {},
      results: data,
      row_count: Array.isArray(data) ? data.length : 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[dynamic_analytics_query] Exception:", msg);
    return { error: msg };
  }
}

async function searchContacts(supabase: SupabaseClient, brandId: string, query: string, limit: number) {
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone, city, cap, province, company_name, lead_type, status, created_at")
    .eq("brand_id", brandId)
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%,company_name.ilike.%${query}%`)
    .limit(limit);
  return { contacts: data || [], count: (data || []).length };
}

async function getContactTimeline(supabase: SupabaseClient, brandId: string, contactId: string) {
  const [leads, deals, tickets, appointments, calls] = await Promise.all([
    supabase.from("lead_events").select("id, source_name, lead_type, received_at").eq("brand_id", brandId).eq("contact_id", contactId).order("received_at", { ascending: false }).limit(10),
    supabase.from("deals").select("id, value, status, created_at").eq("brand_id", brandId).eq("contact_id", contactId).order("created_at", { ascending: false }).limit(10),
    supabase.from("tickets").select("id, status, priority, created_at").eq("brand_id", brandId).eq("contact_id", contactId).order("created_at", { ascending: false }).limit(10),
    supabase.from("appointments").select("id, status, scheduled_at, appointment_type").eq("brand_id", brandId).eq("contact_id", contactId).order("scheduled_at", { ascending: false }).limit(10),
    supabase.from("call_logs").select("id, status, outcome, started_at, duration_seconds").eq("brand_id", brandId).eq("contact_id", contactId).order("started_at", { ascending: false }).limit(10),
  ]);
  return {
    leads: leads.data || [],
    deals: deals.data || [],
    tickets: tickets.data || [],
    appointments: appointments.data || [],
    calls: calls.data || [],
  };
}

async function getPipelineStatus(supabase: SupabaseClient, brandId: string) {
  const [dealsResult, stagesResult] = await Promise.all([
    supabase.from("deals").select("id, value, status, current_stage_id, created_at, contact:contacts(first_name, last_name)").eq("brand_id", brandId).eq("status", "open").order("created_at", { ascending: true }),
    supabase.from("pipeline_stages").select("id, name, sort_order").eq("brand_id", brandId).order("sort_order"),
  ]);
  interface Deal { id: string; value: number | null; current_stage_id: string | null; created_at: string; contact: { first_name: string | null; last_name: string | null } | null }
  interface Stage { id: string; name: string; sort_order: number }
  const deals = (dealsResult.data || []) as Deal[];
  const stages = (stagesResult.data || []) as Stage[];
  const dealsByStage = stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.current_stage_id === stage.id);
    return { stage_name: stage.name, count: stageDeals.length, value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0) };
  });
  return {
    total_open_deals: deals.length,
    total_value: deals.reduce((sum, d) => sum + (d.value || 0), 0),
    deals_by_stage: dealsByStage,
    oldest_deals: deals.slice(0, 3).map((d) => ({
      contact_name: d.contact ? `${d.contact.first_name || ""} ${d.contact.last_name || ""}`.trim() : "N/D",
      value: d.value,
      days_open: Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000),
    })),
  };
}

async function getOperatorPerformance(supabase: SupabaseClient, brandId: string, period: string) {
  const { from } = getPeriodDates(period);
  const { data: ticketsData } = await supabase
    .from("tickets")
    .select("id, assigned_user_id, status, resolved_at, created_at, first_response_at, assignee:users!tickets_assigned_user_id_fkey(full_name)")
    .eq("brand_id", brandId)
    .gte("created_at", from);
  interface T { assigned_user_id: string | null; status: string; resolved_at: string | null; created_at: string; first_response_at: string | null; assignee: { full_name: string | null } | null }
  const tickets = (ticketsData || []) as T[];
  const stats: Record<string, { name: string; assigned: number; resolved: number; responseMs: number[] }> = {};
  tickets.forEach((t) => {
    if (!t.assigned_user_id) return;
    if (!stats[t.assigned_user_id]) stats[t.assigned_user_id] = { name: t.assignee?.full_name || "N/D", assigned: 0, resolved: 0, responseMs: [] };
    stats[t.assigned_user_id].assigned++;
    if (t.resolved_at) stats[t.assigned_user_id].resolved++;
    if (t.first_response_at && t.created_at) stats[t.assigned_user_id].responseMs.push(new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime());
  });
  return {
    period,
    operators: Object.entries(stats).map(([id, s]) => ({
      operator_id: id, name: s.name, assigned: s.assigned, resolved: s.resolved,
      resolution_rate: s.assigned > 0 ? Math.round((s.resolved / s.assigned) * 100) : 0,
      avg_response_hours: s.responseMs.length > 0 ? Math.round((s.responseMs.reduce((a, b) => a + b, 0) / s.responseMs.length / 3600000) * 10) / 10 : null,
    })).sort((a, b) => b.resolved - a.resolved),
  };
}

// ── MULTI-STEP TOOL LOOP ──
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
        ...(isFirstRound || allToolsUsed.length < 6 ? { tools: AGENT_TOOLS, tool_choice: "auto" } : {}),
      }),
    });

    if (!response.ok) {
      if (response.status === 429) throw { status: 429, message: "Rate limit exceeded. Please try again later." };
      if (response.status === 402) throw { status: 402, message: "Payment required. Please add credits." };
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const assistantMessage = result.choices[0].message;
    const toolCalls = assistantMessage.tool_calls || [];

    if (toolCalls.length === 0) {
      // No more tool calls — return final content
      return { content: assistantMessage.content || "", toolsUsed: allToolsUsed, totalLatencyMs: Date.now() - startTime };
    }

    // Execute tool calls
    currentMessages.push(assistantMessage);
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
      console.log(`[ai-agent] Round ${round + 1}: Executing tool ${toolName}`, JSON.stringify(toolArgs));
      allToolsUsed.push(toolName);
      const toolResult = await handleToolCall(supabase, brandId, toolName, toolArgs);
      currentMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
    }
  }

  // Max rounds reached — one final call without tools to get summary
  const finalResponse = await fetchWithTimeout(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3.1-pro-preview", messages: currentMessages }),
  });
  if (!finalResponse.ok) throw new Error(`AI gateway final error: ${finalResponse.status}`);
  const finalResult = await finalResponse.json();
  return { content: finalResult.choices[0].message.content || "", toolsUsed: allToolsUsed, totalLatencyMs: Date.now() - startTime };
}

// Fetch with timeout + retry
async function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs = 25000, retries = 1): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (attempt < retries && isAbort) { console.log(`[ai-agent] Attempt ${attempt + 1} timed out, retrying...`); continue; }
      if (isAbort) throw new Error("La richiesta AI è scaduta. Riprova con una domanda più semplice.");
      throw err;
    }
  }
  throw new Error("Unexpected: all retries exhausted");
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

    const { message, threadId, brandId, conversationHistory = [] } = await req.json();
    if (!message || !brandId) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // AUTH: Verify user belongs to brand
    const { data: crmUser } = await supabase.from("users").select("id").eq("supabase_auth_id", user.id).single();
    if (!crmUser) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: userBrandRole } = await supabase.from("user_roles").select("id").eq("user_id", crmUser.id).eq("brand_id", brandId).limit(1).maybeSingle();
    if (!userBrandRole) {
      return new Response(JSON.stringify({ error: "Access denied" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const startTime = Date.now();

    // ── Persist user message ──
    let userMessageId: string | null = null;
    if (threadId) {
      const { data: userMsg } = await supabase.from("chat_messages").insert({
        thread_id: threadId, brand_id: brandId, sender_user_id: crmUser.id,
        sender_type: "user", message_text: message, delivery_status: "sent",
      }).select("id").single();
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
      ...conversationHistory,
      { role: "user", content: message },
    ];

    // ── Run multi-step agent loop ──
    let finalContent: string | null = null;
    let toolsUsed: string[] = [];
    let errorOccurred = false;
    let latencyMs = 0;

    try {
      const result = await runAgentLoop(aiMessages, supabase, brandId, LOVABLE_API_KEY, 3);
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

    // ── FR3: Fallback anti-risposta-vuota ──
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
    console.error("AI Agent error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
      message: "Mi dispiace, si è verificato un errore. Riprova tra qualche istante.",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
