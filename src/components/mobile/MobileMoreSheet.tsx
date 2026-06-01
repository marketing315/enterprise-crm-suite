import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, LogOut, Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { useHasMarketingAccess } from '@/hooks/useMarketingAccess';
import { BrandSelector } from '@/components/layout/BrandSelector';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AppRole } from '@/types/database';
import { BottomSheet } from './BottomSheet';
import {
  MOBILE_NAV_SECTIONS,
  MOBILE_MARKETING_ITEMS,
  type MobileNavItem,
  type MobileNavSection,
} from './mobileNavData';

export interface MobileMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface VisibleSection {
  id: string;
  label: string;
  items: MobileNavItem[];
}

/**
 * Bottom sheet con navigazione completa per il mobile shell:
 * ricerca, sezioni IA filtrate per ruolo/brand (stessa logica di `MainLayout`),
 * BrandSelector, tema, profilo, logout.
 */
export function MobileMoreSheet({ open, onOpenChange }: MobileMoreSheetProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, isAdmin, isCeo, hasRole } = useAuth();
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasMarketingAccess = useHasMarketingAccess();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState('');

  const itemAllowed = useCallback(
    (item: MobileNavItem): boolean => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.requiresRole) {
        const ok = item.requiresRole.some((role) => {
          if (role === 'admin') return isAdmin;
          if (role === 'ceo') return isCeo;
          return currentBrand ? hasRole(role as AppRole, currentBrand.id) : false;
        });
        if (!ok) return false;
      }
      return true;
    },
    [isAdmin, isCeo, currentBrand, hasRole],
  );

  const q = query.trim().toLowerCase();

  const visibleSections = useMemo<VisibleSection[]>(() => {
    return MOBILE_NAV_SECTIONS.map((sec: MobileNavSection) => {
      if (sec.adminOnly && !isAdmin) return null;
      if (sec.ceoOrAdminOnly && !(isAdmin || isCeo)) return null;
      const items = sec.items.filter((it) => {
        if (!itemAllowed(it)) return false;
        if (q && !it.label.toLowerCase().includes(q)) return false;
        return true;
      });
      if (items.length === 0) return null;
      return { id: sec.id, label: sec.label, items };
    }).filter((s): s is VisibleSection => s !== null);
  }, [isAdmin, isCeo, itemAllowed, q]);

  const marketingItems = useMemo<MobileNavItem[]>(() => {
    if (!hasMarketingAccess) return [];
    return MOBILE_MARKETING_ITEMS.filter((it) =>
      q ? it.label.toLowerCase().includes(q) : true,
    ).map((it) => ({ ...it, audience: 'daily' as const }));
  }, [hasMarketingAccess, q]);

  const handleNavigate = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const handleLogout = async () => {
    onOpenChange(false);
    await signOut();
    navigate('/login');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const themeOptions: { id: 'light' | 'dark' | 'system'; label: string; icon: LucideIcon }[] = [
    { id: 'light', label: 'Chiaro', icon: Sun },
    { id: 'dark', label: 'Scuro', icon: Moon },
    { id: 'system', label: 'Sistema', icon: Monitor },
  ];
  const currentTheme = (theme ?? 'system') as 'light' | 'dark' | 'system';

  const hasResults = visibleSections.length > 0 || marketingItems.length > 0;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Menu"
      description="Naviga tra le sezioni disponibili per il tuo ruolo"
      className="max-h-[92dvh]"
    >
      <div className="flex flex-col gap-5 pb-4" data-testid="mobile-more-sheet-body">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca nel menu…"
            aria-label="Cerca nel menu"
            className="pl-9 h-11 rounded-xl"
          />
        </div>

        {/* Brand */}
        <section aria-label="Brand attivo" className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Brand</h3>
          <BrandSelector compact />
        </section>

        {/* Nav sections */}
        {hasResults ? (
          <>
            {visibleSections.map((sec) => (
              <NavSection
                key={sec.id}
                label={sec.label}
                items={sec.items}
                currentPath={location.pathname}
                hasBrandSelected={hasBrandSelected}
                onNavigate={handleNavigate}
              />
            ))}
            {marketingItems.length > 0 && (
              <NavSection
                label="Marketing"
                items={marketingItems}
                currentPath={location.pathname}
                hasBrandSelected={hasBrandSelected}
                onNavigate={handleNavigate}
              />
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            Nessun risultato per "{query}".
          </p>
        )}

        {/* Theme */}
        <section aria-label="Tema" className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Aspetto</h3>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
            {themeOptions.map((opt) => {
              const active = currentTheme === opt.id;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(opt.id)}
                  className={cn(
                    'press-scale flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border text-xs transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    active
                      ? 'border-transparent bg-foreground text-background'
                      : 'border-border/60 bg-muted/40 text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Profile + logout */}
        <section aria-label="Account" className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Account</h3>
          <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card p-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user?.avatar_url || undefined} />
              <AvatarFallback>{getInitials(user?.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.full_name || 'Utente'}
              </p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 rounded-xl"
            onClick={handleLogout}
            data-testid="mobile-more-logout"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span>Esci</span>
          </Button>
        </section>
      </div>
    </BottomSheet>
  );
}

interface NavSectionProps {
  label: string;
  items: MobileNavItem[];
  currentPath: string;
  hasBrandSelected: boolean;
  onNavigate: (path: string) => void;
}

function NavSection({ label, items, currentPath, hasBrandSelected, onNavigate }: NavSectionProps) {
  return (
    <section aria-label={label} className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </h3>
      <ul role="list" className="flex flex-col gap-1">
        {items.map((item) => {
          const active =
            currentPath === item.path || currentPath.startsWith(item.path + '/');
          const disabled = !hasBrandSelected && item.path !== '/dashboard';
          const Icon = item.icon;
          return (
            <li key={item.path} role="listitem">
              <button
                type="button"
                onClick={() => onNavigate(item.path)}
                disabled={disabled}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'press-scale flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  active
                    ? 'border-transparent bg-foreground/5 text-foreground'
                    : 'border-border/40 bg-card text-foreground hover:bg-muted/40',
                  disabled && 'opacity-50 pointer-events-none',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    active ? 'bg-primary/10 text-primary' : 'bg-muted/60 text-muted-foreground',
                  )}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
