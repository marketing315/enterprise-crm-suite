import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Executive Agent System Prompt
const EXECUTIVE_AGENT_PROMPT = `Sei un assistente AI executive per il CRM. Hai accesso completo ai dati della piattaforma.

CAPACITÀ:
1. Analisi KPI in tempo reale (lead, deal, ticket, appuntamenti)
2. Report performance operatori e team
3. Trend analysis e confronti temporali
4. Ricerca contatti e timeline complete
5. Insight strategici basati sui dati
6. Raccomandazioni actionable per il management

STILE:
- Rispondi sempre in italiano
- Usa dati concreti con numeri e percentuali
- Evidenzia trend positivi/negativi
- Suggerisci azioni concrete
- Usa emoji per evidenziare metriche chiave (📈📉⚠️✅💼🎫)
- Formatta con markdown per chiarezza (tabelle, liste, bold)

LIMITI:
- Non inventare dati non presenti
- Se non hai dati sufficienti, chiedi chiarimenti
- Per operazioni di modifica, spiega cosa faresti ma non eseguire direttamente

COMPORTAMENTO:
- Sii proattivo nel suggerire analisi correlate
- Quando mostri numeri, includi sempre il trend se possibile
- Concludi con suggerimenti actionable quando rilevante`;

// Tool definitions for Gemini function calling
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_dashboard_kpis",
      description:
        "Ottiene i KPI principali della dashboard: lead nel periodo, deal aperti, ticket attivi, appuntamenti. Usa questo tool quando l'utente chiede 'come sta andando', 'riepilogo', 'KPI'.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["today", "week", "month"],
            description: "Periodo di riferimento per i KPI",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_status",
      description:
        "Ottiene lo stato della pipeline: deal per stage, valore totale, deal più vecchi. Usa per domande su 'pipeline', 'deal', 'vendite', 'trattative'.",
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
      name: "get_ticket_overview",
      description:
        "Overview ticket: aperti per priorità, backlog, SLA breach, distribuzione. Usa per domande su 'ticket', 'assistenza', 'supporto'.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["today", "7d", "30d"],
            description: "Periodo di riferimento",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_operator_performance",
      description:
        "Performance operatori: ticket gestiti, tempi medi, risoluzione. Usa per 'performance team', 'operatori', 'chi lavora meglio'.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["today", "7d", "30d"],
            description: "Periodo di riferimento",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_appointment_summary",
      description:
        "Riepilogo appuntamenti: schedulati, completati, cancellati, esiti. Usa per 'appuntamenti', 'visite', 'agenda'.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["today", "week", "month"],
            description: "Periodo di riferimento",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_contacts",
      description:
        "Cerca contatti per nome, email o telefono. Usa quando l'utente vuole trovare un cliente specifico.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Termine di ricerca (nome, email o telefono)",
          },
          limit: {
            type: "integer",
            description: "Numero massimo di risultati",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_contact_timeline",
      description:
        "Timeline completa di un contatto: lead, deal, ticket, appuntamenti. Usa dopo aver trovato un contatto con search_contacts.",
      parameters: {
        type: "object",
        properties: {
          contact_id: {
            type: "string",
            description: "UUID del contatto",
          },
        },
        required: ["contact_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lead_analytics",
      description:
        "Analisi lead: fonte, tipo, conversione. Usa per 'da dove arrivano i lead', 'analisi acquisizione', 'fonti'.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["today", "7d", "30d"],
            description: "Periodo di riferimento",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trend_comparison",
      description:
        "Confronto tra due periodi (settimana vs settimana, mese vs mese). Usa per 'confronta', 'rispetto a', 'trend', 'WoW', 'MoM'.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: ["leads", "tickets", "deals", "appointments"],
            description: "Metrica da confrontare",
          },
          comparison: {
            type: "string",
            enum: ["wow", "mom"],
            description: "Tipo di confronto: wow=week over week, mom=month over month",
          },
        },
        required: ["metric", "comparison"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_decisions_summary",
      description:
        "Riepilogo performance AI: decisioni prese, override rate, accuracy. Usa per 'performance AI', 'come sta andando l'AI'.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["today", "7d", "30d"],
            description: "Periodo di riferimento",
          },
        },
        required: ["period"],
      },
    },
  },
];

