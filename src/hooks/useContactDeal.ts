import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to fetch an open deal for a contact.
 * Returns the first open/reopened_for_support deal if exists.
 */
export function useContactDeal(contactId: string | null) {
  return useQuery({
    queryKey: ['contact-deal', contactId],
    queryFn: async () => {
      if (!contactId) return null;

      const { data, error } = await supabase
        .from('deals')
        .select('id, status, current_stage_id')
        .eq('contact_id', contactId)
        .in('status', ['open', 'reopened_for_support'])
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });
}
