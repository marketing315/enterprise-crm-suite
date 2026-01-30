import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentResponse {
  message: string;
  tools_used: string[];
}

export function useAIAgentChat() {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      message,
      threadId,
      conversationHistory = [],
    }: {
      message: string;
      threadId?: string;
      conversationHistory?: AgentMessage[];
    }): Promise<AgentResponse> => {
      if (!currentBrand) {
        throw new Error("No brand selected");
      }

      const { data, error } = await supabase.functions.invoke("ai-agent", {
        body: {
          message,
          threadId,
          brandId: currentBrand.id,
          conversationHistory,
        },
      });

      if (error) {
        // Handle specific error codes
        if (error.message?.includes("429") || error.message?.includes("Rate limit")) {
          throw new Error("Rate limit raggiunto. Riprova tra qualche secondo.");
        }
        if (error.message?.includes("402") || error.message?.includes("Payment")) {
          throw new Error("Crediti esauriti. Aggiungi crediti al workspace.");
        }
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data as AgentResponse;
    },
    onSuccess: (_, variables) => {
      if (variables.threadId) {
        queryClient.invalidateQueries({ queryKey: ["chat-messages", variables.threadId] });
        queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      }
    },
    onError: (error: Error) => {
      console.error("AI Agent error:", error);
      toast.error(error.message || "Errore nell'elaborazione della richiesta AI");
    },
  });
}

// Quick action prompts for common executive queries
export const AGENT_QUICK_ACTIONS = [
  {
    id: "kpi-today",
    label: "📊 KPI Oggi",
    prompt: "Come sta andando oggi? Dammi un riepilogo dei KPI principali.",
    icon: "BarChart3",
  },
  {
    id: "kpi-week",
    label: "📈 Settimana",
    prompt: "Riepilogo della settimana: lead, ticket, deal e appuntamenti.",
    icon: "TrendingUp",
  },
  {
    id: "pipeline",
    label: "💼 Pipeline",
    prompt: "Qual è lo stato attuale della pipeline? Mostra i deal per stage.",
    icon: "Kanban",
  },
  {
    id: "tickets",
    label: "🎫 Ticket",
    prompt: "Quanti ticket aperti abbiamo? Mostra priorità e SLA.",
    icon: "Ticket",
  },
  {
    id: "team",
    label: "👥 Team",
    prompt: "Come sta performando il team? Mostra le statistiche degli operatori.",
    icon: "Users",
  },
  {
    id: "trend",
    label: "📉 Trend WoW",
    prompt: "Confronta questa settimana con la scorsa per tutte le metriche.",
    icon: "ArrowUpDown",
  },
  {
    id: "leads",
    label: "🎯 Lead Sources",
    prompt: "Da dove arrivano i lead? Analizza le fonti di acquisizione.",
    icon: "Target",
  },
  {
    id: "ai-perf",
    label: "🤖 AI Performance",
    prompt: "Come sta performando l'AI? Override rate e accuracy.",
    icon: "Bot",
  },
] as const;

export type QuickActionId = typeof AGENT_QUICK_ACTIONS[number]["id"];
