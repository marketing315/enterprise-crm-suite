import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Phone, UserPlus, Users, Search, AlertCircle, SlidersHorizontal, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useBrand } from '@/contexts/BrandContext';
import { usePaginatedContactSearch } from '@/hooks/usePaginatedContactSearch';
import { useContactsRealtime } from '@/hooks/useContactsRealtime';
import { useLeadSourceNames } from '@/hooks/useLeadSourceNames';
import type { ContactStatus } from '@/types/database';
import { cn } from '@/lib/utils';

import {
  Segmented,
  MobileListItem,
  EmptyState,
  ErrorState,
  MobileListSkeleton,
  ListItemSkeleton,
  PullToRefresh,
  MobileFab,
  type ChipOption,
} from '@/components/mobile';
import { ContactDetailSheet } from '@/components/contacts/ContactDetailSheet';
import { NewContactDialog } from '@/components/contacts/NewContactDialog';
import { ContactStatusBadge } from '@/components/contacts/ContactStatusBadge';
import { TagFilter } from '@/components/tags/TagFilter';
import { DateRangeFilter } from '@/components/contacts/DateRangeFilter';

type StatusValue = ContactStatus | 'all';

const STATUS_OPTIONS: ChipOption<StatusValue>[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'new', label: 'Nuovi' },
  { value: 'active', label: 'Attivi' },
  { value: 'qualified', label: 'Qualificati' },
  { value: 'unqualified', label: 'Non qualificati' },
  { value: 'archived', label: 'Archiviati' },
];

function getInitials(first: string | null, last: string | null, email: string | null): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || '?';
  if (email) return email.charAt(0).toUpperCase();
  return '?';
}

function getDisplayName(first: string | null, last: string | null, email: string | null, phone: string | null): string {
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full || email || phone || 'Senza nome';
}

/**
 * Mobile Contatti (SPEC §6.3, task F4.1).
 *
 * Riusa `usePaginatedContactSearch` (stessa queryKey del desktop) → cache react-query
 * condivisa, zero fetch extra, RLS/RPC invariati. Sostituisce `ContactsTable` su mobile.
 *
 * Composizione:
 *  - Header sticky con titolo + ricerca + Segmented stato
 *  - Lista `MobileListItem` con avatar iniziali, nome, stato/canale come subtitle,
 *    trailing "ultima attività"; swipe action "Chiama" (tel:) quando presente telefono.
 *  - Tap apre `ContactDetailSheet` esistente (gestisce realtime già fatto a livello pagina).
 *  - FAB "Nuovo contatto" che usa `NewContactDialog` (prop `trigger` per stile FAB).
 *  - Infinite scroll via IntersectionObserver sul sentinel.
 *  - Stati skeleton/empty/error gestiti; pull-to-refresh invalida `contact-search`.
 */
