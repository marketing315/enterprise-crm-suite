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
  lead_score?: number | null;
  lead_heat_class?: "freddo" | "tiepido" | "caldo" | null;
  lead_score_updated_at?: string | null;
  last_interaction_at?: string | null;
  match_type: string;
}

export type SortField = "updated_at" | "created_at" | "last_interaction_at" | "first_name" | "last_name" | "email" | "lead_score";
export type SortDir = "asc" | "desc";

export interface ContactSearchFilters {
  status?: ContactStatus;
  createdFrom?: Date;
  createdTo?: Date;
  sourceName?: string;
  tagIds?: string[];
  sortBy?: SortField;
  sortDir?: SortDir;
}

export function useContactSearch(
  query: string,
  filters: ContactSearchFilters = {},
  limit = 50,
  offset = 0
) {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();
  const { status, createdFrom, createdTo, sourceName, tagIds, sortBy = "updated_at", sortDir = "desc" } = filters;

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
      sortBy,
      sortDir,
      limit,
      offset,
    ],
    queryFn: async (): Promise<SearchResult[]> => {
      const hasValidBrands = isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand;
      if (!hasValidBrands) return [];

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
        sourceContactIds = [...new Set((sourceData || []).map((d) => d.contact_id).filter(Boolean) as string[])];
        if (sourceContactIds.length === 0) return [];
      }

      if (!query.trim()) {
        let queryBuilder = supabase
          .from("contacts")
          .select(`
            id,
            brand_id,
            first_name,
            last_name,
            email,
            city,
            cap,
            status,
            notes,
            created_at,
            updated_at,
            lead_score,
            lead_heat_class,
            lead_score_updated_at,
            contact_phones(phone_normalized, is_primary, is_active)
          `)
          .order("updated_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (isAllBrandsSelected) {
          queryBuilder = queryBuilder.in("brand_id", allBrandIds);
        } else if (currentBrand) {
          queryBuilder = queryBuilder.eq("brand_id", currentBrand.id);
        }

        if (sourceContactIds) {
          queryBuilder = queryBuilder.in("id", sourceContactIds);
        }

        if (status) {
          queryBuilder = queryBuilder.eq("status", status);
        }

        if (tagIds && tagIds.length > 0) {
          let tagQuery = supabase
            .from("tag_assignments")
            .select("contact_id, tag_id")
            .in("tag_id", tagIds)
            .not("contact_id", "is", null);

          if (isAllBrandsSelected) {
            tagQuery = tagQuery.in("brand_id", allBrandIds);
          } else if (currentBrand) {
            tagQuery = tagQuery.eq("brand_id", currentBrand.id);
          }

          const { data: tagData, error: tagError } = await tagQuery;
          if (tagError) throw tagError;

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

        if (createdFrom) {
          queryBuilder = queryBuilder.gte("created_at", createdFrom.toISOString());
        }
        if (createdTo) {
          const endOfDay = new Date(createdTo);
          endOfDay.setHours(23, 59, 59, 999);
          queryBuilder = queryBuilder.lte("created_at", endOfDay.toISOString());
        }

        const { data, error } = await queryBuilder;
        if (error) throw error;

        return (data || []).map((c) => {
          const phones = c.contact_phones as { phone_normalized: string; is_primary: boolean; is_active: boolean }[] | null;
          const primaryPhone =
            phones?.find((p) => p.is_primary && p.is_active)?.phone_normalized ||
            phones?.find((p) => p.is_active)?.phone_normalized ||
            null;

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
            lead_score: c.lead_score,
            lead_heat_class: c.lead_heat_class,
            lead_score_updated_at: c.lead_score_updated_at,
            match_type: "none",
          };
        });
      }

      const hasClientFilters = !!(status || sourceContactIds || (tagIds && tagIds.length > 0) || createdFrom || createdTo);
      const fetchOffset = hasClientFilters ? 0 : offset;
      const fetchLimit = hasClientFilters ? Math.min(offset + limit * 3, 1000) : limit;

      const { data, error } = await supabase.rpc("search_contacts", {
        p_brand_id: isAllBrandsSelected ? null : currentBrand!.id,
        p_query: query.trim(),
        p_limit: fetchLimit,
        p_offset: fetchOffset,
      });

      if (error) throw error;

      const result = data as unknown as {
        contacts: Array<{
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
        }>;
      } | null;

      let contacts = result?.contacts || [];

      if (status) {
        contacts = contacts.filter((c) => c.status === status);
      }

      if (sourceContactIds) {
        const idSet = new Set(sourceContactIds);
        contacts = contacts.filter((c) => idSet.has(c.id));
      }

      if (tagIds && tagIds.length > 0 && contacts.length > 0) {
        const contactIds = contacts.map((c) => c.id);
        const { data: tagData } = await supabase
          .from("tag_assignments")
          .select("contact_id, tag_id")
          .in("tag_id", tagIds)
          .in("contact_id", contactIds);

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
        contacts = contacts.filter((c) => matchSet.has(c.id));
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

      contacts = hasClientFilters ? contacts.slice(offset, offset + limit) : contacts.slice(0, limit);

      const contactIds = contacts.map((c) => c.id);
      let leadScoreMap = new Map<
        string,
        { lead_score: number | null; lead_heat_class: "freddo" | "tiepido" | "caldo" | null; lead_score_updated_at: string | null }
      >();

      if (contactIds.length > 0) {
        const { data: scoreData, error: scoreError } = await supabase
          .from("contacts")
          .select("id, lead_score, lead_heat_class, lead_score_updated_at")
          .in("id", contactIds);

        if (scoreError) throw scoreError;

        leadScoreMap = new Map(
          (scoreData || []).map((row) => [
            row.id,
            {
              lead_score: row.lead_score,
              lead_heat_class: row.lead_heat_class,
              lead_score_updated_at: row.lead_score_updated_at,
            },
          ])
        );
      }

      return contacts.map((c) => {
        const scoreMeta = leadScoreMap.get(c.id);
        return {
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
          primary_phone: c.phones?.find((p) => p.is_primary)?.phone_normalized || c.phones?.[0]?.phone_normalized || null,
          lead_score: scoreMeta?.lead_score ?? null,
          lead_heat_class: scoreMeta?.lead_heat_class ?? null,
          lead_score_updated_at: scoreMeta?.lead_score_updated_at ?? null,
          match_type: "search",
        };
      });
    },
    enabled: isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand,
    staleTime: 1000 * 30,
  });
}