// Helper functions for date ranges
function getPeriodDates(period: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();

  switch (period) {
    case "today": {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      return { from: startOfDay.toISOString(), to };
    }
    case "week":
    case "7d": {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { from: weekAgo.toISOString(), to };
    }
    case "month":
    case "30d": {
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return { from: monthAgo.toISOString(), to };
    }
    default: {
      const defaultStart = new Date(now);
      defaultStart.setDate(defaultStart.getDate() - 7);
      return { from: defaultStart.toISOString(), to };
    }
  }
}

function getPreviousPeriodDates(
  comparison: string
): { current: { from: string; to: string }; previous: { from: string; to: string } } {
  const now = new Date();
  const to = now.toISOString();

  if (comparison === "wow") {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    return {
      current: { from: weekAgo.toISOString(), to },
      previous: { from: twoWeeksAgo.toISOString(), to: weekAgo.toISOString() },
    };
  } else {
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);
    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    return {
      current: { from: monthAgo.toISOString(), to },
      previous: { from: twoMonthsAgo.toISOString(), to: monthAgo.toISOString() },
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// Tool handler implementations
async function handleToolCall(
  supabase: SupabaseClient,
  brandId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "get_dashboard_kpis":
      return await getDashboardKpis(supabase, brandId, args.period as string);
    case "get_pipeline_status":
      return await getPipelineStatus(supabase, brandId);
    case "get_ticket_overview":
      return await getTicketOverview(supabase, brandId, args.period as string);
    case "get_operator_performance":
      return await getOperatorPerformance(supabase, brandId, args.period as string);
    case "get_appointment_summary":
      return await getAppointmentSummary(supabase, brandId, args.period as string);
    case "search_contacts":
      return await searchContacts(supabase, brandId, args.query as string, (args.limit as number) || 5);
    case "get_contact_timeline":
      return await getContactTimeline(supabase, brandId, args.contact_id as string);
    case "get_lead_analytics":
      return await getLeadAnalytics(supabase, brandId, args.period as string);
    case "get_trend_comparison":
      return await getTrendComparison(supabase, brandId, args.metric as string, args.comparison as string);
    case "get_ai_decisions_summary":
      return await getAIDecisionsSummary(supabase, brandId, args.period as string);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

async function getDashboardKpis(supabase: SupabaseClient, brandId: string, period: string) {
  const { from, to } = getPeriodDates(period);

  const [leadsResult, dealsResult, ticketsResult, appointmentsResult] = await Promise.all([
    supabase.from("lead_events").select("id, contact_id").eq("brand_id", brandId).gte("received_at", from).lte("received_at", to),
    supabase.from("deals").select("id, value, status").eq("brand_id", brandId).eq("status", "open"),
    supabase.from("tickets").select("id, priority, status").eq("brand_id", brandId).in("status", ["open", "in_progress"]),
    supabase.from("appointments").select("id, status").eq("brand_id", brandId).gte("scheduled_at", from).lte("scheduled_at", to),
  ]);

  interface LeadEvent { id: string; contact_id: string }
  interface Deal { id: string; value: number | null; status: string }
  interface Ticket { id: string; priority: number; status: string }
  interface Appointment { id: string; status: string }

  const leads = (leadsResult.data || []) as LeadEvent[];
  const deals = (dealsResult.data || []) as Deal[];
  const tickets = (ticketsResult.data || []) as Ticket[];
  const appointments = (appointmentsResult.data || []) as Appointment[];

  const uniqueContacts = new Set(leads.map((e) => e.contact_id));
  const totalDealValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);

  return {
    period,
    leads_count: leads.length,
    unique_contacts: uniqueContacts.size,
    open_deals: deals.length,
    total_deal_value: totalDealValue,
    open_tickets: tickets.length,
    high_priority_tickets: tickets.filter((t) => t.priority <= 2).length,
    appointments: appointments.length,
    completed_appointments: appointments.filter((a) => a.status === "completed").length,
  };
}

async function getPipelineStatus(supabase: SupabaseClient, brandId: string) {
  const [dealsResult, stagesResult] = await Promise.all([
    supabase
      .from("deals")
      .select("id, value, status, current_stage_id, created_at, contact:contacts(first_name, last_name)")
      .eq("brand_id", brandId)
      .eq("status", "open")
      .order("created_at", { ascending: true }),
    supabase.from("pipeline_stages").select("id, name, sort_order").eq("brand_id", brandId).order("sort_order"),
  ]);

  interface Deal {
    id: string;
    value: number | null;
    status: string;
    current_stage_id: string | null;
    created_at: string;
    contact: { first_name: string | null; last_name: string | null } | null;
  }
  interface Stage { id: string; name: string; sort_order: number }

  const deals = (dealsResult.data || []) as Deal[];
  const stages = (stagesResult.data || []) as Stage[];

  const dealsByStage = stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.current_stage_id === stage.id);
    return {
      stage_name: stage.name,
      count: stageDeals.length,
      value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
    };
  });

  const oldestDeals = deals.slice(0, 3).map((d) => ({
    contact_name: d.contact ? `${d.contact.first_name || ""} ${d.contact.last_name || ""}`.trim() : "N/D",
    value: d.value,
    days_open: Math.floor((Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24)),
  }));

  return {
    total_open_deals: deals.length,
    total_value: deals.reduce((sum, d) => sum + (d.value || 0), 0),
    deals_by_stage: dealsByStage,
    oldest_deals: oldestDeals,
  };
}

