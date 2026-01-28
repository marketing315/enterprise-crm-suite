import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import type { ClinicalTopic } from '@/types/database';

export function useClinicalTopics() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ['clinical-topics', currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase
        .from('clinical_topics')
        .select('*')
        .eq('brand_id', currentBrand.id)
        .eq('is_active', true)
        .order('canonical_name');

      if (error) throw error;
      return data as ClinicalTopic[];
    },
    enabled: !!currentBrand?.id,
  });
}

export function useUpsertClinicalTopics() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: { strings: string[]; createdBy?: 'ai' | 'user' }) => {
      if (!currentBrand?.id) throw new Error('No brand selected');

      const { data, error } = await supabase.rpc('upsert_clinical_topics_from_strings', {
        p_brand_id: currentBrand.id,
        p_strings: params.strings,
        p_created_by: params.createdBy || 'user',
      });

      if (error) throw error;
      return data as string[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical-topics'] });
    },
  });
}

export function useSetLeadEventClinicalTopics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { eventId: string; topicIds: string[] }) => {
      const { error } = await supabase.rpc('set_lead_event_clinical_topics', {
        p_event_id: params.eventId,
        p_topic_ids: params.topicIds,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-events'] });
    },
  });
}

export function useLeadEventClinicalTopics(eventId: string | null) {
  return useQuery({
    queryKey: ['lead-event-topics', eventId],
    queryFn: async () => {
      if (!eventId) return [];

      const { data, error } = await supabase
        .from('lead_event_clinical_topics')
        .select(`
          topic_id,
          clinical_topics (
            id,
            canonical_name,
            slug,
            needs_review,
            is_active
          )
        `)
        .eq('lead_event_id', eventId);

      if (error) throw error;
      return data.map(row => row.clinical_topics).filter(Boolean) as ClinicalTopic[];
    },
    enabled: !!eventId,
  });
}
