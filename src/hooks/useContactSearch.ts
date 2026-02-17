import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { ContactStatus } from "@/types/database";

export interface SearchResult {
  id: string;
  brand_id: string;
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

export interface ContactSearchFilters {
  status?: ContactStatus;
  createdFrom?: Date;
  createdTo?: Date;
  sourceName?: string;
  tagIds?: string[];
}

export function useContactSearch(
  query: string,
  filters: ContactSearchFilters = {},
  limit = 50,
  offset = 0
) {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();
  const { status, createdFrom, createdTo, sourceName, tagIds } = filters;

  return useQuery({
     queryKey: [
      "contact-search", 
      isAllBrandsSelected ? "all" : currentBrand?.id, 
      query, 
      status, 
      createdFrom?.toISOString(), 
      createdTo?.toISOString(),
      sourceName,
      tagIds,
      limit, 
      offset
    ],
    queryFn: async (): Promise<SearchResult[]> => {
      // Check if we have valid brand selection
      const hasValidBrands = isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand;
      if (!hasValidBrands) return [];

      // If source filter is active, get matching contact_ids first
      let sourceContactIds: string[] | null = null;
      if (sourceName) {
        let sourceQuery = supabase
          .from("lead_events")
          .select("contact_id")
          .eq("source_name", sourceName);

        if (isAllBrandsSelected) {
          sourceQuery = sourceQuery.in("brand_id", allBrandIds);
        } else if (currentBrand) {
          sourceQuery = sourceQuery.eq("brand_id", currentBrand.id);
        }

        const { data: sourceData, error: sourceError } = await sourceQuery;
        if (sourceError) throw sourceError;
        sourceContactIds = [...new Set((sourceData || []).map(d => d.contact_id).filter(Boolean) as string[])];
        if (sourceContactIds.length === 0) return [];
      }

      // If no query, fall back to regular listing
      if (!query.trim()) {
        let queryBuilder = supabase
          .from("contacts")
          .select(`
            id, brand_id, first_name, last_name, email, city, cap, status, notes, created_at, updated_at,
            contact_phones(phone_normalized, is_primary, is_active)
          `)
          .order("updated_at", { ascending: false })
          .range(offset, offset + limit - 1);

        // Apply brand filter based on selection mode
        if (isAllBrandsSelected) {
          queryBuilder = queryBuilder.in("brand_id", allBrandIds);
        } else if (currentBrand) {
          queryBuilder = queryBuilder.eq("brand_id", currentBrand.id);
        }

        // Apply source filter
        if (sourceContactIds) {
          queryBuilder = queryBuilder.in("id", sourceContactIds);
        }

        if (status) {
          queryBuilder = queryBuilder.eq("status", status);
        }

        // S02+S03: Apply tag filter server-side with brand scope and DISTINCT count
        if (tagIds && tagIds.length > 0) {
          let tagQuery = supabase
            .from("tag_assignments")
            .select("contact_id, tag_id")
            .in("tag_id", tagIds)
            .not("contact_id", "is", null);

          // S03: scope to brand for performance
          if (isAllBrandsSelected) {
            tagQuery = tagQuery.in("brand_id", allBrandIds);
          } else if (currentBrand) {
            tagQuery = tagQuery.eq("brand_id", currentBrand.id);
          }

          const { data: tagData, error: tagError } = await tagQuery;
          if (tagError) throw tagError;
          // S02: count DISTINCT tags per contact to avoid false positives from duplicates
          const tagSets = new Map<string, Set<string>>();
          for (const r of tagData || []) {
            if (r.contact_id) {
              if (!tagSets.has(r.contact_id)) tagSets.set(r.contact_id, new Set());
              tagSets.get(r.contact_id)!.add(r.tag_id);
            }
          }
          const matchingContactIds = [...tagSets.entries()]
            .filter(([, s]) => s.size >= tagIds.length)
            .map(([id]) => id);
          if (matchingContactIds.length === 0) return [];
          queryBuilder = queryBuilder.in("id", matchingContactIds);
        }

        // Apply date filters
        if (createdFrom) {
          queryBuilder = queryBuilder.gte("created_at", createdFrom.toISOString());
        }
        if (createdTo) {
          // Add one day to include the entire end date
          const endOfDay = new Date(createdTo);
          endOfDay.setHours(23, 59, 59, 999);
          queryBuilder = queryBuilder.lte("created_at", endOfDay.toISOString());
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
            brand_id: c.brand_id,
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

      // S01: For RPC branch with client-side filters, use cursor-style over-fetch.
      // We always fetch from offset 0 with a larger limit to avoid page misalignment.
      const hasClientFilters = !!(status || sourceContactIds || (tagIds && tagIds.length > 0) || createdFrom || createdTo);
      const fetchOffset = hasClientFilters ? 0 : offset;
      // Cap over-fetch to avoid unbounded growth on high pages
      const fetchLimit = hasClientFilters ? Math.min(offset + limit * 3, 1000) : limit;

      const { data, error } = await supabase.rpc("search_contacts", {
        p_brand_id: isAllBrandsSelected ? null : currentBrand!.id,
        p_query: query.trim(),
        p_limit: fetchLimit,
        p_offset: fetchOffset,
      });

      if (error) throw error;

      // Extract contacts from RPC response
      const result = data as unknown as { contacts: Array<{
        id: string;
        brand_id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        city: string | null;
        status: ContactStatus;
        created_at: string;
        updated_at: string;
        phones: Array<{ id: string; phone_normalized: string; is_primary: boolean }> | null;
      }> } | null;

      let contacts = result?.contacts || [];

      // Filter by status
      if (status) {
        contacts = contacts.filter((c) => c.status === status);
      }

      // Filter by source (contact_ids)
      if (sourceContactIds) {
        const idSet = new Set(sourceContactIds);
        contacts = contacts.filter((c) => idSet.has(c.id));
      }

      // S02: Filter by tags — DISTINCT tag count to handle duplicates
      if (tagIds && tagIds.length > 0 && contacts.length > 0) {
        const contactIds = contacts.map(c => c.id);
        const { data: tagData } = await supabase
          .from("tag_assignments")
          .select("contact_id, tag_id")
          .in("tag_id", tagIds)
          .in("contact_id", contactIds);
        // Count DISTINCT tags per contact
        const tagSets = new Map<string, Set<string>>();
        for (const r of tagData || []) {
          if (r.contact_id) {
            if (!tagSets.has(r.contact_id)) tagSets.set(r.contact_id, new Set());
            tagSets.get(r.contact_id)!.add(r.tag_id);
          }
        }
        const matchSet = new Set(
          [...tagSets.entries()].filter(([, s]) => s.size >= tagIds.length).map(([id]) => id)
        );
        contacts = contacts.filter(c => matchSet.has(c.id));
      }
      
      if (createdFrom || createdTo) {
        contacts = contacts.filter((c) => {
          const createdAt = new Date(c.created_at);
          if (createdFrom && createdAt < createdFrom) return false;
          if (createdTo) {
            const endOfDay = new Date(createdTo);
            endOfDay.setHours(23, 59, 59, 999);
            if (createdAt > endOfDay) return false;
          }
          return true;
        });
      }

      // S01: Slice with correct page window after all filters
      contacts = hasClientFilters ? contacts.slice(offset, offset + limit) : contacts.slice(0, limit);

      return contacts.map((c) => ({
        id: c.id,
        brand_id: c.brand_id,
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
    enabled: isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand,
    staleTime: 1000 * 30, // 30 seconds
  });
}