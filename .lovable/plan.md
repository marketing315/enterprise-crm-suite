
# Piano: Chatbot AI Avanzato di Livello C con Accesso a Tutti i Dati della Piattaforma

## Obiettivo

Creare un assistente AI executive (livello C-suite) capace di:
- Accedere a **tutti i dati della piattaforma** (contatti, lead, deal, ticket, appuntamenti, analytics)
- Eseguire **query analitiche** in tempo reale (KPI, trend, performance operatori)
- Fornire **insight strategici** e raccomandazioni actionable
- Supportare **tool calling** per query strutturate (es. "quanti lead questa settimana?")
- Rendere i dati **conversazionali** senza richiedere navigazione manuale

## Architettura

```text
+------------------+
|  Chat Frontend   |
|  (src/pages/Chat)|
+--------+---------+
         |
         v
+------------------+          +------------------------+
|  ai-agent Edge   |  <---->  |  Lovable AI Gateway    |
|  Function        |          |  (Gemini 3 Flash)      |
+--------+---------+          +------------------------+
         |
         v
+------------------+
|  Tool Functions  |
|  (Query DB)      |
+------------------+
         |
         v
+------------------+
|  Supabase DB     |
|  (Analytics RPC) |
+------------------+
```

## Tools AI Agent

L'agente avra accesso a questi strumenti tramite function calling:

| Tool | Descrizione | Esempio Query |
|------|-------------|---------------|
| `get_dashboard_kpis` | KPI principali (lead, deal, ticket, appuntamenti) | "Come sta andando oggi?" |
| `get_lead_analytics` | Analisi lead (fonte, conversione, trend) | "Da dove arrivano i lead?" |
| `get_pipeline_status` | Stato pipeline (deal per stage, valore totale) | "Quanti deal abbiamo in trattativa?" |
| `get_ticket_overview` | Overview ticket (backlog, SLA, operatori) | "Quanti ticket aperti abbiamo?" |
| `get_operator_performance` | Performance operatori (tempo risposta, risoluzione) | "Chi e il miglior operatore?" |
| `get_appointment_summary` | Riepilogo appuntamenti (oggi, settimana, esiti) | "Quanti appuntamenti oggi?" |
| `search_contacts` | Cerca contatti per nome/email/telefono | "Trova il contatto Mario Rossi" |
| `get_contact_timeline` | Timeline completa di un contatto | "Mostrami la storia di questo cliente" |
| `get_ai_decisions_summary` | Riepilogo decisioni AI (accuracy, override) | "Come sta performando l'AI?" |
| `get_trend_comparison` | Confronto periodi (WoW, MoM) | "Confronta questa settimana con la scorsa" |

## Dettaglio Tecnico

### 1. Nuova Edge Function `ai-agent` (Backend)

```typescript
// supabase/functions/ai-agent/index.ts

// System prompt per agente executive
const EXECUTIVE_AGENT_PROMPT = `
Sei un assistente AI executive per il CRM. Hai accesso completo ai dati della piattaforma.

CAPACITA:
1. Analisi KPI in tempo reale (lead, deal, ticket, appuntamenti)
2. Report performance operatori e team
3. Trend analysis e confronti temporali
4. Ricerca contatti e timeline complete
5. Insight strategici basati sui dati
6. Raccomandazioni actionable per il management

STILE:
- Rispondi in italiano
- Usa dati concreti con numeri e percentuali
- Evidenzia trend positivi/negativi
- Suggerisci azioni concrete
- Usa emoji per evidenziare metriche chiave (📈📉⚠️✅)
- Formatta con markdown per chiarezza

