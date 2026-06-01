import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useRoleMobileTabs, type MobileTab, type MobileTabAction } from '@/hooks/useRoleMobileTabs';

/**
 * `MobileTabBar` — bottom navigation per la shell mobile (SPEC §5).
 * - Si fonda su `useRoleMobileTabs` (≤5 voci, già filtrate per ruolo).
 * - Voce con `isPrimaryAction=true` viene resa come FAB rialzato centrale (token `bg-primary`, `shadow-hero`).
 * - Le tab con `path` navigano; le tab con `action` chiamano `onAction`.
 * - Stato attivo: la rotta corrente matcha esattamente o come prefisso (`/path` o `/path/...`).
 * - Glassmorphism: `bg-background/85 backdrop-blur-xl`, border top, `pb-safe` per evitare home indicator iOS.
 * - Tappabilità: ogni bottone ≥44×44px (`min-h-[56px]` cella). Token semantici, no colori hard-coded.
 *
 * Non monta provider — è puro chrome di navigazione.
 */
export interface MobileTabBarProps {
  /** Tab da renderizzare. Per la versione connessa al ruolo usare `MobileTabBarConnected`. */
  tabs: MobileTab[];
  /** Callback per tab `action` (search/menu/notifications/new-*). */
  onAction?: (action: MobileTabAction) => void;
  className?: string;
}

function isActivePath(current: string, target?: string): boolean {
  if (!target) return false;
  if (current === target) return true;
  return current.startsWith(target + '/');
}

export function MobileTabBar({ tabs, onAction, className }: MobileTabBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleTab = (tab: MobileTab) => {
    if (tab.path) {
      navigate(tab.path);
      return;
    }
    if (tab.action && onAction) onAction(tab.action);
  };

  return (
    <nav
      role="navigation"
      aria-label="Navigazione principale mobile"
      className={cn(
        'sticky bottom-0 inset-x-0 z-40 pb-safe',
        'bg-background/85 backdrop-blur-xl border-t border-border/40',
        className,
      )}
    >
      <ul className="flex items-stretch justify-around px-1">
        {tabs.map((tab) => {
          const active = isActivePath(pathname, tab.path);
          const Icon = tab.icon;
          const isFab = !!tab.isPrimaryAction;

          if (isFab) {
            // FAB centrale: rialzato sopra la barra
            return (
              <li key={tab.id} className="flex-1 flex items-center justify-center -mt-5">
                <button
                  type="button"
                  onClick={() => handleTab(tab)}
                  aria-label={tab.label}
                  className={cn(
                    'press-scale flex h-14 w-14 items-center justify-center rounded-full',
                    'bg-primary text-primary-foreground shadow-hero',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  )}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </button>
              </li>
            );
          }

          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                onClick={() => handleTab(tab)}
                aria-label={tab.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'press-scale w-full flex flex-col items-center justify-center gap-0.5',
                  'min-h-[56px] px-2 py-1.5 rounded-xl',
                  'text-[10px] font-medium leading-none tracking-tight',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative flex items-center justify-center">
                  <Icon
                    className={cn('h-5 w-5 transition-colors', active && 'text-primary')}
                    aria-hidden="true"
                  />
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-2 h-1 w-1 rounded-full bg-primary"
                    />
                  )}
                </span>
                <span className="truncate max-w-[68px]">{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
