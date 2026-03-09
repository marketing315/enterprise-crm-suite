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
6. **Ad Performance**: Analisi dettagliata campagne ADV (Meta Ads, Google Ads)
7. **Dati Finanziari**: Spese, budget, ordini di vendita, prodotti, campagne marketing
8. **Raw Data Access**: Lettura diretta di righe da qualsiasi tabella del brand

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
| Spese totali | expenses | sum_amount | Importo netto spese |
| Spese lorde | expenses | sum_gross_amount | Importo lordo spese |
| Budget pianificato | budgets | sum_planned_amount | |
| Fatturato ordini | sales_orders | sum_total_amount | Totale ordini |
| Incassato ordini | sales_orders | sum_paid_amount | Importo pagato |
| Sconti ordini | sales_orders | sum_discount_amount | |
| Tasse ordini | sales_orders | sum_tax_amount | |
| Prodotti | products | count | |
| Prezzo prodotti | products | sum_default_price | |
| Campagne marketing | marketing_campaigns | count | |
| Budget campagne | marketing_campaigns | sum_planned_budget | |
| Transizioni deal | deal_transitions | count | Storico passaggi stage |
| Media spesa | expenses | avg_amount | |

## CATALOGO ADV (usa get_ad_performance)
Per QUALSIASI domanda su advertising, spesa ADV, campagne Meta/Google, CTR, CPC, CPM, ROAS, creatività, target demografico → usa SEMPRE get_ad_performance.

## RAW DATA (usa get_raw_table_data)
Per leggere righe specifiche da tabelle (es. "mostrami le ultime 10 spese", "quali prodotti abbiamo?", "regole di automazione attive").
Tabelle disponibili: expenses, budgets, sales_orders, products, marketing_campaigns, automation_rules, automation_logs, deal_stage_transitions, pipeline_stages, expense_categories, cost_centers, ad_platform_stats, ad_creative_stats, ad_demographic_stats, webhook_sources, admin_notes, admin_todos, brand_tax_settings.

## RAGGRUPPAMENTI DISPONIBILI (group_by)
- **Temporali**: date, week, month
- **Geografici**: regione, provincia, city
- **Business**: status, priority, source_name, lead_type, outcome, appointment_type, call_type
- **Finanziari**: category, cost_center, vendor_name, periodicity, payment_status
- **Marketing**: campaign_name, channel
- **Pipeline**: from_stage_label, to_stage_label, product_name

## FILTRI DISPONIBILI (filters)
status, priority, source_name, lead_type, outcome, appointment_type, call_type, assigned_user_id, created_by_user_id, contact_id, deal_id, lead_valid, category_id, cost_center_id, payment_status, campaign_id, periodicity, is_deductible, is_active, vendor_name, from_stage_label, to_stage_label, channel_id

## QUANDO USARE QUALE TOOL
- **dynamic_analytics_query**: per conteggi, somme, medie, raggruppamenti, confronti temporali → dati AGGREGATI
- **get_raw_table_data**: per vedere righe specifiche, dettagli, liste → dati GREZZI
- **get_ad_performance**: per tutto ciò che riguarda ADV/advertising
- **search_contacts / get_contact_timeline**: per cercare e analizzare contatti specifici
- **get_pipeline_status / get_operator_performance**: per snapshot rapidi

