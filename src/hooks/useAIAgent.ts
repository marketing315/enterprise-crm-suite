import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentResponse {
  message: string;
  tools_used: string[];
  run_id?: string;
  latency_ms?: number;
  had_fallback?: boolean;
}

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_TOTAL_CHARS = 12000;
const MAX_HISTORY_MESSAGE_CHARS = 1200;

function compactConversationHistory(history: AgentMessage[]): AgentMessage[] {
  const normalized = history
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, MAX_HISTORY_MESSAGE_CHARS),
    }))
    .filter((m) => m.content.length > 0);

  const selected: AgentMessage[] = [];
  let totalChars = 0;

  for (let i = normalized.length - 1; i >= 0; i--) {
    const msg = normalized[i];
    if (selected.length >= MAX_HISTORY_MESSAGES) break;
    if (totalChars + msg.content.length > MAX_HISTORY_TOTAL_CHARS && selected.length > 0) break;
    selected.push(msg);
    totalChars += msg.content.length;
  }

  return selected.reverse();
}

/**
 * Hook to get or create the executive thread for the current user+brand.
 * The thread persists across sessions.
 */
export function useExecutiveThread() {
  const { currentBrand } = useBrand();
  const { session } = useAuth();

  return useQuery({
    queryKey: ["executive-thread", currentBrand?.id],
    queryFn: async (): Promise<string> => {
      if (!currentBrand || !session?.user?.id) throw new Error("No brand or user");

      const { data, error } = await supabase.rpc("get_or_create_executive_thread", {
        p_brand_id: currentBrand.id,
        p_user_id: session.user.id,
      });

      if (error) throw error;
      return data as string;
    },
    enabled: !!currentBrand && !!session?.user?.id,
    staleTime: Infinity,
  });
}

/**
 * Hook to create a brand-new executive thread, archiving the current one.
 * The old thread stays in chat_threads (visible in Conversazioni).
 * The new thread becomes the active executive thread.
 */
export function useCreateNewExecutiveThread() {
  const { currentBrand } = useBrand();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<string> => {
      if (!currentBrand || !session?.user?.id) throw new Error("No brand or user");

      // Resolve internal user ID from auth UUID
      const { data: internalUserId, error: rpcError } = await supabase.rpc("get_user_id", {
        _auth_uid: session.user.id,
      });
      if (rpcError || !internalUserId) throw new Error("Cannot resolve internal user ID");

      // Insert a new executive thread
      const { data, error } = await supabase
        .from("chat_threads")
        .insert({
          brand_id: currentBrand.id,
          created_by: internalUserId,
          type: "executive" as any,
          title: `Agente AI Executive — ${new Date().toLocaleDateString("it-IT")}`,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Add the creator as a member
      await supabase.from("chat_thread_members").insert({
        thread_id: data.id,
        user_id: internalUserId,
      });

      return data.id;
    },
    onSuccess: (newThreadId) => {
      // Update the cached executive thread to point to the new one
      queryClient.setQueryData(["executive-thread", currentBrand?.id], newThreadId);
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      toast.success("Nuova conversazione AI creata");
    },
    onError: (error: Error) => {
      console.error("Error creating new executive thread:", error);
      toast.error("Errore nella creazione della conversazione");
    },
  });
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

      // Use AbortController for client-side timeout (35s — slightly longer than server-side 25s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      let data: AgentResponse | null = null;
      let error: Error | null = null;
      try {
        const safeHistory = compactConversationHistory(conversationHistory);

        const result = await supabase.functions.invoke("ai-agent", {
          body: {
            message,
            threadId,
            brandId: currentBrand.id,
            ...(safeHistory.length > 0 ? { conversationHistory: safeHistory } : {}),
          },
        });
        data = result.data;
        error = result.error;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error("La richiesta è scaduta. L'agente potrebbe essere sovraccarico, riprova.");
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }

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

      // FR3: Even if server returns error field, check for fallback message
      if ((data as any)?.error && !(data as any)?.message) {
        throw new Error((data as any).error);
      }

      // If server returned both error and message (fallback), use the message
      const response = data as AgentResponse;
      if (!response.message || response.message.trim() === "") {
        response.message = "Mi dispiace, non sono riuscito a elaborare una risposta completa. Puoi riprovare o riformulare la domanda?";
        response.had_fallback = true;
      }

      return response;
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
