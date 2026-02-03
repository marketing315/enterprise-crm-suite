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
  return useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => {
      if (!contactId) return null;

      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          contact_phones (*),
          lead_events (*)
        `)
        .eq('id', contactId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
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

export function useDeleteContact() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId)
        .eq('brand_id', currentBrand?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact'] });
    },
  });
}

export function useLeadEvents(contactId?: string) {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ['lead-events', isAllBrandsSelected ? 'all' : currentBrand?.id, contactId],
    queryFn: async () => {
      const hasValidBrands = isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand?.id;
      if (!hasValidBrands) return [];

      let query = supabase
        .from('lead_events')
        .select('*')
        .eq('archived', false)
        .order('received_at', { ascending: false })
        .limit(100);

      // Apply brand filter
      if (isAllBrandsSelected) {
        query = query.in('brand_id', allBrandIds);
      } else if (currentBrand?.id) {
        query = query.eq('brand_id', currentBrand.id);
      }

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand?.id,
  });
}

// Get primary phone for a contact
export function useContactPhone(contactId: string | null) {
  return useQuery({
    queryKey: ['contact-phone', contactId],
    queryFn: async () => {
      if (!contactId) return null;

      const { data, error } = await supabase
        .from('contact_phones')
        .select('phone_normalized')
        .eq('contact_id', contactId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data?.phone_normalized || null;
    },
    enabled: !!contactId,
  });
}
