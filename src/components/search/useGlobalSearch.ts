/**
 * Shared hook che incapsula i fetch della ricerca globale (contatti, deal, ticket).
 * Estratto da `GlobalSearchDialog` per essere riusato dal full-screen mobile
 * (`MobileSearch`) senza duplicare la logica brand/RLS/RPC.
 *
 * Stessi contratti: brand effettivo NULL se "Tutti i brand", debounce 200ms,
 * abilitato quando query ≥2 caratteri e brand selezionato.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';

export interface ContactHit {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}
export interface TicketHit {
  id: string;
  title: string | null;
  status: string | null;
}
export interface DealHit {
  id: string;
  value: number | null;
  status: string | null;
  contact_id: string;
  contact: ContactHit | null;
}

function escapeIlike(s: string) {
  return s.replace(/[,()%]/g, ' ').trim();
}

function useDebounced<T>(value: T, delay = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export interface GlobalSearchData {
  enabled: boolean;
  isLoading: boolean;
  noResults: boolean;
  contacts: ContactHit[];
  tickets: TicketHit[];
  deals: DealHit[];
  debouncedQuery: string;
}

export function useGlobalSearchData(query: string): GlobalSearchData {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const debounced = useDebounced(query.trim(), 200);
  const effectiveBrandId = isAllBrandsSelected ? null : (currentBrand?.id ?? null);
  const enabled = !!currentBrand && debounced.length >= 2;
  const safe = useMemo(() => escapeIlike(debounced), [debounced]);

  const contactsQ = useQuery({
    enabled,
    queryKey: ['global-search', 'contacts', effectiveBrandId, debounced],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_contacts', {
        p_brand_id: effectiveBrandId,
        p_query: debounced,
        p_tag_ids: null as unknown as string[],
        p_match_all_tags: false,
        p_limit: 8,
        p_offset: 0,
      });
      if (error) throw error;
      const payload = (data ?? {}) as { contacts?: ContactHit[] };
      return payload.contacts ?? [];
    },
    staleTime: 30_000,
  });

  const ticketsQ = useQuery({
    enabled,
    queryKey: ['global-search', 'tickets', effectiveBrandId, safe],
    queryFn: async () => {
      let q = supabase.from('tickets').select('id, title, status').ilike('title', `%${safe}%`).limit(5);
      if (effectiveBrandId) q = q.eq('brand_id', effectiveBrandId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TicketHit[];
    },
    staleTime: 30_000,
  });

  const dealsQ = useQuery({
    enabled,
    queryKey: ['global-search', 'deals', effectiveBrandId, debounced],
    queryFn: async () => {
      const ids = (contactsQ.data ?? []).map((c) => c.id);
      if (!ids.length) return [] as DealHit[];
      let q = supabase
        .from('deals')
        .select('id, value, status, contact_id')
        .in('contact_id', ids)
        .limit(5);
      if (effectiveBrandId) q = q.eq('brand_id', effectiveBrandId);
      const { data, error } = await q;
      if (error) throw error;
      const byId = new Map((contactsQ.data ?? []).map((c) => [c.id, c]));
      return ((data ?? []) as Array<Omit<DealHit, 'contact'>>).map((d) => ({
        ...d,
        contact: byId.get(d.contact_id) ?? null,
      }));
    },
    staleTime: 30_000,
  });

  const isLoading = contactsQ.isLoading || ticketsQ.isLoading || dealsQ.isLoading;
  const noResults =
    enabled &&
    !isLoading &&
    (contactsQ.data?.length ?? 0) === 0 &&
    (ticketsQ.data?.length ?? 0) === 0 &&
    (dealsQ.data?.length ?? 0) === 0;

  return {
    enabled,
    isLoading,
    noResults,
    contacts: contactsQ.data ?? [],
    tickets: ticketsQ.data ?? [],
    deals: dealsQ.data ?? [],
    debouncedQuery: debounced,
  };
}

/** Storage key per le ricerche recenti — scopate per utente via userStorage. */
export const RECENT_SEARCHES_KEY = 'global-search.recents';
export const RECENT_SEARCHES_MAX = 6;
