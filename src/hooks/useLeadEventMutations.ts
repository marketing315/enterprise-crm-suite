import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { toast } from 'sonner';
import type {
  LeadSourceChannel,
  ContactChannel,
  PacemakerStatus,
  CustomerSentiment,
  DecisionStatus,
  ObjectionType,
  ClinicalTopic,
} from '@/types/database';

// Types for RPC parameters
export interface CreateManualLeadEventParams {
  contactId: string;
  sourceName?: string;
  leadSourceChannel?: LeadSourceChannel | null;
  contactChannel?: ContactChannel | null;
  pacemakerStatus?: PacemakerStatus | null;
  customerSentiment?: CustomerSentiment | null;
  decisionStatus?: DecisionStatus | null;
  objectionType?: ObjectionType | null;
  bookingNotes?: string | null;
  logisticsNotes?: string | null;
  aiConversationSummary?: string | null;
}

export interface UpdateLeadEventQualificationParams {
  eventId: string;
  leadSourceChannel?: LeadSourceChannel | null;
  contactChannel?: ContactChannel | null;
  pacemakerStatus?: PacemakerStatus | null;
  customerSentiment?: CustomerSentiment | null;
  decisionStatus?: DecisionStatus | null;
  objectionType?: ObjectionType | null;
  bookingNotes?: string | null;
  logisticsNotes?: string | null;
  aiConversationSummary?: string | null;
}

export interface ContactLeadEvent {
  id: string;
  source: string;
  source_name: string | null;
  occurred_at: string;
  received_at: string;
  ai_priority: number | null;
  lead_type: string | null;
  lead_source_channel: LeadSourceChannel | null;
  contact_channel: ContactChannel | null;
  pacemaker_status: PacemakerStatus | null;
  customer_sentiment: CustomerSentiment | null;
  decision_status: DecisionStatus | null;
  objection_type: ObjectionType | null;
  booking_notes: string | null;
  logistics_notes: string | null;
  ai_conversation_summary: string | null;
  archived: boolean;
  clinical_topics: Array<{
    id: string;
    canonical_name: string;
    needs_review: boolean;
  }>;
}

/**
 * Hook to create a manual lead_event for a contact
 */
export function useCreateManualLeadEvent() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: CreateManualLeadEventParams) => {
      if (!currentBrand?.id) throw new Error('No brand selected');

      const { data, error } = await supabase.rpc('create_manual_lead_event', {
        p_brand_id: currentBrand.id,
        p_contact_id: params.contactId,
        p_source_name: params.sourceName ?? 'Creazione manuale',
        p_lead_source_channel: params.leadSourceChannel ?? null,
        p_contact_channel: params.contactChannel ?? null,
        p_pacemaker_status: params.pacemakerStatus ?? null,
        p_customer_sentiment: params.customerSentiment ?? null,
        p_decision_status: params.decisionStatus ?? null,
        p_objection_type: params.objectionType ?? null,
        p_booking_notes: params.bookingNotes ?? null,
        p_logistics_notes: params.logisticsNotes ?? null,
        p_ai_conversation_summary: params.aiConversationSummary ?? null,
      });

      if (error) throw error;
      return data as string; // Returns the new event ID
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['lead-events'] });
      queryClient.invalidateQueries({ queryKey: ['contact-lead-events', params.contactId] });
      toast.success('Evento lead creato con successo');
    },
    onError: (error: any) => {
      console.error('Error creating manual lead event:', error);
      toast.error(error.message || 'Errore nella creazione dell\'evento');
    },
  });
}

/**
 * Hook to update qualification fields on an existing lead_event
 */
export function useUpdateLeadEventQualification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateLeadEventQualificationParams) => {
      const { error } = await supabase.rpc('update_lead_event_qualification', {
        p_event_id: params.eventId,
        p_lead_source_channel: params.leadSourceChannel ?? null,
        p_contact_channel: params.contactChannel ?? null,
        p_pacemaker_status: params.pacemakerStatus ?? null,
        p_customer_sentiment: params.customerSentiment ?? null,
        p_decision_status: params.decisionStatus ?? null,
        p_objection_type: params.objectionType ?? null,
        p_booking_notes: params.bookingNotes ?? null,
        p_logistics_notes: params.logisticsNotes ?? null,
        p_ai_conversation_summary: params.aiConversationSummary ?? null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-events'] });
      queryClient.invalidateQueries({ queryKey: ['contact-lead-events'] });
      toast.success('Qualificazione aggiornata');
    },
    onError: (error: any) => {
      console.error('Error updating lead event qualification:', error);
      toast.error(error.message || 'Errore nell\'aggiornamento della qualificazione');
    },
  });
}

/**
 * Hook to fetch all lead_events for a specific contact
 */
export function useContactLeadEvents(contactId: string | null, includeArchived: boolean = false) {
  return useQuery({
    queryKey: ['contact-lead-events', contactId, includeArchived],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase.rpc('list_contact_lead_events', {
        p_contact_id: contactId,
        p_include_archived: includeArchived,
      });

      if (error) throw error;
      return (data as unknown as ContactLeadEvent[]) || [];
    },
    enabled: !!contactId,
  });
}