export function MobileContactsList() {
  const { isAllBrandsSelected } = useBrand();
  useContactsRealtime();

  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusValue>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [localSearch, setLocalSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: sourceNames = [] } = useLeadSourceNames();

  // Debounce ricerca (300ms — allineato a ContactSearch desktop).
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(localSearch), 300);
    return () => clearTimeout(t);
  }, [localSearch]);

  // Deep-link ?open=<contactId>
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      setSelectedContactId(openId);
      setSheetOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const {
    contacts,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    totalLoaded,
    totalCount,
    isError,
    error,
    refetch,
  } = usePaginatedContactSearch(searchQuery, {
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!hasMore || isLoadingMore || isLoading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, isLoadingMore, isLoading, loadMore]);

  const statusOptions = useMemo(() => STATUS_OPTIONS, []);

  const handleOpen = (id: string) => {
    setSelectedContactId(id);
    setSheetOpen(true);
  };

  const handleContactCreated = (id: string) => {
    setSelectedContactId(id);
    setSheetOpen(true);
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Header sticky */}
      <header
        className={cn(
          'sticky top-0 z-30 px-4 pt-3 pb-2',
          'bg-background/85 backdrop-blur-xl',
          'border-b border-border/40',
          'space-y-2',
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-[17px] font-semibold tracking-tight truncate">Contatti</h1>
          <p className="text-[11px] text-muted-foreground tabular-nums shrink-0">
            {totalLoaded}
            {totalCount ? ` / ${totalCount}` : ''}
          </p>
        </div>

        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            type="search"
            inputMode="search"
            placeholder="Cerca per nome, telefono o email…"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl"
            aria-label="Cerca contatti"
          />
        </div>

        <Segmented<StatusValue>
          options={statusOptions}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filtra per stato"
          size="sm"
        />
      </header>

      {/* Body */}
      <PullToRefresh
        className="flex-1 px-4 pt-3 pb-28"
        invalidateKeys={[['contact-search'], ['contact-count']]}
      >
        {isAllBrandsSelected && (
          <Alert className="mb-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Stai visualizzando contatti di tutti i brand.
            </AlertDescription>
          </Alert>
        )}

        {isError ? (
          <ErrorState
            title="Impossibile caricare i contatti"
            description={error instanceof Error ? error.message : undefined}
            onRetry={() => { void refetch(); }}
          />
        ) : isLoading ? (
          <MobileListSkeleton count={8} />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title={searchQuery ? 'Nessun risultato' : 'Nessun contatto'}
            description={
              searchQuery
                ? 'Prova a modificare i filtri o la ricerca.'
                : 'Aggiungi il primo contatto con il pulsante in basso a destra.'
            }
          />
        ) : (
          <ul className="space-y-2.5" role="list" aria-label="Lista contatti">
            {contacts.map((c) => {
              const name = getDisplayName(c.first_name, c.last_name, c.email, c.primary_phone);
              const initials = getInitials(c.first_name, c.last_name, c.email);
              const phone = c.primary_phone;
              const lastInteraction = c.last_interaction_at
                ? formatDistanceToNow(new Date(c.last_interaction_at), {
                    addSuffix: true,
                    locale: it,
                  })
                : null;

              return (
                <li key={c.id}>
                  <MobileListItem
                    onSelect={() => handleOpen(c.id)}
                    ariaLabel={`Apri ${name}`}
                    leading={
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-semibold text-muted-foreground"
                        aria-hidden="true"
                      >
                        {initials}
                      </div>
                    }
                    title={<span className="truncate">{name}</span>}
                    subtitle={
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ContactStatusBadge status={c.status} />
                        {phone && (
                          <span className="truncate text-muted-foreground tabular-nums">
                            · {phone}
                          </span>
                        )}
                      </div>
                    }
                    trailing={
                      lastInteraction ? (
                        <span className="text-[11px] text-muted-foreground shrink-0 max-w-[80px] truncate text-right">
                          {lastInteraction}
                        </span>
                      ) : undefined
                    }
                    actions={
                      phone
                        ? [
                            {
                              id: 'call',
                              label: 'Chiama',
                              icon: <Phone className="h-4 w-4" aria-hidden="true" />,
                              variant: 'primary',
                              ariaLabel: `Chiama ${name}`,
                              onSelect: () => {
                                window.location.href = `tel:${phone}`;
                              },
                            },
                          ]
                        : undefined
                    }
                  />
                </li>
              );
            })}

            {/* Sentinel + loader infinite scroll */}
            {hasMore && (
              <li ref={sentinelRef} aria-hidden="true" className="pt-2">
                {isLoadingMore && (
                  <div className="space-y-2.5">
                    <ListItemSkeleton />
                    <ListItemSkeleton />
                  </div>
                )}
              </li>
            )}
          </ul>
        )}

        {/* Fonti note (per accessibilità futura/filtri estesi) — usato come hint nascosto */}
        {sourceNames.length === 0 ? null : (
          <span className="sr-only">
            {sourceNames.length} fonti lead disponibili
          </span>
        )}
      </PullToRefresh>

      {/* FAB Nuovo contatto via NewContactDialog (prop trigger) */}
      <NewContactDialog
        onContactCreated={handleContactCreated}
        onDuplicateFound={handleContactCreated}
        trigger={
          <MobileFab
            icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
            label="Nuovo contatto"
            position="bottom-right"
          />
        }
      />

      {/* Detail sheet */}
      <ContactDetailSheet
        contactId={selectedContactId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
