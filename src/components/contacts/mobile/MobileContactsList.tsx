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
  const { isAllBrandsSelected, brands } = useBrand();
  useContactsRealtime();

  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusValue>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [localSearch, setLocalSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [createdFromDate, setCreatedFromDate] = useState<Date | undefined>();
  const [createdToDate, setCreatedToDate] = useState<Date | undefined>();
  const [brandFilter, setBrandFilter] = useState<string>('all');

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

  const activeFiltersCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (selectedTagIds.length > 0 ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (createdFromDate || createdToDate ? 1 : 0) +
    (isAllBrandsSelected && brandFilter !== 'all' ? 1 : 0);

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
    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    sourceName: sourceFilter === 'all' ? undefined : sourceFilter,
    createdFrom: createdFromDate,
    createdTo: createdToDate,
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

  const visibleContacts = useMemo(() => {
    if (!isAllBrandsSelected || brandFilter === 'all') return contacts;
    return contacts.filter((c) => c.brand_id === brandFilter);
  }, [contacts, isAllBrandsSelected, brandFilter]);

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

        <div className="flex gap-2">
          <div className="relative flex-1">
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
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="relative h-10 w-10 shrink-0 rounded-xl"
                aria-label="Filtri"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[65vh] px-4 pb-6">
              <SheetHeader>
                <SheetTitle>Filtri</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-5 overflow-y-auto pb-4">
                {isAllBrandsSelected && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand</label>
                    <Select value={brandFilter} onValueChange={setBrandFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Filtra per brand" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutti i brand</SelectItem>
                        {brands.map((brand) => (
                          <SelectItem key={brand.id} value={brand.id}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Stato</label>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => setStatusFilter(v as StatusValue)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Filtra per stato" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Tag</label>
                  <TagFilter
                    selectedTagIds={selectedTagIds}
                    onTagsChange={setSelectedTagIds}
                    scope="contact"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Fonte lead</label>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Filtra per fonte" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte le fonti</SelectItem>
                      {sourceNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Data creazione</label>
                  <DateRangeFilter
                    fromDate={createdFromDate}
                    toDate={createdToDate}
                    onFromDateChange={setCreatedFromDate}
                    onToDateChange={setCreatedToDate}
                    label=""
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <Segmented<StatusValue>
          options={statusOptions}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filtra per stato"
          size="sm"
        />

        {/* Active filter chips */}
        {activeFiltersCount > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
            {statusFilter !== 'all' && (
              <Badge variant="secondary" className="shrink-0 gap-1 cursor-pointer" onClick={() => setStatusFilter('all')}>
                Stato: {STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}
                <X className="h-3 w-3" />
              </Badge>
            )}
            {selectedTagIds.map((tagId) => (
              <Badge key={tagId} variant="secondary" className="shrink-0 gap-1 cursor-pointer" onClick={() => setSelectedTagIds(prev => prev.filter(id => id !== tagId))}>
                Tag
                <X className="h-3 w-3" />
              </Badge>
            ))}
            {sourceFilter !== 'all' && (
              <Badge variant="secondary" className="shrink-0 gap-1 cursor-pointer" onClick={() => setSourceFilter('all')}>
                Fonte: {sourceFilter}
                <X className="h-3 w-3" />
              </Badge>
            )}
            {(createdFromDate || createdToDate) && (
              <Badge variant="secondary" className="shrink-0 gap-1 cursor-pointer" onClick={() => { setCreatedFromDate(undefined); setCreatedToDate(undefined); }}>
                Data
                <X className="h-3 w-3" />
              </Badge>
            )}
            {isAllBrandsSelected && brandFilter !== 'all' && (
              <Badge variant="secondary" className="shrink-0 gap-1 cursor-pointer" onClick={() => setBrandFilter('all')}>
                Brand: {brands.find(b => b.id === brandFilter)?.name}
                <X className="h-3 w-3" />
              </Badge>
            )}
          </div>
        )}
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
        ) : visibleContacts.length === 0 ? (
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
            {visibleContacts.map((c) => {
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