## REGOLE DI RISPOSTA
- Rispondi SEMPRE in italiano
- Usa dati concreti con numeri E percentuali
- Per domande geografiche usa group_by=regione o provincia
- Per periodi custom parsa le date in formato ISO
- Se dati insufficienti, spiega cosa manca e suggerisci domande alternative
- Formatta con markdown: tabelle, liste, bold, emoji (📈📉⚠️✅💼🎫🗺️💰)
- Concludi con 1-2 suggerimenti actionable
- MAI inventare dati: se il tool ritorna vuoto, dillo
- Per analisi complesse, usa più tool calls in sequenza
- Per domande su ADV/advertising, usa SEMPRE get_ad_performance

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
Datasets: leads, contacts, deals, tickets, appointments, calls, expenses, budgets, sales_orders, products, marketing_campaigns, deal_transitions.
Metriche: count, count_distinct_contacts, sum_value, avg_value, sum_lead_cost, sum_amount, avg_amount, sum_planned_amount, sum_total_amount, sum_paid_amount, sum_default_price, sum_planned_budget, sum_gross_amount, sum_discount_amount, sum_tax_amount.
Group by: date, week, month, regione, provincia, city, status, priority, source_name, lead_type, outcome, appointment_type, call_type, category, cost_center, vendor_name, periodicity, payment_status, campaign_name, product_name, from_stage_label, to_stage_label, channel.
Filtri: status, priority, source_name, lead_type, outcome, appointment_type, call_type, assigned_user_id, lead_valid, category_id, cost_center_id, payment_status, campaign_id, periodicity, is_deductible, is_active, vendor_name, from_stage_label, to_stage_label, channel_id.
USA QUESTO TOOL per qualsiasi domanda su numeri, KPI, analisi, breakdown, confronti. È il tool principale per dati AGGREGATI.`,
      parameters: {
        type: "object",
        properties: {
          dataset: {
            type: "string",
            enum: ["leads", "contacts", "deals", "tickets", "appointments", "calls", "expenses", "budgets", "sales_orders", "products", "marketing_campaigns", "deal_transitions"],
            description: "Dataset da interrogare",
          },
          metric: {
            type: "string",
            enum: ["count", "count_distinct_contacts", "sum_value", "avg_value", "sum_lead_cost", "sum_amount", "avg_amount", "sum_planned_amount", "sum_total_amount", "sum_paid_amount", "sum_default_price", "sum_planned_budget", "sum_gross_amount", "sum_discount_amount", "sum_tax_amount"],
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
            enum: ["date", "week", "month", "regione", "provincia", "city", "status", "priority", "source_name", "lead_type", "outcome", "appointment_type", "call_type", "category", "cost_center", "vendor_name", "periodicity", "payment_status", "campaign_name", "product_name", "from_stage_label", "to_stage_label", "channel"],
            description: "Campo per raggruppare i risultati. Usa 'regione' per breakdown geografico, 'category' per spese per categoria, 'cost_center' per centro di costo, ecc.",
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
  {
    type: "function",
    function: {
      name: "get_raw_table_data",
      description: `Legge righe grezze da una tabella del brand. Usa per vedere dettagli specifici, liste, o dati non aggregati. Es: "mostrami le ultime 10 spese", "quali prodotti abbiamo?", "regole di automazione attive". Limitato a 50 righe. NON usare per conteggi o somme (usa dynamic_analytics_query per quelli).`,
      parameters: {
        type: "object",
        properties: {
          table: {
            type: "string",
            enum: ["expenses", "budgets", "sales_orders", "products", "marketing_campaigns", "automation_rules", "automation_logs", "deal_stage_transitions", "pipeline_stages", "expense_categories", "cost_centers", "ad_platform_stats", "ad_creative_stats", "ad_demographic_stats", "webhook_sources", "admin_notes", "admin_todos", "brand_tax_settings", "deals", "tickets", "appointments", "call_logs", "contacts", "lead_events"],
            description: "Tabella da leggere",
          },
          columns: {
            type: "string",
            description: "Colonne da selezionare, separate da virgola. Se omesso, seleziona tutte le colonne principali. Es: 'id,name,amount,expense_date'",
          },
          filters: {
            type: "object",
            description: "Filtri chiave-valore. Es: {\"status\": \"active\", \"is_active\": true}",
          },
          order_by: {
            type: "string",
            description: "Colonna per ordinamento. Es: 'created_at' o 'amount'. Default: created_at",
          },
          ascending: {
            type: "boolean",
            description: "Se true ordina crescente, se false decrescente. Default: false (più recenti prima)",
          },
          limit: {
            type: "integer",
            description: "Numero massimo di righe (default: 20, max: 50)",
          },
        },
        required: ["table"],
      },
    },
  },
];

// ── HELPERS ──
const SYSTEM_BRAND_ID = "00000000-0000-0000-0000-000000000000";
function isAllBrandsMode(brandId: string): boolean {
  return brandId === SYSTEM_BRAND_ID;
}

/** Apply brand filter: skip filter for all-brands mode, otherwise eq brand_id */
function applyBrandFilter(query: any, brandId: string): any {
  if (isAllBrandsMode(brandId)) return query;
  return query.eq("brand_id", brandId);
}

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

type AgentHistoryMessage = { role: "user" | "assistant"; content: string };

const MAX_CONTEXT_MESSAGES = 12;
const MAX_CONTEXT_TOTAL_CHARS = 12000;
const MAX_CONTEXT_MESSAGE_CHARS = 1200;
const THREAD_HISTORY_FETCH_LIMIT = 30;

function compactHistory(messages: AgentHistoryMessage[]): AgentHistoryMessage[] {
  const selected: AgentHistoryMessage[] = [];
  let totalChars = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg.content) continue;
    if (selected.length >= MAX_CONTEXT_MESSAGES) break;

    if (totalChars + msg.content.length > MAX_CONTEXT_TOTAL_CHARS && selected.length > 0) break;

    selected.push({
      role: msg.role,
      content: msg.content.slice(0, MAX_CONTEXT_MESSAGE_CHARS),
    });
    totalChars += Math.min(msg.content.length, MAX_CONTEXT_MESSAGE_CHARS);
  }

  return selected.reverse();
}

function sanitizeRequestedHistory(history: unknown): AgentHistoryMessage[] {
  if (!Array.isArray(history)) return [];

  const normalized = history
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role = (item as { role?: string }).role;
      const content = (item as { content?: unknown }).content;

      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;

      const clean = content.trim();
      if (!clean) return null;

      return { role, content: clean } as AgentHistoryMessage;
    })
    .filter((m): m is AgentHistoryMessage => m !== null);

  return compactHistory(normalized);
}

async function getThreadHistory(
  supabase: SupabaseClient,
  threadId: string
): Promise<AgentHistoryMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("sender_type, message_text, created_at")
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(THREAD_HISTORY_FETCH_LIMIT);

  if (error) {
    console.warn("[ai-agent] Failed to load thread history, fallback to request history:", error.message);
    return [];
  }

  const normalized = (data || [])
    .reverse()
    .map((row: { sender_type: string; message_text: string }) => {
      if (row.sender_type !== "user" && row.sender_type !== "ai") return null;
      const clean = (row.message_text || "").trim();
      if (!clean) return null;

      return {
        role: row.sender_type === "ai" ? "assistant" : "user",
        content: clean,
      } as AgentHistoryMessage;
    })
    .filter((m): m is AgentHistoryMessage => m !== null);

  return compactHistory(normalized);
}

async function resolveConversationHistory(
  supabase: SupabaseClient,
  threadId: string | undefined,
  requestedHistory: unknown
): Promise<AgentHistoryMessage[]> {
  if (!threadId) return sanitizeRequestedHistory(requestedHistory);

  const dbHistory = await getThreadHistory(supabase, threadId);
  if (dbHistory.length > 0) return dbHistory;

  return sanitizeRequestedHistory(requestedHistory);
}

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
    case "get_ad_performance":
      return await getAdPerformance(supabase, brandId, args);
    case "get_raw_table_data":
      return await getRawTableData(supabase, brandId, args);
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
  let q = supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone, city, cap, province, company_name, lead_type, status, created_at");
  q = applyBrandFilter(q, brandId);
  q = q.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%,company_name.ilike.%${query}%`)
    .limit(limit);
  const { data } = await q;
  return { contacts: data || [], count: (data || []).length };
}

