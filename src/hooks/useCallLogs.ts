import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWriteBrandId } from "@/hooks/useWriteBrandId";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface CallLog {
  id: string;
  brand_id: string;
  contact_id: string;
  deal_id: string | null;
  user_id: string;
  phone_number: string;
  call_type: "outbound" | "inbound";
  status: "initiated" | "ringing" | "answered" | "completed" | "failed" | "busy" | "no_answer";
  duration_seconds: number | null;
  notes: string | null;
  recording_url: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface CreateCallLogInput {
  contact_id: string;
  phone_number: string;
  deal_id?: string | null;
}

export function useCreateCallLog() {
  const queryClient = useQueryClient();
  const { getWriteBrandId } = useWriteBrandId();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateCallLogInput) => {
      const brandId = getWriteBrandId();
      if (!user) throw new Error("Utente non autenticato");

      const { data, error } = await supabase
        .from("call_logs")
        .insert({
          brand_id: brandId,
          contact_id: input.contact_id,
          deal_id: input.deal_id || null,
          user_id: user.id,
          phone_number: input.phone_number,
          call_type: "outbound",
          status: "initiated",
        })
        .select()
        .single();

      if (error) throw error;
      return data as CallLog;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-logs"] });
    },
    onError: (error: Error) => {
      console.error("Error creating call log:", error);
      toast.error("Errore nel registro chiamata");
    },
  });
}

export function useUpdateCallLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<CallLog, "status" | "duration_seconds" | "notes" | "ended_at">>;
    }) => {
      const { data, error } = await supabase
        .from("call_logs")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as CallLog;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-logs"] });
    },
  });
}

export function useContactCallLogs(contactId: string | null) {
  return useQuery({
    queryKey: ["call-logs", "contact", contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from("call_logs")
        .select("*")
        .eq("contact_id", contactId)
        .order("started_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as CallLog[];
    },
    enabled: !!contactId,
  });
}
