import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { ContactStatus } from "@/types/database";

export interface SearchResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  city: string | null;
  cap: string | null;
  status: ContactStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  primary_phone: string | null;
  match_type: string;
}

export function useContactSearch(
  query: string,
  status?: ContactStatus,
  limit = 50,
  offset = 0
) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["contact-search", currentBrand?.id, query, status, limit, offset],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!currentBrand) return [];

      // If no query, fall back to regular listing
      if (!query.trim()) {
        let queryBuilder = supabase
          .from("contacts")
          .select(`
            id, first_name, last_name, email, city, cap, status, notes, created_at, updated_at,
            contact_phones(phone_normalized, is_primary, is_active)
          `)
          .eq("brand_id", currentBrand.id)
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (status) {
          queryBuilder = queryBuilder.eq("status", status);
        }

        const { data, error } = await queryBuilder;

        if (error) throw error;

        return (data || []).map((c) => {
          const phones = c.contact_phones as { phone_normalized: string; is_primary: boolean; is_active: boolean }[] | null;
          const primaryPhone = phones?.find(p => p.is_primary && p.is_active)?.phone_normalized 
            || phones?.find(p => p.is_active)?.phone_normalized 
            || null;
          return {
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            email: c.email,
            city: c.city,
            cap: c.cap,
            status: c.status as ContactStatus,
            notes: c.notes,
            created_at: c.created_at,
            updated_at: c.updated_at,
            primary_phone: primaryPhone,
            match_type: "none",
          };
        });
      }

      // Use search RPC - returns { contacts, total, limit, offset }
      const { data, error } = await supabase.rpc("search_contacts", {
        p_brand_id: currentBrand.id,
        p_query: query.trim(),
        p_limit: limit,
        p_offset: offset,
      });

      if (error) throw error;

      // Extract contacts from RPC response
      const result = data as unknown as { contacts: Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        city: string | null;
        status: ContactStatus;
        created_at: string;
        updated_at: string;
        phones: Array<{ id: string; phone_normalized: string; is_primary: boolean }> | null;
      }> } | null;

      return (result?.contacts || []).map((c) => ({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        city: c.city,
        cap: null,
        status: c.status,
        notes: null,
        created_at: c.created_at,
        updated_at: c.updated_at,
        primary_phone: c.phones?.find(p => p.is_primary)?.phone_normalized || c.phones?.[0]?.phone_normalized || null,
        match_type: "search",
      }));
    },
    enabled: !!currentBrand,
    staleTime: 1000 * 30, // 30 seconds
  });
}
