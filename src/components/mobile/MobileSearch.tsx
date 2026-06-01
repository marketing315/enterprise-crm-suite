import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer as DrawerPrimitive } from 'vaul';
import { Search, X, Clock, User, Briefcase, Ticket as TicketIcon, Loader2 } from 'lucide-react';
import { userStorage } from '@/lib/userScopedStorage';
import { cn } from '@/lib/utils';
import {
  useGlobalSearchData,
  RECENT_SEARCHES_KEY,
  RECENT_SEARCHES_MAX,
  type ContactHit,
  type DealHit,
  type TicketHit,
} from '@/components/search/useGlobalSearch';

export interface MobileSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function readRecents(): string[] {
  try {
    const raw = userStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_SEARCHES_MAX);
  } catch {
    return [];
  }
}

function pushRecent(query: string) {
  const q = query.trim();
  if (q.length < 2) return;
  const prev = readRecents();
  const next = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(
    0,
    RECENT_SEARCHES_MAX,
  );
  try {
    userStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

/**
 * MobileSearch — sheet full-screen per la ricerca globale su mobile.
 * Riusa la stessa logica dati di `GlobalSearchDialog` via `useGlobalSearchData`,
 * con: auto-focus input, recenti (userStorage), risultati a touch-target grandi,
 * chiusura con swipe-down (vaul) o tap X. Tastiera virtuale non copre i risultati
 * grazie a `100dvh` + body scrollabile separato dall'header.
 */
export function MobileSearch({ open, onOpenChange }: MobileSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const { enabled, isLoading, noResults, contacts, tickets, deals, debouncedQuery } =
    useGlobalSearchData(query);

  // Reset + load recents su apertura; auto-focus dopo animazione vaul (~250ms)
  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    setRecents(readRecents());
    const t = window.setTimeout(() => inputRef.current?.focus(), 250);
    return () => window.clearTimeout(t);
  }, [open]);

  // Salva la query nei recenti quando l'utente smette di digitare e ci sono risultati
  useEffect(() => {
    if (!enabled || isLoading || noResults) return;
    pushRecent(debouncedQuery);
  }, [enabled, isLoading, noResults, debouncedQuery]);

  const go = (path: string) => {
    pushRecent(debouncedQuery);
    onOpenChange(false);
    navigate(path);
  };

  const clearRecents = () => {
    try {
      userStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([]));
    } catch {
      /* noop */
    }
    setRecents([]);
  };

  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      dismissible
      shouldScaleBackground={false}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm" />
        <DrawerPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex h-[100dvh] flex-col rounded-t-2xl border-t border-border/40 bg-background outline-none',
          )}
          data-testid="mobile-search-root"
        >
          <DrawerPrimitive.Title className="sr-only">Ricerca globale</DrawerPrimitive.Title>
          <DrawerPrimitive.Description className="sr-only">
            Cerca contatti, deal e ticket nel CRM.
          </DrawerPrimitive.Description>

          {/* Header: search input + close */}
          <header className="flex items-center gap-2 border-b border-border/40 bg-background/95 px-3 pt-safe pb-3 backdrop-blur-xl">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca contatti, deal, ticket…"
                aria-label="Cerca contatti, deal, ticket"
                className={cn(
                  'h-11 w-full rounded-xl bg-muted/60 pl-9 pr-3 text-[16px] text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Chiudi ricerca"
              className="press-scale flex h-11 w-11 items-center justify-center rounded-xl text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          {/* Body scrollabile */}
          <div className="flex-1 overflow-y-auto overscroll-contain pb-safe">
            {!enabled && (
              <section className="px-4 py-5" aria-label="Ricerche recenti">
                {recents.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                    <Search className="h-6 w-6 opacity-50" aria-hidden />
                    <p>Inizia a digitare per cercare.</p>
                    <p className="text-xs">Almeno 2 caratteri.</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Recenti
                      </h3>
                      <button
                        type="button"
                        onClick={clearRecents}
                        className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:underline"
                      >
                        Cancella
                      </button>
                    </div>
                    <ul role="list" className="flex flex-col gap-1">
                      {recents.map((r) => (
                        <li key={r} role="listitem">
                          <button
                            type="button"
                            onClick={() => setQuery(r)}
                            className="press-scale flex w-full items-center gap-3 rounded-xl border border-border/40 bg-card px-3 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                            <span className="flex-1 truncate">{r}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {enabled && isLoading && (
              <div
                className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Cerco…
              </div>
            )}

            {enabled && noResults && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground" role="status">
                Nessun risultato per "{debouncedQuery}".
              </div>
            )}

            {enabled && !isLoading && contacts.length > 0 && (
              <ResultGroup label="Contatti">
                {contacts.map((c) => (
                  <ContactRow key={c.id} hit={c} onSelect={() => go(`/contacts?id=${c.id}`)} />
                ))}
              </ResultGroup>
            )}

            {enabled && !isLoading && deals.length > 0 && (
              <ResultGroup label="Deal">
                {deals.map((d) => (
                  <DealRow key={d.id} hit={d} onSelect={() => go(`/pipeline?deal=${d.id}`)} />
                ))}
              </ResultGroup>
            )}

            {enabled && !isLoading && tickets.length > 0 && (
              <ResultGroup label="Ticket">
                {tickets.map((t) => (
                  <TicketRow key={t.id} hit={t} onSelect={() => go(`/tickets?id=${t.id}`)} />
                ))}
              </ResultGroup>
            )}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-3" aria-label={label}>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </h3>
      <ul role="list" className="flex flex-col gap-1">
        {children}
      </ul>
    </section>
  );
}

function RowButton({
  icon,
  primary,
  secondary,
  meta,
  onSelect,
}: {
  icon: React.ReactNode;
  primary: string;
  secondary?: string;
  meta?: string;
  onSelect: () => void;
}) {
  return (
    <li role="listitem">
      <button
        type="button"
        onClick={onSelect}
        className="press-scale flex w-full items-center gap-3 rounded-xl border border-border/40 bg-card px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground"
          aria-hidden
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{primary}</span>
          {secondary && (
            <span className="block truncate text-xs text-muted-foreground">{secondary}</span>
          )}
        </span>
        {meta && (
          <span className="ml-2 shrink-0 text-xs text-muted-foreground tabular-nums">{meta}</span>
        )}
      </button>
    </li>
  );
}

function ContactRow({ hit, onSelect }: { hit: ContactHit; onSelect: () => void }) {
  const name = [hit.first_name, hit.last_name].filter(Boolean).join(' ') || 'Senza nome';
  return (
    <RowButton
      icon={<User className="h-4 w-4" />}
      primary={name}
      secondary={hit.email ?? undefined}
      onSelect={onSelect}
    />
  );
}

function DealRow({ hit, onSelect }: { hit: DealHit; onSelect: () => void }) {
  const contactName = hit.contact
    ? [hit.contact.first_name, hit.contact.last_name].filter(Boolean).join(' ') || 'Senza nome'
    : '—';
  const value =
    typeof hit.value === 'number'
      ? hit.value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
      : undefined;
  return (
    <RowButton
      icon={<Briefcase className="h-4 w-4" />}
      primary={contactName}
      secondary={hit.status ?? undefined}
      meta={value}
      onSelect={onSelect}
    />
  );
}

function TicketRow({ hit, onSelect }: { hit: TicketHit; onSelect: () => void }) {
  return (
    <RowButton
      icon={<TicketIcon className="h-4 w-4" />}
      primary={hit.title ?? 'Senza titolo'}
      meta={hit.status ?? undefined}
      onSelect={onSelect}
    />
  );
}
