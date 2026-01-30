import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CorrectPhoneResult {
  success: boolean;
  action?: 'updated' | 'merged';
  error?: string;
  conflicting_contact_id?: string;
  message: string;
  phone_id?: string;
  old_normalized?: string;
  new_normalized?: string;
}

interface CorrectPhoneParams {
  contactId: string;
  oldPhone: string;
  newPhone: string;
}

export function useCorrectPhone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, oldPhone, newPhone }: CorrectPhoneParams): Promise<CorrectPhoneResult> => {
      const { data, error } = await supabase.rpc('correct_contact_phone', {
        p_contact_id: contactId,
        p_old_phone: oldPhone,
        p_new_phone: newPhone,
      }) as { data: CorrectPhoneResult | null; error: Error | null };

      if (error) throw error;
      if (!data) throw new Error('No data returned');
      return data;
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        queryClient.invalidateQueries({ queryKey: ['contact'] });
      } else {
        // Conflict case - don't show error toast, let UI handle it
      }
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}