LIMITI:
- Non inventare dati non presenti
- Se non hai dati sufficienti, chiedili
- Per operazioni di modifica, spiega cosa faresti ma non eseguire
`;

// Definizione tools
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_dashboard_kpis",
      description: "Ottiene i KPI principali della dashboard: lead oggi/settimana, deal aperti, ticket, appuntamenti",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "week", "month"], description: "Periodo di riferimento" }
        },
        required: ["period"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_status",
      description: "Stato della pipeline: deal per stage, valore totale, deal aging",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_ticket_overview",
      description: "Overview ticket: aperti, backlog, SLA breach, distribuzione priorita",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "7d", "30d"] }
        },
        required: ["period"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_operator_performance",
      description: "Performance operatori: ticket gestiti, tempo risposta, risoluzione",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "7d", "30d"] }
        },
        required: ["period"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_contacts",
      description: "Cerca contatti per nome, email o telefono",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Termine di ricerca" },
          limit: { type: "integer", default: 5 }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_contact_timeline",
      description: "Timeline completa di un contatto: lead, deal, ticket, appuntamenti, note",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string" }
        },
        required: ["contact_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_lead_analytics",
      description: "Analisi lead: fonte, tipo, conversione, trend",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "7d", "30d"] }
        },
        required: ["period"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_trend_comparison",
      description: "Confronto tra due periodi (es. questa settimana vs scorsa)",
      parameters: {
        type: "object",
        properties: {
          metric: { type: "string", enum: ["leads", "tickets", "deals", "appointments"] },
          comparison: { type: "string", enum: ["wow", "mom"] }
        },
        required: ["metric", "comparison"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_ai_decisions_summary",
      description: "Riepilogo performance AI: decisioni, override rate, accuracy",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "7d", "30d"] }
        },
        required: ["period"]
      }
    }
  }
];
```

### 2. Implementazione Tool Handlers

Ogni tool esegue query DB e restituisce dati strutturati:

```typescript
async function handleTool(supabase, brandId, toolName, args) {
  switch (toolName) {
    case "get_dashboard_kpis":
      return await getDashboardKpis(supabase, brandId, args.period);
    case "get_pipeline_status":
      return await getPipelineStatus(supabase, brandId);
    case "get_ticket_overview":
      return await getTicketOverview(supabase, brandId, args.period);
    case "get_operator_performance":
      return await getOperatorPerformance(supabase, brandId, args.period);
    case "search_contacts":
      return await searchContacts(supabase, brandId, args.query, args.limit);
    case "get_contact_timeline":
      return await getContactTimeline(supabase, brandId, args.contact_id);
    // ... altri tool
  }
}

// Esempio implementazione
async function getDashboardKpis(supabase, brandId, period) {
  const { from, to } = getPeriodDates(period);
  
  const [leads, deals, tickets, appointments] = await Promise.all([
    supabase.from("lead_events").select("contact_id").eq("brand_id", brandId).gte("received_at", from),
    supabase.from("deals").select("*", { count: "exact" }).eq("brand_id", brandId).eq("status", "open"),
    supabase.from("tickets").select("*", { count: "exact" }).eq("brand_id", brandId).in("status", ["open", "in_progress"]),
    supabase.from("appointments").select("*", { count: "exact" }).eq("brand_id", brandId).gte("scheduled_at", from).lte("scheduled_at", to),
  ]);
  
  return {
    leads_count: new Set(leads.data?.map(e => e.contact_id) || []).size,
    open_deals: deals.count || 0,
    open_tickets: tickets.count || 0,
    appointments_today: appointments.count || 0,
    period,
  };
}
```

### 3. Flusso Conversazionale con Tool Calling

```text
User: "Come stiamo andando questa settimana?"
       |
       v
AI Agent riceve messaggio
       |
       v
AI decide: chiama tool "get_dashboard_kpis" con period="week"
       |
       v
Tool restituisce: { leads: 45, deals: 12, tickets: 8, appointments: 23 }
       |
       v
AI formula risposta naturale:
"📊 **Riepilogo Settimana**

- 📈 **45 nuovi lead** (contatti unici)
- 💼 **12 deal aperti** in pipeline
- 🎫 **8 ticket** da gestire
- 📅 **23 appuntamenti** schedulati

Rispetto alla settimana scorsa, i lead sono in crescita del 15%. 
Suggerisco di focalizzare il team sui deal in fase avanzata."
```

### 4. Nuovo Hook `useAIAgent`

