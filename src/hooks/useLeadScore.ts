import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LeadScore {
  id: string;
  contact_id: string;
  brand_id: string;
  score: number;
  heat_class: "freddo" | "tiepido" | "caldo";
  positive_drivers: string[];
  negative_drivers: string[];
  next_best_action: string | null;
  computed_at: string;
}

export function useLeadScore(contactId: string | undefined) {
  return useQuery({
    queryKey: ["lead-score", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_scores")
        .select("*")
        .eq("contact_id", contactId!)
        .maybeSingle();

      if (error) throw error;
      return data as LeadScore | null;
    },
  });
}

export function useCalculateLeadScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      triggerEvent = "manual",
    }: {
      contactId: string;
      triggerEvent?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "calculate-lead-score",
        {
          body: { contact_id: contactId, trigger_event: triggerEvent },
        }
      );

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["lead-score", variables.contactId],
      });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
