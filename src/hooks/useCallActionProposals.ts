import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { untypedClient } from "@/integrations/supabase/untypedClient";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

export type CallActionType =
  | "update_contact"
  | "update_kanban_stage"
  | "create_or_update_ticket"
  | "create_or_update_appointment"
  | "create_lead_event"
  | "update_deal"
  | "add_action_suggestion"
  | "update_call_log";

export type DecisionStatus = "pending_approval" | "approved" | "rejected" | "edited_then_approved";

export interface CallActionProposal {
  id: string;
  brand_id: string;
  call_log_id: string;
  transcript_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  ai_model: string;
  ai_prompt_version: string;
  ai_confidence: number | null;
  ai_rationale: string | null;
  transcript_excerpt: string | null;
  action_type: CallActionType;
  action_label: string;
  proposed_changes: Record<string, unknown>;
  current_snapshot: Record<string, unknown>;
  decision_status: DecisionStatus;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CallActionDecision {
  id: string;
  proposal_id: string;
  decided_by: string;
  decision: DecisionStatus;
  edited_changes: Record<string, unknown> | null;
  rejection_reason: string | null;
  decided_at: string;
}

export interface CallActionExecution {
  id: string;
  proposal_id: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  executed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  result_snapshot: Record<string, unknown> | null;
}

// Fetch proposals for a call
export function useCallActionProposals(callLogId: string | null) {
  return useQuery({
    queryKey: ["call-action-proposals", callLogId],
    queryFn: async (): Promise<CallActionProposal[]> => {
      if (!callLogId) return [];
      const { data, error } = await untypedClient
        .from("ai_call_action_proposals")
        .select("*")
        .eq("call_log_id", callLogId)
        .order("display_order");
      if (error) throw error;
      return (data || []) as CallActionProposal[];
    },
    enabled: !!callLogId,
  });
}

// Generate proposals via AI
export function useGenerateCallProposals() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ callLogId, brandId }: { callLogId: string; brandId: string }) => {
      const { data, error } = await supabase.functions.invoke("ai-call-proposals", {
        body: { call_log_id: callLogId, brand_id: brandId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["call-action-proposals", variables.callLogId] });
      const count = data?.count || 0;
      toast.success(`${count} proposta/e AI generata/e`);
    },
    onError: (error: Error) => {
      console.error("Error generating proposals:", error);
      toast.error("Errore nella generazione proposte AI");
    },
  });
}

// Decide on a proposal (approve/reject/edit)
export function useDecideProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      proposalId,
      brandId,
      decision,
      editedChanges,
      rejectionReason,
    }: {
      proposalId: string;
      brandId: string;
      decision: "approved" | "rejected" | "edited_then_approved";
      editedChanges?: Record<string, unknown>;
      rejectionReason?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("ai-call-apply", {
        body: {
          action: "decide",
          proposal_id: proposalId,
          brand_id: brandId,
          decision,
          edited_changes: editedChanges,
          rejection_reason: rejectionReason,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["call-action-proposals"] });
      const label =
        variables.decision === "approved" ? "Approvata" :
        variables.decision === "rejected" ? "Rifiutata" : "Modificata e approvata";
      toast.success(`Proposta ${label}`);
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

// Fetch execution results for a proposal
export function useProposalExecutions(proposalId: string | null) {
  return useQuery({
    queryKey: ["call-action-executions", proposalId],
    queryFn: async (): Promise<CallActionExecution[]> => {
      if (!proposalId) return [];
      const { data, error } = await untypedClient
        .from("ai_call_action_executions")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CallActionExecution[];
    },
    enabled: !!proposalId,
  });
}