async function getContactTimeline(supabase: SupabaseClient, brandId: string, contactId: string) {
  const buildQ = (table: string, select: string, contactField: string, orderField: string) => {
    let q = supabase.from(table).select(select);
    q = applyBrandFilter(q, brandId);
    return q.eq(contactField, contactId).order(orderField, { ascending: false }).limit(10);
  };
  const [leads, deals, tickets, appointments, calls] = await Promise.all([
    buildQ("lead_events", "id, source_name, lead_type, received_at", "contact_id", "received_at"),
    buildQ("deals", "id, value, status, created_at", "contact_id", "created_at"),
    buildQ("tickets", "id, status, priority, created_at", "contact_id", "created_at"),
    buildQ("appointments", "id, status, scheduled_at, appointment_type", "contact_id", "scheduled_at"),
    buildQ("call_logs", "id, status, outcome, started_at, duration_seconds", "contact_id", "started_at"),
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
  let dealsQ = supabase.from("deals").select("id, value, status, current_stage_id, created_at, contact:contacts(first_name, last_name)");
  dealsQ = applyBrandFilter(dealsQ, brandId);
  dealsQ = dealsQ.eq("status", "open").order("created_at", { ascending: true });
  let stagesQ = supabase.from("pipeline_stages").select("id, name, sort_order");
  stagesQ = applyBrandFilter(stagesQ, brandId);
  stagesQ = stagesQ.order("sort_order");
  const [dealsResult, stagesResult] = await Promise.all([dealsQ, stagesQ]);
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
  let ticketQ = supabase
    .from("tickets")
    .select("id, assigned_user_id, status, resolved_at, created_at, first_response_at, assignee:users!tickets_assigned_user_id_fkey(full_name)");
  ticketQ = applyBrandFilter(ticketQ, brandId);
  ticketQ = ticketQ.gte("created_at", from);
  const { data: ticketsData } = await ticketQ;
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

// Ad Performance tool handler
async function getAdPerformance(supabase: SupabaseClient, brandId: string, args: Record<string, unknown>) {
  try {
    const now = new Date();
    const dateFrom = (args.date_from as string) || new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
    const dateTo = (args.date_to as string) || now.toISOString().split('T')[0];
    const platform = (args.platform as string) || null;
    const includeCreatives = (args.include_creatives as boolean) || false;
    const includeDemographics = (args.include_demographics as boolean) || false;

    // 1. Campaign-level aggregated stats
    let campaignQuery = supabase
      .from("ad_platform_stats")
      .select("external_campaign_id, external_campaign_name, platform, spend, impressions, clicks, reach, frequency, conversions, conversions_value, stat_date, brand_id");
    campaignQuery = applyBrandFilter(campaignQuery, brandId);
    campaignQuery = campaignQuery
      .gte("stat_date", dateFrom)
      .lte("stat_date", dateTo);
    if (platform) campaignQuery = campaignQuery.eq("platform", platform);

    const { data: campaignData, error: campaignError } = await campaignQuery;
    if (campaignError) {
      console.error("[get_ad_performance] Campaign query error:", campaignError.message);
      return { error: campaignError.message };
    }

    // Aggregate by campaign
    interface CampaignAgg { name: string; platform: string; spend: number; impressions: number; clicks: number; reach: number; conversions: number; conversions_value: number; days: Set<string> }
    const campaignMap: Record<string, CampaignAgg> = {};
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0, totalConversions = 0, totalConversionsValue = 0;

    for (const row of (campaignData || [])) {
      const key = `${row.external_campaign_id}_${row.platform}`;
      if (!campaignMap[key]) {
        campaignMap[key] = { name: row.external_campaign_name || row.external_campaign_id, platform: row.platform, spend: 0, impressions: 0, clicks: 0, reach: 0, conversions: 0, conversions_value: 0, days: new Set() };
      }
      const c = campaignMap[key];
      c.spend += row.spend || 0;
      c.impressions += row.impressions || 0;
      c.clicks += row.clicks || 0;
      c.reach += row.reach || 0;
      c.conversions += row.conversions || 0;
      c.conversions_value += row.conversions_value || 0;
      c.days.add(row.stat_date);
      totalSpend += row.spend || 0;
      totalImpressions += row.impressions || 0;
      totalClicks += row.clicks || 0;
      totalReach += row.reach || 0;
      totalConversions += row.conversions || 0;
      totalConversionsValue += row.conversions_value || 0;
    }

    const campaigns = Object.entries(campaignMap).map(([id, c]) => ({
      campaign_id: id.split('_')[0],
      campaign_name: c.name,
      platform: c.platform,
      spend: Math.round(c.spend * 100) / 100,
      impressions: c.impressions,
      clicks: c.clicks,
      reach: c.reach,
      conversions: c.conversions,
      conversions_value: Math.round(c.conversions_value * 100) / 100,
      ctr: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
      cpc: c.clicks > 0 ? Math.round((c.spend / c.clicks) * 100) / 100 : 0,
      cpm: c.impressions > 0 ? Math.round((c.spend / c.impressions * 1000) * 100) / 100 : 0,
      days_active: c.days.size,
    })).sort((a, b) => b.spend - a.spend);

    const result: Record<string, unknown> = {
      period: { from: dateFrom, to: dateTo },
      summary: {
        total_spend: Math.round(totalSpend * 100) / 100,
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        total_reach: totalReach,
        total_conversions: totalConversions,
        total_conversions_value: Math.round(totalConversionsValue * 100) / 100,
        avg_ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
        avg_cpc: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0,
        avg_cpm: totalImpressions > 0 ? Math.round((totalSpend / totalImpressions * 1000) * 100) / 100 : 0,
        campaigns_count: campaigns.length,
      },
      campaigns,
    };

    // 2. Creative-level breakdown (optional)
    if (includeCreatives) {
      let creativeQuery = supabase
        .from("ad_creative_stats")
        .select("external_ad_id, external_ad_name, external_campaign_id, external_campaign_name, platform, spend, impressions, clicks, reach, thumbnail_url, stat_date");
      creativeQuery = applyBrandFilter(creativeQuery, brandId);
      creativeQuery = creativeQuery
        .gte("stat_date", dateFrom)
        .lte("stat_date", dateTo);
      if (platform) creativeQuery = creativeQuery.eq("platform", platform);

      const { data: creativeData } = await creativeQuery;
      interface CreativeAgg { name: string; campaign: string; platform: string; spend: number; impressions: number; clicks: number; reach: number; thumbnail: string | null }
      const creativeMap: Record<string, CreativeAgg> = {};
      for (const row of (creativeData || [])) {
        const key = row.external_ad_id;
        if (!creativeMap[key]) {
          creativeMap[key] = { name: row.external_ad_name || row.external_ad_id, campaign: row.external_campaign_name || '', platform: row.platform, spend: 0, impressions: 0, clicks: 0, reach: 0, thumbnail: row.thumbnail_url };
        }
        creativeMap[key].spend += row.spend || 0;
        creativeMap[key].impressions += row.impressions || 0;
        creativeMap[key].clicks += row.clicks || 0;
        creativeMap[key].reach += row.reach || 0;
      }
      result.creatives = Object.entries(creativeMap).map(([id, c]) => ({
        ad_id: id, ad_name: c.name, campaign: c.campaign, platform: c.platform,
        spend: Math.round(c.spend * 100) / 100, impressions: c.impressions, clicks: c.clicks, reach: c.reach,
        ctr: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
        cpc: c.clicks > 0 ? Math.round((c.spend / c.clicks) * 100) / 100 : 0,
      })).sort((a, b) => b.spend - a.spend).slice(0, 20);
    }

    // 3. Demographic breakdown (optional)
    if (includeDemographics) {
      let demoQuery = supabase
        .from("ad_demographic_stats")
        .select("age_range, gender, spend, impressions, clicks, reach, stat_date");
      demoQuery = applyBrandFilter(demoQuery, brandId);
      demoQuery = demoQuery
        .gte("stat_date", dateFrom)
        .lte("stat_date", dateTo);
      if (platform) demoQuery = demoQuery.eq("platform", platform);

      const { data: demoData } = await demoQuery;
      interface DemoAgg { spend: number; impressions: number; clicks: number; reach: number }
      const demoMap: Record<string, DemoAgg> = {};
      for (const row of (demoData || [])) {
        const key = `${row.age_range}|${row.gender}`;
        if (!demoMap[key]) demoMap[key] = { spend: 0, impressions: 0, clicks: 0, reach: 0 };
        demoMap[key].spend += row.spend || 0;
        demoMap[key].impressions += row.impressions || 0;
        demoMap[key].clicks += row.clicks || 0;
        demoMap[key].reach += row.reach || 0;
      }
      result.demographics = Object.entries(demoMap).map(([key, d]) => {
        const [age, gender] = key.split('|');
        return {
          age_range: age, gender,
          spend: Math.round(d.spend * 100) / 100, impressions: d.impressions, clicks: d.clicks, reach: d.reach,
          ctr: d.impressions > 0 ? Math.round((d.clicks / d.impressions) * 10000) / 100 : 0,
          cpc: d.clicks > 0 ? Math.round((d.spend / d.clicks) * 100) / 100 : 0,
        };
      }).sort((a, b) => b.spend - a.spend);
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[get_ad_performance] Exception:", msg);
    return { error: msg };
  }
}


// Raw table data reader
const RAW_TABLE_WHITELIST: Record<string, { defaultColumns: string; defaultOrder: string }> = {
  expenses: { defaultColumns: "id,amount,gross_amount,expense_date,vendor_name,description,periodicity,is_deductible,created_at", defaultOrder: "expense_date" },
  budgets: { defaultColumns: "id,category_id,period_month,planned_amount,notes,created_at", defaultOrder: "period_month" },
  sales_orders: { defaultColumns: "id,order_number,status,subtotal,discount_amount,tax_amount,total_amount,paid_amount,notes,created_at,confirmed_at,paid_at", defaultOrder: "created_at" },
  products: { defaultColumns: "id,name,description,sku,default_price,vat_rate,is_active,created_at", defaultOrder: "created_at" },
  marketing_campaigns: { defaultColumns: "id,name,external_id,start_date,end_date,planned_budget,status,created_at", defaultOrder: "created_at" },
  automation_rules: { defaultColumns: "id,name,description,trigger_type,action_type,is_active,execution_count,last_executed_at,created_at", defaultOrder: "created_at" },
  automation_logs: { defaultColumns: "id,action_taken,entity_type,entity_id,status,error_message,duration_ms,created_at", defaultOrder: "created_at" },
  deal_stage_transitions: { defaultColumns: "id,deal_id,from_stage_label,to_stage_label,actor_display_name,occurred_at", defaultOrder: "occurred_at" },
  pipeline_stages: { defaultColumns: "id,name,sort_order,is_active,created_at", defaultOrder: "sort_order" },
  expense_categories: { defaultColumns: "id,name,category_type,is_deductible,is_active,created_at", defaultOrder: "name" },
  cost_centers: { defaultColumns: "id,name,code,is_active,created_at", defaultOrder: "name" },
  ad_platform_stats: { defaultColumns: "id,external_campaign_name,platform,spend,impressions,clicks,reach,conversions,stat_date", defaultOrder: "stat_date" },
  ad_creative_stats: { defaultColumns: "id,external_ad_name,external_campaign_name,platform,spend,impressions,clicks,stat_date", defaultOrder: "stat_date" },
  ad_demographic_stats: { defaultColumns: "id,age_range,gender,platform,spend,impressions,clicks,reach,stat_date", defaultOrder: "stat_date" },
  webhook_sources: { defaultColumns: "id,name,description,is_active,rate_limit_per_min,created_at", defaultOrder: "created_at" },
  admin_notes: { defaultColumns: "id,type,ref_table,ref_id,content,created_at", defaultOrder: "created_at" },
  admin_todos: { defaultColumns: "id,title,completed,display_order,created_at", defaultOrder: "display_order" },
  brand_tax_settings: { defaultColumns: "id,corporate_tax_rate,regional_tax_rate,vat_rate_default,fiscal_year_start,notes,updated_at", defaultOrder: "updated_at" },
  deals: { defaultColumns: "id,contact_id,current_stage_id,status,value,notes,assigned_user_id,created_at,closed_at", defaultOrder: "created_at" },
  tickets: { defaultColumns: "id,contact_id,status,priority,subject,assigned_user_id,created_at,resolved_at", defaultOrder: "created_at" },
  appointments: { defaultColumns: "id,contact_id,scheduled_at,status,appointment_type,address,city,notes,assigned_sales_user_id", defaultOrder: "scheduled_at" },
  call_logs: { defaultColumns: "id,contact_id,phone_number,call_type,status,outcome,duration_seconds,started_at,notes", defaultOrder: "started_at" },
  contacts: { defaultColumns: "id,first_name,last_name,email,city,cap,province,company_name,status,lead_type,created_at", defaultOrder: "created_at" },
  lead_events: { defaultColumns: "id,contact_id,source,source_name,lead_type,ai_priority,received_at", defaultOrder: "received_at" },
};

async function getRawTableData(supabase: SupabaseClient, brandId: string, args: Record<string, unknown>) {
  try {
    const tableName = args.table as string;
    const config = RAW_TABLE_WHITELIST[tableName];
    if (!config) return { error: `Tabella non consentita: ${tableName}` };

    const columns = (args.columns as string) || config.defaultColumns;
    const orderBy = (args.order_by as string) || config.defaultOrder;
    const ascending = (args.ascending as boolean) ?? false;
    const limit = Math.min((args.limit as number) || 20, 50);

    let query = supabase.from(tableName).select(columns);
    query = applyBrandFilter(query, brandId);

    // Apply filters
    const filters = (args.filters as Record<string, unknown>) || {};
    for (const [key, val] of Object.entries(filters)) {
      if (Array.isArray(val)) {
        query = query.in(key, val);
      } else if (typeof val === 'boolean') {
        query = query.eq(key, val);
      } else {
        query = query.eq(key, String(val));
      }
    }

    query = query.order(orderBy, { ascending }).limit(limit);
    const { data, error } = await query;

    if (error) {
      console.error("[get_raw_table_data] Error:", error.message);
      return { error: error.message };
    }

    return { table: tableName, rows: data || [], row_count: (data || []).length, columns: columns, order_by: orderBy };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[get_raw_table_data] Exception:", msg);
    return { error: msg };
  }
}


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
    if (!assistantMessage) {
      throw new Error("AI response missing message payload");
    }
    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];

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
    body: JSON.stringify({ model: "google/gemini-3.1-pro-preview", messages: currentMessages, max_tokens: 1200 }),
  });
  if (!finalResponse.ok) throw new Error(`AI gateway final error: ${finalResponse.status}`);
  const finalResult = await finalResponse.json();
  const finalMessage = finalResult?.choices?.[0]?.message?.content || "";
  return { content: finalMessage, toolsUsed: allToolsUsed, totalLatencyMs: Date.now() - startTime };
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

    const { message, threadId, brandId, conversationHistory: requestConversationHistory = [] } = await req.json();
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

    const conversationHistoryForAI = await resolveConversationHistory(
      supabase,
      threadId,
      requestConversationHistory
    );
    console.log(`[ai-agent] Context history selected: ${conversationHistoryForAI.length} messages`);

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
      ...conversationHistoryForAI,
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
