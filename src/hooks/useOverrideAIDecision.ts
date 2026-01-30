import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OverrideResult {
  success: boolean;
  lead_event_id: string;
  changes: {
    priority: number;
    lead_type: string;
    should_create_ticket: boolean;
  };
}

interface OverrideParams {
  leadEventId: string;
  newPriority?: number;
  newLeadType?: string;
  newShouldCreateTicket?: boolean;
  overrideReason?: string;
}

export function useOverrideAIDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: OverrideParams): Promise<OverrideResult> => {
      const { data, error } = await supabase.rpc('override_ai_decision', {
        p_lead_event_id: params.leadEventId,
        p_new_priority: params.newPriority ?? null,
        p_new_lead_type: params.newLeadType ?? null,
        p_new_should_create_ticket: params.newShouldCreateTicket ?? null,
        p_override_reason: params.overrideReason ?? null,
      }) as { data: OverrideResult | null; error: Error | null };

      if (error) throw error;
      if (!data) throw new Error('No data returned');
      return data;
    },
    onSuccess: () => {
      toast.success('Decisione AI sovrascritta');
      queryClient.invalidateQueries({ queryKey: ['lead-events'] });
      queryClient.invalidateQueries({ queryKey: ['ai-decision-logs'] });
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

// Priority labels aligned with PRD semantics (5 = URGENT)
export const AI_PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  5: { label: 'Urgente', color: 'bg-destructive text-destructive-foreground' },
  4: { label: 'Alta', color: 'bg-orange-500 text-white' },
  3: { label: 'Media', color: 'bg-yellow-500 text-black' },
  2: { label: 'Bassa', color: 'bg-blue-500 text-white' },
  1: { label: 'Minima', color: 'bg-muted text-muted-foreground' },
};

export const LEAD_TYPE_LABELS: Record<string, string> = {
  trial: 'Prova Gratuita',
  info: 'Richiesta Info',
  support: 'Supporto',
  generic: 'Generico',
};