async function getTicketOverview(supabase: SupabaseClient, brandId: string, period: string) {
  const { from } = getPeriodDates(period);

  const [activeTickets, recentTickets] = await Promise.all([
    supabase.from("tickets").select("id, priority, status, sla_breached_at, created_at").eq("brand_id", brandId).in("status", ["open", "in_progress"]),
    supabase.from("tickets").select("id, status, resolved_at").eq("brand_id", brandId).gte("created_at", from),
  ]);

  interface ActiveTicket { id: string; priority: number; status: string; sla_breached_at: string | null; created_at: string }
  interface RecentTicket { id: string; status: string; resolved_at: string | null }

  const tickets = (activeTickets.data || []) as ActiveTicket[];
  const recent = (recentTickets.data || []) as RecentTicket[];

  const byPriority: Record<string, number> = {};
  tickets.forEach((t) => {
    byPriority[`P${t.priority}`] = (byPriority[`P${t.priority}`] || 0) + 1;
  });

  return {
    period,
    total_open: tickets.length,
    by_priority: byPriority,
    sla_breached: tickets.filter((t) => t.sla_breached_at).length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    created_in_period: recent.length,
    resolved_in_period: recent.filter((t) => t.resolved_at).length,
  };
}

async function getOperatorPerformance(supabase: SupabaseClient, brandId: string, period: string) {
  const { from } = getPeriodDates(period);

  const { data: ticketsData } = await supabase
    .from("tickets")
    .select("id, assigned_user_id, status, resolved_at, created_at, first_response_at, assignee:users!tickets_assigned_user_id_fkey(full_name)")
    .eq("brand_id", brandId)
    .gte("created_at", from);

  interface TicketWithAssignee {
    id: string;
    assigned_user_id: string | null;
    status: string;
    resolved_at: string | null;
    created_at: string;
    first_response_at: string | null;
    assignee: { full_name: string | null } | null;
  }

  const tickets = (ticketsData || []) as TicketWithAssignee[];

  const operatorStats: Record<string, { name: string; assigned: number; resolved: number; avgResponseMs: number[] }> = {};

  tickets.forEach((t) => {
    if (!t.assigned_user_id) return;

    if (!operatorStats[t.assigned_user_id]) {
      operatorStats[t.assigned_user_id] = {
        name: t.assignee?.full_name || "N/D",
        assigned: 0,
        resolved: 0,
        avgResponseMs: [],
      };
    }

    operatorStats[t.assigned_user_id].assigned++;
    if (t.resolved_at) operatorStats[t.assigned_user_id].resolved++;
    if (t.first_response_at && t.created_at) {
      const responseTime = new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime();
      operatorStats[t.assigned_user_id].avgResponseMs.push(responseTime);
    }
  });

  const operators = Object.entries(operatorStats).map(([id, stats]) => ({
    operator_id: id,
    name: stats.name,
    tickets_assigned: stats.assigned,
    tickets_resolved: stats.resolved,
    resolution_rate: stats.assigned > 0 ? Math.round((stats.resolved / stats.assigned) * 100) : 0,
    avg_response_hours:
      stats.avgResponseMs.length > 0
        ? Math.round((stats.avgResponseMs.reduce((a, b) => a + b, 0) / stats.avgResponseMs.length / 1000 / 60 / 60) * 10) / 10
        : null,
  }));

  return {
    period,
    operators: operators.sort((a, b) => b.tickets_resolved - a.tickets_resolved),
    total_operators: operators.length,
  };
}

