import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

/**
 * Hook to create a deal for a contact using the find_or_create_deal RPC.
 */
export function useCreateContactDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ brandId, contactId }: { brandId: string; contactId: string }) => {
      const { data, error } = await supabase.rpc('find_or_create_deal', {
        p_brand_id: brandId,
        p_contact_id: contactId,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contact-deal', variables.contactId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });
}

