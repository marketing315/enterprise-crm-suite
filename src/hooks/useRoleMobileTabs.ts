import { useMemo } from 'react';
import {
  LayoutDashboard,
  GitBranch,
  Search,
  Bell,
  Menu,
  ShoppingCart,
  UserPlus,
  TrendingUp,
  Ticket,
  Monitor,
  CalendarDays,
  Inbox,
  Phone,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleDashboard } from '@/hooks/useRoleDashboard';
import type { AppRole } from '@/types/database';

/**
 * Mobile bottom tab definition. Either navigates to a `path`
 * (router push) or triggers a contextual `action` (sheet/modal owned by the shell).
 */
export type MobileTabAction =
  | 'search'
  | 'menu'
  | 'notifications'
  | 'new-contact'
  | 'new-call'
  | 'new-appointment'
  | 'new-ticket';

export interface MobileTab {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Route to navigate to. Mutually exclusive with `action`. */
  path?: string;
  /** Shell-handled action. Mutually exclusive with `path`. */
  action?: MobileTabAction;
  /** True when this is the central raised FAB-in-bar action. */
  isPrimaryAction?: boolean;
}

/** Roles considered "executive" (CEO/Admin view per SPEC §5). */
const EXECUTIVE_ROLES: AppRole[] = ['admin', 'ceo'];

function pick<T>(...vals: (T | undefined | null | false)[]): T | undefined {
  for (const v of vals) if (v) return v as T;
  return undefined;
}

/**
 * Returns up to 5 mobile bottom tabs for the current role/brand context,
 * matching SPEC §5. Visibility piggybacks on `useRoleDashboard` so it
 * stays aligned with `MainLayout` — this hook never bypasses RBAC.
 */
export function useRoleMobileTabs(): MobileTab[] {
  const { isAdmin, isCeo, userRoles } = useAuth();
  const { primaryPath, primaryRole } = useRoleDashboard();

  return useMemo(() => {
    const homePath = primaryPath || '/dashboard/overview';
    const homeTab: MobileTab = {
      id: 'home',
      label: 'Home',
      icon: LayoutDashboard,
      path: homePath,
    };
    const menuTab: MobileTab = {
      id: 'menu',
      label: 'Menu',
      icon: Menu,
      action: 'menu',
    };
    const notifTab: MobileTab = {
      id: 'notifications',
      label: 'Notifiche',
      icon: Bell,
      path: '/notifications',
    };

    // Highest-priority active role drives the layout.
    const roleSet = new Set<AppRole>(userRoles.map((r) => r.role as AppRole));
    if (isAdmin) roleSet.add('admin');
    if (isCeo) roleSet.add('ceo');

    const role: AppRole | null = pick<AppRole>(
      (isAdmin || isCeo) && (primaryRole ?? 'admin'),
      primaryRole,
      [...roleSet][0],
    ) ?? null;

    // CEO / Admin — executive overview
    if (role && EXECUTIVE_ROLES.includes(role)) {
      return [
        homeTab,
        { id: 'pipeline', label: 'Pipeline', icon: GitBranch, path: '/pipeline' },
        { id: 'search', label: 'Cerca', icon: Search, action: 'search', isPrimaryAction: true },
        notifTab,
        menuTab,
      ];
    }

    switch (role) {
      case 'amministrazione':
        return [
          homeTab,
          { id: 'sales', label: 'Vendite', icon: ShoppingCart, path: '/sales' },
          { id: 'search', label: 'Cerca', icon: Search, action: 'search', isPrimaryAction: true },
          notifTab,
          menuTab,
        ];
      case 'responsabile_venditori':
        return [
          homeTab,
          { id: 'pipeline', label: 'Pipeline', icon: GitBranch, path: '/pipeline' },
          { id: 'new-contact', label: 'Nuovo', icon: UserPlus, action: 'new-contact', isPrimaryAction: true },
          { id: 'perf-sales', label: 'Performance', icon: TrendingUp, path: '/sales/performance-sheet' },
          menuTab,
        ];
      case 'responsabile_callcenter':
        return [
          homeTab,
          { id: 'tickets', label: 'Ticket', icon: Ticket, path: '/tickets' },
          { id: 'wallboard', label: 'Wallboard', icon: Monitor, path: '/callcenter/wallboard', isPrimaryAction: true },
          notifTab,
          menuTab,
        ];
      case 'venditore':
      case 'sales':
        return [
          homeTab,
          { id: 'pipeline', label: 'Pipeline', icon: GitBranch, path: '/pipeline' },
          { id: 'new-contact', label: 'Nuovo', icon: UserPlus, action: 'new-contact', isPrimaryAction: true },
          { id: 'appointments', label: 'Appuntamenti', icon: CalendarDays, path: '/appointments' },
          menuTab,
        ];
      case 'operatore_callcenter':
      case 'callcenter':
        return [
          homeTab,
          { id: 'events', label: 'Lead', icon: Inbox, path: '/events' },
          { id: 'call', label: 'Chiamata', icon: Phone, action: 'new-call', isPrimaryAction: true },
          { id: 'tickets', label: 'Ticket', icon: Ticket, path: '/tickets' },
          menuTab,
        ];
      default:
        return [
          homeTab,
          { id: 'search', label: 'Cerca', icon: Search, action: 'search', isPrimaryAction: true },
          notifTab,
          menuTab,
        ];
    }
  }, [isAdmin, isCeo, userRoles, primaryPath, primaryRole]);
}
