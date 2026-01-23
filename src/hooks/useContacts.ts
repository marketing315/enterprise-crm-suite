import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import type { Contact, ContactWithPhones, ContactStatus } from '@/types/database';

export function useContacts(status?: ContactStatus) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ['contacts', currentBrand?.id, status],
    queryFn: async () => {
      if (!currentBrand?.id) return [];

      let query = supabase
        .from('contacts')
        .select(`
          *,
          contact_phones (*)
        `)
        .eq('brand_id', currentBrand.id)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ContactWithPhones[];
    },
    enabled: !!currentBrand?.id,
  });
}

export function useContact(contactId: string | null) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => {
      if (!contactId || !currentBrand?.id) return null;

      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          contact_phones (*),
          lead_events (*)
        `)
        .eq('id', contactId)
        .eq('brand_id', currentBrand.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!contactId && !!currentBrand?.id,
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: { id: string; updates: Partial<Contact> }) => {
      const { data, error } = await supabase
        .from('contacts')
        .update(params.updates)
        .eq('id', params.id)
        .eq('brand_id', currentBrand?.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact'] });
    },
  });
}

export function useLeadEvents(contactId?: string) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ['lead-events', currentBrand?.id, contactId],
    queryFn: async () => {
      if (!currentBrand?.id) return [];

      let query = supabase
        .from('lead_events')
        .select('*')
        .eq('brand_id', currentBrand.id)
        .eq('archived', false)
        .order('received_at', { ascending: false })
        .limit(100);

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!currentBrand?.id,
  });
}
