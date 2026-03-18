import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import type { Contact, ContactWithPhones, ContactStatus } from '@/types/database';

/**
 * Default page size for contacts listing.
 * Supabase caps at 1000 rows per request — using an explicit limit
 * prevents silent data truncation for large brands.
 */
const CONTACTS_PAGE_SIZE = 1000;

export function useContacts(status?: ContactStatus, limit: number = CONTACTS_PAGE_SIZE) {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ['contacts', isAllBrandsSelected ? 'all' : currentBrand?.id, status, limit],
    queryFn: async () => {
      if (!isAllBrandsSelected && !currentBrand?.id) return [];
      if (isAllBrandsSelected && allBrandIds.length === 0) return [];

      let query = supabase
        .from('contacts')
        .select(`
          *,
          contact_phones (*)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (isAllBrandsSelected) {
        query = query.in('brand_id', allBrandIds);
      } else {
        query = query.eq('brand_id', currentBrand!.id);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      if (count !== null && count > limit) {
        console.warn(
          `[useContacts] Fetched ${limit}/${count} contacts — results are truncated. Consider paginating.`
        );
      }

      return data as ContactWithPhones[];
    },
    enabled: isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand?.id,
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

  return useMutation({
    mutationFn: async (params: { id: string; updates: Partial<Contact> }) => {
      // Filter by ID only — RLS handles security, no brand filter needed
      const { data, error } = await supabase
        .from('contacts')
        .update(params.updates)
        .eq('id', params.id)
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

  return useMutation({
    mutationFn: async (contactId: string) => {
      // Filter by ID only — RLS handles security, no brand filter needed
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId);

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