async function getAppointmentSummary(supabase: SupabaseClient, brandId: string, period: string) {
  const { from, to } = getPeriodDates(period);

  const { data: appointmentsData } = await supabase
    .from("appointments")
    .select("id, status, appointment_type, scheduled_at")
    .eq("brand_id", brandId)
    .gte("scheduled_at", from)
    .lte("scheduled_at", to);

  interface AppointmentData { id: string; status: string; appointment_type: string | null; scheduled_at: string }

  const appts = (appointmentsData || []) as AppointmentData[];

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};

  appts.forEach((a) => {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    if (a.appointment_type) {
      byType[a.appointment_type] = (byType[a.appointment_type] || 0) + 1;
    }
  });

  return {
    period,
    total: appts.length,
    by_status: byStatus,
    by_type: byType,
    completion_rate: appts.length > 0 ? Math.round(((byStatus["completed"] || 0) / appts.length) * 100) : 0,
  };
}

async function searchContacts(supabase: SupabaseClient, brandId: string, query: string, limit: number) {
  const searchTerm = `%${query}%`;

  const { data: contactsData } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, city, status, created_at")
    .eq("brand_id", brandId)
    .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm}`)
    .limit(limit);

  interface ContactData {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    city: string | null;
    status: string;
    created_at: string;
  }

  const contacts = (contactsData || []) as ContactData[];

  return {
    query,
    results: contacts.map((c) => ({
      id: c.id,
      name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || "N/D",
      email: c.email,
      city: c.city,
      status: c.status,
      created_at: c.created_at,
    })),
    count: contacts.length,
  };
}

async function getContactTimeline(supabase: SupabaseClient, brandId: string, contactId: string) {
  const [contactResult, leadsResult, dealsResult, ticketsResult, appointmentsResult] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", contactId).eq("brand_id", brandId).single(),
    supabase.from("lead_events").select("id, source, lead_type, received_at, ai_priority").eq("contact_id", contactId).order("received_at", { ascending: false }).limit(10),
    supabase.from("deals").select("id, status, value, current_stage_id, created_at, stage:pipeline_stages(name)").eq("contact_id", contactId).order("created_at", { ascending: false }),
    supabase.from("tickets").select("id, title, status, priority, created_at, resolved_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(10),
    supabase.from("appointments").select("id, status, appointment_type, scheduled_at").eq("contact_id", contactId).order("scheduled_at", { ascending: false }).limit(10),
  ]);

  if (contactResult.error) {
    return { error: "Contatto non trovato" };
  }

  interface Contact {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    city: string | null;
    status: string;
    created_at: string;
  }
  interface LeadEvent { id: string; source: string; lead_type: string | null; received_at: string; ai_priority: number | null }
  interface DealWithStage { id: string; status: string; value: number | null; current_stage_id: string | null; created_at: string; stage: { name: string } | null }
  interface TicketData { id: string; title: string; status: string; priority: number; created_at: string; resolved_at: string | null }
  interface AppointmentData { id: string; status: string; appointment_type: string | null; scheduled_at: string }

  const contact = (contactResult.data || {}) as Contact;
  const leads = (leadsResult.data || []) as LeadEvent[];
  const deals = (dealsResult.data || []) as DealWithStage[];
  const tickets = (ticketsResult.data || []) as TicketData[];
  const appointments = (appointmentsResult.data || []) as AppointmentData[];

  return {
    contact: {
      id: contact.id,
      name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
      email: contact.email,
      city: contact.city,
      status: contact.status,
      created_at: contact.created_at,
    },
    lead_events: leads.map((l) => ({
      date: l.received_at,
      source: l.source,
      type: l.lead_type,
      priority: l.ai_priority,
    })),
    deals: deals.map((d) => ({
      status: d.status,
      value: d.value,
      stage: d.stage?.name || "N/D",
      created_at: d.created_at,
    })),
    tickets: tickets.map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      created_at: t.created_at,
      resolved_at: t.resolved_at,
    })),
    appointments: appointments.map((a) => ({
      type: a.appointment_type,
      status: a.status,
      scheduled_at: a.scheduled_at,
    })),
  };
}

async function getLeadAnalytics(supabase: SupabaseClient, brandId: string, period: string) {
  const { from } = getPeriodDates(period);

  const { data: leadsData } = await supabase
    .from("lead_events")
    .select("id, source, lead_type, lead_source_channel, contact_id")
    .eq("brand_id", brandId)
    .gte("received_at", from);

  interface LeadData { id: string; source: string; lead_type: string | null; lead_source_channel: string | null; contact_id: string | null }

  const leadsList = (leadsData || []) as LeadData[];

  const bySource: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byChannel: Record<string, number> = {};

  leadsList.forEach((l) => {
    bySource[l.source] = (bySource[l.source] || 0) + 1;
    if (l.lead_type) byType[l.lead_type] = (byType[l.lead_type] || 0) + 1;
    if (l.lead_source_channel) byChannel[l.lead_source_channel] = (byChannel[l.lead_source_channel] || 0) + 1;
  });

  const uniqueContacts = new Set(leadsList.map((l) => l.contact_id).filter(Boolean));

  return {
    period,
    total_events: leadsList.length,
    unique_contacts: uniqueContacts.size,
    by_source: bySource,
    by_type: byType,
    by_channel: byChannel,
  };
}

async function getTrendComparison(supabase: SupabaseClient, brandId: string, metric: string, comparison: string) {
  const periods = getPreviousPeriodDates(comparison);

  let currentCount = 0;
  let previousCount = 0;

  switch (metric) {
    case "leads": {
      const [current, previous] = await Promise.all([
        supabase.from("lead_events").select("id", { count: "exact" }).eq("brand_id", brandId).gte("received_at", periods.current.from).lte("received_at", periods.current.to),
        supabase.from("lead_events").select("id", { count: "exact" }).eq("brand_id", brandId).gte("received_at", periods.previous.from).lte("received_at", periods.previous.to),
      ]);
      currentCount = current.count || 0;
      previousCount = previous.count || 0;
      break;
    }
    case "tickets": {
      const [current, previous] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact" }).eq("brand_id", brandId).gte("created_at", periods.current.from).lte("created_at", periods.current.to),
        supabase.from("tickets").select("id", { count: "exact" }).eq("brand_id", brandId).gte("created_at", periods.previous.from).lte("created_at", periods.previous.to),
      ]);
      currentCount = current.count || 0;
      previousCount = previous.count || 0;
      break;
    }
    case "deals": {
      const [current, previous] = await Promise.all([
        supabase.from("deals").select("id", { count: "exact" }).eq("brand_id", brandId).gte("created_at", periods.current.from).lte("created_at", periods.current.to),
        supabase.from("deals").select("id", { count: "exact" }).eq("brand_id", brandId).gte("created_at", periods.previous.from).lte("created_at", periods.previous.to),
      ]);
      currentCount = current.count || 0;
      previousCount = previous.count || 0;
      break;
    }
    case "appointments": {
      const [current, previous] = await Promise.all([
        supabase.from("appointments").select("id", { count: "exact" }).eq("brand_id", brandId).gte("scheduled_at", periods.current.from).lte("scheduled_at", periods.current.to),
        supabase.from("appointments").select("id", { count: "exact" }).eq("brand_id", brandId).gte("scheduled_at", periods.previous.from).lte("scheduled_at", periods.previous.to),
      ]);
      currentCount = current.count || 0;
      previousCount = previous.count || 0;
      break;
    }
  }

  const change = previousCount > 0 ? Math.round(((currentCount - previousCount) / previousCount) * 100) : currentCount > 0 ? 100 : 0;

  return {
    metric,
    comparison: comparison === "wow" ? "Week over Week" : "Month over Month",
    current_period: currentCount,
    previous_period: previousCount,
    change_percent: change,
    trend: change > 0 ? "up" : change < 0 ? "down" : "stable",
  };
}

async function getAIDecisionsSummary(supabase: SupabaseClient, brandId: string, period: string) {
  const { from } = getPeriodDates(period);

  const { data: decisionsData } = await supabase
    .from("ai_decision_logs")
    .select("id, lead_type, priority, was_overridden, confidence")
    .eq("brand_id", brandId)
    .gte("created_at", from);

  interface DecisionData { id: string; lead_type: string; priority: number; was_overridden: boolean; confidence: number | null }

  const decisionsList = (decisionsData || []) as DecisionData[];
  const overridden = decisionsList.filter((d) => d.was_overridden).length;
  const avgConfidence = decisionsList.length > 0 ? decisionsList.reduce((sum, d) => sum + (d.confidence || 0), 0) / decisionsList.length : 0;

  const byType: Record<string, number> = {};
  const byPriority: Record<string, number> = {};

  decisionsList.forEach((d) => {
    if (d.lead_type) byType[d.lead_type] = (byType[d.lead_type] || 0) + 1;
    byPriority[`P${d.priority}`] = (byPriority[`P${d.priority}`] || 0) + 1;
  });

  return {
    period,
    total_decisions: decisionsList.length,
    overridden_count: overridden,
    override_rate: decisionsList.length > 0 ? Math.round((overridden / decisionsList.length) * 100) : 0,
    avg_confidence: Math.round(avgConfidence * 100),
    by_lead_type: byType,
    by_priority: byPriority,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, threadId, brandId, conversationHistory = [] } = await req.json();

    if (!message || !brandId) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create Supabase client for tool execution
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build messages array
    const messages = [
      { role: "system", content: EXECUTIVE_AGENT_PROMPT },
      ...conversationHistory,
      { role: "user", content: message },
    ];

    // First API call with tools
    let response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        tools: AGENT_TOOLS,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    let result = await response.json();
    let assistantMessage = result.choices[0].message;
    const toolCalls = assistantMessage.tool_calls || [];

    // Process tool calls if any
    if (toolCalls.length > 0) {
      const toolResults: { role: string; tool_call_id: string; content: string }[] = [];

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

        console.log(`Executing tool: ${toolName}`, toolArgs);

        const toolResult = await handleToolCall(supabase, brandId, toolName, toolArgs);
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Second API call with tool results
      const messagesWithTools = [...messages, assistantMessage, ...toolResults];

      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: messagesWithTools,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI gateway error on second call: ${response.status}`);
      }

      result = await response.json();
      assistantMessage = result.choices[0].message;
    }

    // Save messages to chat_messages if threadId provided
    if (threadId) {
      // Get thread to find brand_id
      const { data: thread } = await supabase.from("chat_threads").select("brand_id").eq("id", threadId).single();

      if (thread) {
        // Insert AI response
        await supabase.from("chat_messages").insert({
          thread_id: threadId,
          brand_id: thread.brand_id,
          sender_type: "ai",
          message_text: assistantMessage.content,
          ai_context: { tools_used: toolCalls.map((t: { function: { name: string } }) => t.function.name) },
        });

        // Update thread updated_at
        await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
      }
    }

    return new Response(
      JSON.stringify({
        message: assistantMessage.content,
        tools_used: toolCalls.map((t: { function: { name: string } }) => t.function.name),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Agent error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
