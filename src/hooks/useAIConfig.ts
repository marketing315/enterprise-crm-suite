import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useToast } from "@/hooks/use-toast";

export type AIMode = "off" | "suggest" | "auto_apply";

export interface AIConfig {
  id: string;
  brand_id: string;
  mode: AIMode;
  active_prompt_version: string | null;
  rules_json: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export interface AIPrompt {
  id: string;
  brand_id: string;
  name: string; // 'decision_service' | 'ai_chat'
  version: string;
  content: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface AIFeedback {
  id: string;
  ai_decision_id: string;
  user_id: string;
  brand_id: string;
  label: "correct" | "incorrect";
  corrected_output_json: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}

export interface AIChatLog {
  id: string;
  brand_id: string;
  user_id: string;
  entity_type: string | null;
  entity_id: string | null;
  tool_name: string | null;
  input_text: string;
  output_text: string | null;
  prompt_version: string | null;
  latency_ms: number | null;
  tokens_used: number | null;
  status: "pending" | "success" | "failed";
  error: string | null;
  flagged_incorrect: boolean;
  flagged_reason: string | null;
  created_at: string;
}

export function useAIConfig() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["ai-config", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return null;

      // Try to get existing config
      const { data, error } = await supabase
        .from("ai_configs")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        return data as unknown as AIConfig;
      }

      // If no config exists, use RPC to create one
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_or_create_ai_config",
        { p_brand_id: currentBrand.id }
      );

      if (rpcError) throw rpcError;
      return rpcData as unknown as AIConfig;
    },
    enabled: !!currentBrand?.id,
  });
}

export function useUpdateAIConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      updates: Partial<Pick<AIConfig, "mode" | "rules_json">>;
    }) => {
      const { data, error } = await supabase
        .from("ai_configs")
        .update({
          ...params.updates,
          updated_at: new Date().toISOString(),
        } as Record<string, unknown>)
        .eq("id", params.id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as AIConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-config"] });
      toast({ title: "Configurazione AI aggiornata" });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useAIPrompts(promptName?: string) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["ai-prompts", currentBrand?.id, promptName],
    queryFn: async () => {
      if (!currentBrand?.id) return [];

      let query = supabase
        .from("ai_prompts")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false });

      if (promptName) {
        query = query.eq("name", promptName);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AIPrompt[];
    },
    enabled: !!currentBrand?.id,
  });
}

export function useCreateAIPrompt() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      brand_id: string;
      name: string;
      version: string;
      content: string;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("ai_prompts")
        .insert({
          brand_id: params.brand_id,
          name: params.name,
          version: params.version,
          content: params.content,
          is_active: params.is_active ?? false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as AIPrompt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-prompts"] });
      toast({ title: "Prompt creato" });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useActivateAIPrompt() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (promptId: string) => {
      const { data, error } = await supabase.rpc("activate_ai_prompt", {
        p_prompt_id: promptId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-prompts"] });
      queryClient.invalidateQueries({ queryKey: ["ai-config"] });
      toast({ title: "Prompt attivato" });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useAIFeedback() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["ai-feedback", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase
        .from("ai_feedback")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as unknown as AIFeedback[];
    },
    enabled: !!currentBrand?.id,
  });
}

export function useCreateAIFeedback() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      ai_decision_id: string;
      user_id: string;
      brand_id: string;
      label: "correct" | "incorrect";
      corrected_output_json?: Record<string, unknown>;
      note?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase
        .from("ai_feedback") as any)
        .insert({
          ai_decision_id: params.ai_decision_id,
          user_id: params.user_id,
          brand_id: params.brand_id,
          label: params.label,
          corrected_output_json: params.corrected_output_json ?? null,
          note: params.note ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as AIFeedback;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["ai-quality-metrics"] });
      toast({ title: "Feedback salvato" });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useAIQualityMetrics(period: "today" | "7d" | "30d" = "7d") {
  const { currentBrand } = useBrand();

  const getPeriodDates = () => {
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = new Date();
    from.setHours(0, 0, 0, 0);

    switch (period) {
      case "today":
        break;
      case "7d":
        from.setDate(from.getDate() - 7);
        break;
      case "30d":
        from.setDate(from.getDate() - 30);
        break;
    }
    return { from, to };
  };

  return useQuery({
    queryKey: ["ai-quality-metrics", currentBrand?.id, period],
    queryFn: async () => {
      if (!currentBrand?.id) return null;

      const { from, to } = getPeriodDates();

      const { data, error } = await supabase.rpc("get_ai_quality_metrics", {
        p_brand_id: currentBrand.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });

      if (error) throw error;
      return data as {
        total_decisions: number;
        override_count: number;
        override_rate: number;
        feedback_correct: number;
        feedback_incorrect: number;
        feedback_accuracy: number | null;
      };
    },
    enabled: !!currentBrand?.id,
  });
}

export function useAIChatLogs() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["ai-chat-logs", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase
        .from("ai_chat_logs")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as unknown as AIChatLog[];
    },
    enabled: !!currentBrand?.id,
  });
}
