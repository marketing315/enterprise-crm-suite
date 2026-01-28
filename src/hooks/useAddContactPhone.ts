import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useAddContactPhone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { 
      contactId: string; 
      phoneRaw: string; 
      isPrimary?: boolean 
    }) => {
      const { data, error } = await supabase.rpc('add_contact_phone', {
        p_contact_id: params.contactId,
        p_phone_raw: params.phoneRaw,
        p_is_primary: params.isPrimary ?? false,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact'] });
    },
  });
}
