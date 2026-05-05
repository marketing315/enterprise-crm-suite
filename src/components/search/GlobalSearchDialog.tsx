import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { User, Briefcase, Ticket as TicketIcon, Search } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function escapeIlike(s: string) {
  // Escape % and , and ( ) for use in PostgREST .or() patterns
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

export function GlobalSearchDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { currentBrand } = useBrand();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 200);
  const brandId = currentBrand?.id;
  const enabled = !!brandId && debounced.length >= 2;
  const safe = useMemo(() => escapeIlike(debounced), [debounced]);

  // Reset when closing
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Use server-side full-text search via RPC: matches first_name, last_name,
  // full name "Mario Rossi", email, phone (normalized) and city.
  const contactsQ = useQuery({
    enabled,
    queryKey: ['global-search', 'contacts', brandId, debounced],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_contacts', {
        p_brand_id: brandId!,
        p_query: debounced,
        p_tag_ids: null as unknown as string[],
        p_match_all_tags: false,
        p_limit: 8,
        p_offset: 0,
      });
      if (error) throw error;
      const payload = (data ?? {}) as { contacts?: Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }> };
      return payload.contacts ?? [];
    },
    staleTime: 30_000,
  });

  const ticketsQ = useQuery({
    enabled,
    queryKey: ['global-search', 'tickets', brandId, safe],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, title, status')
        .eq('brand_id', brandId!)
        .ilike('title', `%${safe}%`)
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const dealsQ = useQuery({
    enabled,
    queryKey: ['global-search', 'deals', brandId, debounced],
    queryFn: async () => {
      const ids = (contactsQ.data ?? []).map((c) => c.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from('deals')
        .select('id, value, status, contact_id')
        .eq('brand_id', brandId!)
        .in('contact_id', ids)
        .limit(5);
      if (error) throw error;
      const byId = new Map((contactsQ.data ?? []).map((c) => [c.id, c]));
      return (data ?? []).map((d) => ({
        ...d,
        contact: byId.get(d.contact_id) ?? null,
      }));
    },
    staleTime: 30_000,
  });

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const noResults =
    enabled &&
    !contactsQ.isLoading &&
    !ticketsQ.isLoading &&
    !dealsQ.isLoading &&
    (contactsQ.data?.length ?? 0) === 0 &&
    (ticketsQ.data?.length ?? 0) === 0 &&
    (dealsQ.data?.length ?? 0) === 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Cerca contatti, deal, ticket…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!enabled && (
          <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Search className="h-5 w-5 opacity-50" />
            Inizia a digitare per cercare.
          </div>
        )}

        {noResults && <CommandEmpty>Nessun risultato.</CommandEmpty>}

        {(contactsQ.data?.length ?? 0) > 0 && (
          <CommandGroup heading="Contatti">
            {contactsQ.data!.map((c) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Senza nome';
              return (
                <CommandItem
                  key={c.id}
                  value={`contact-${c.id}-${name}`}
                  onSelect={() => go(`/contacts?id=${c.id}`)}
                >
                  <User className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{name}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {(dealsQ.data?.length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Deal">
              {dealsQ.data!.map((d: any) => {
                const contactName = d.contact
                  ? [d.contact.first_name, d.contact.last_name].filter(Boolean).join(' ')
                  : '—';
                const value =
                  typeof d.value === 'number'
                    ? d.value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
                    : null;
                return (
                  <CommandItem
                    key={d.id}
                    value={`deal-${d.id}-${contactName}`}
                    onSelect={() => go(`/pipeline?deal=${d.id}`)}
                  >
                    <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{contactName}</span>
                    {value && (
                      <span className="ml-2 text-xs text-muted-foreground">{value}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {(ticketsQ.data?.length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Ticket">
              {ticketsQ.data!.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`ticket-${t.id}-${t.title}`}
                  onSelect={() => go(`/tickets?id=${t.id}`)}
                >
                  <TicketIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.status && (
                    <span className="ml-2 text-xs text-muted-foreground">{t.status}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span>↵ apri · esc chiude</span>
        <span className="font-mono">⌘K / Ctrl+K</span>
      </div>
    </CommandDialog>
  );
}