```typescript
// src/hooks/useAIAgent.ts
export function useAIAgentChat() {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ message, threadId }: { message: string; threadId: string }) => {
      const { data, error } = await supabase.functions.invoke("ai-agent", {
        body: { message, threadId, brandId: currentBrand?.id },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", variables.threadId] });
    },
  });
}
```

### 5. UI Chat con Modalita Agent

Estensione della pagina Chat per supportare modalita "Agent AI":

```typescript
// Nuovo toggle per attivare Agent mode
<Switch checked={agentMode} onCheckedChange={setAgentMode} />
<Label>🤖 Agente AI Executive</Label>

// Quick actions per domande comuni
<div className="flex gap-2 flex-wrap">
  <Button variant="outline" size="sm" onClick={() => askAgent("Come stiamo andando oggi?")}>
    📊 KPI Oggi
  </Button>
  <Button variant="outline" size="sm" onClick={() => askAgent("Quanti ticket aperti?")}>
    🎫 Ticket
  </Button>
  <Button variant="outline" size="sm" onClick={() => askAgent("Stato pipeline")}>
    💼 Pipeline
  </Button>
  <Button variant="outline" size="sm" onClick={() => askAgent("Performance team")}>
    👥 Team
  </Button>
</div>
```

## File da Creare

| File | Descrizione |
|------|-------------|
| `supabase/functions/ai-agent/index.ts` | Edge function agente AI con tool calling |
| `src/hooks/useAIAgent.ts` | Hook per interazione con agente |
| `src/components/chat/AgentChatPanel.tsx` | Pannello chat dedicato all'agente |
| `src/components/chat/AgentQuickActions.tsx` | Bottoni azioni rapide |

## File da Modificare

| File | Modifiche |
|------|-----------|
| `src/pages/Chat.tsx` | Aggiungere toggle Agent mode e pannello dedicato |
| `src/hooks/useChat.ts` | Aggiungere hook per Agent mode |
| `supabase/config.toml` | Registrare nuova edge function |

## Esempi Conversazioni

**Domanda semplice:**
> "Quanti lead abbiamo avuto oggi?"

**Risposta:**
> 📈 **Oggi abbiamo ricevuto 12 nuovi lead** (contatti unici).
> 
> **Distribuzione per fonte:**
> - Meta Ads: 7 (58%)
> - Sito Web: 3 (25%)
> - Referral: 2 (17%)
>
> Il picco e stato alle 14:00. Vuoi vedere i dettagli di qualche lead specifico?

---

**Analisi comparativa:**
> "Confronta questa settimana con la scorsa"

**Risposta:**
> 📊 **Confronto WoW (Week over Week)**
>
> | Metrica | Scorsa | Questa | Δ |
> |---------|--------|--------|---|
> | Lead | 38 | 45 | +18% 📈 |
> | Ticket chiusi | 22 | 28 | +27% 📈 |
> | Appuntamenti | 25 | 23 | -8% 📉 |
> | Deal chiusi | 3 | 2 | -33% 📉 |
>
> ⚠️ **Attenzione**: Gli appuntamenti sono in calo. Consiglio di verificare la disponibilita del team vendite.

---

**Ricerca contatto:**
> "Trova il contatto Mario Rossi e dimmi la sua storia"

**Risposta:**
> 👤 **Mario Rossi** - mario.rossi@email.com
> 📍 Milano | Status: Attivo
>
> **Timeline:**
> - 15 Gen: Lead da Meta Ads (Trial)
> - 17 Gen: Chiamata follow-up (esito positivo)
> - 20 Gen: Appuntamento in sede ✅
> - 22 Gen: Deal aperto - €5.000
> - 25 Gen: Attualmente in stage "Proposta Inviata"
>
> **Suggerimento**: Il cliente e caldo, consiglio follow-up entro 48h per chiudere.

## Risultato Atteso

1. Assistente AI accessibile dalla pagina Chat con toggle dedicato
2. Query conversazionali su tutti i dati del CRM
3. Report e analytics in formato naturale
4. Confronti temporali (WoW, MoM)
5. Ricerca contatti e timeline complete
6. Quick actions per domande frequenti
7. Suggerimenti strategici basati sui dati
