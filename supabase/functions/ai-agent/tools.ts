// ── TOOL DEFINITIONS ──
export const AGENT_TOOLS = [
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
          date_from: { type: "string", description: "Data inizio in formato ISO 8601" },
          date_to: { type: "string", description: "Data fine in formato ISO 8601" },
          group_by: {
            type: "string",
            enum: ["date", "week", "month", "regione", "provincia", "city", "status", "priority", "source_name", "lead_type", "outcome", "appointment_type", "call_type", "category", "cost_center", "vendor_name", "periodicity", "payment_status", "campaign_name", "product_name", "from_stage_label", "to_stage_label", "channel"],
            description: "Campo per raggruppare i risultati",
          },
          filters: { type: "object", description: "Filtri aggiuntivi come oggetto chiave-valore" },
          limit: { type: "integer", description: "Numero massimo di risultati raggruppati (default: 50)" },
        },
        required: ["dataset"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_contacts",
      description: "Cerca contatti per nome, email, telefono o azienda.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Termine di ricerca" },
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
      description: "Timeline completa di un contatto: lead, deal, ticket, appuntamenti, chiamate.",
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
      description: "Snapshot pipeline: deal per stage con conteggio e valore.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_operator_performance",
      description: "Performance operatori: ticket gestiti, risolti, tempi medi.",
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
      description: `Analisi performance advertising (Meta Ads, Google Ads). USA QUESTO TOOL per QUALSIASI domanda su ads, advertising, campagne pubblicitarie, spesa adv, CTR, CPC, CPM, ROAS, creatività, target demografico.`,
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Data inizio ISO 8601" },
          date_to: { type: "string", description: "Data fine ISO 8601" },
          platform: { type: "string", enum: ["meta", "google"], description: "Filtra per piattaforma" },
          include_creatives: { type: "boolean", description: "Include breakdown per creatività" },
          include_demographics: { type: "boolean", description: "Include breakdown per età e genere" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_raw_table_data",
      description: `Legge righe grezze da una tabella del brand. NON usare per conteggi o somme.`,
      parameters: {
        type: "object",
        properties: {
          table: {
            type: "string",
            enum: ["expenses", "budgets", "sales_orders", "products", "marketing_campaigns", "automation_rules", "automation_logs", "deal_stage_transitions", "pipeline_stages", "expense_categories", "cost_centers", "ad_platform_stats", "ad_creative_stats", "ad_demographic_stats", "webhook_sources", "admin_notes", "admin_todos", "brand_tax_settings", "deals", "tickets", "appointments", "call_logs", "contacts", "lead_events"],
            description: "Tabella da leggere",
          },
          columns: { type: "string", description: "Colonne da selezionare, separate da virgola" },
          filters: { type: "object", description: "Filtri chiave-valore" },
          order_by: { type: "string", description: "Colonna per ordinamento" },
          ascending: { type: "boolean", description: "Ordine crescente" },
          limit: { type: "integer", description: "Numero massimo di righe (max: 50)" },
        },
        required: ["table"],
      },
    },
  },
];
