import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import type { AppRole } from '@/types/database';

/** Role → dashboard path, ordered by priority (highest first) */
const ROLE_DASHBOARD_MAP: { role: AppRole; path: string }[] = [
  { role: 'admin', path: '/dashboard/admin' },
  { role: 'ceo', path: '/dashboard/ceo' },
  { role: 'responsabile_callcenter', path: '/dashboard/responsabile-callcenter' },
  { role: 'responsabile_venditori', path: '/dashboard/responsabile-venditori' },
  { role: 'amministrazione', path: '/dashboard/admin' },
  { role: 'operatore_callcenter', path: '/dashboard/callcenter' },
  { role: 'venditore', path: '/dashboard/venditore' },
  { role: 'callcenter', path: '/dashboard/callcenter' },
  { role: 'sales', path: '/dashboard/venditore' },
];

/** Default auto-refresh interval (ms) per role */
const ROLE_REFRESH_DEFAULTS: Record<string, number> = {
  admin: 120_000,
  ceo: 120_000,
  amministrazione: 120_000,
  responsabile_callcenter: 60_000,
  responsabile_venditori: 60_000,
  operatore_callcenter: 30_000,
  venditore: 30_000,
  callcenter: 30_000,
  sales: 30_000,
};

export interface RoleDashboardInfo {
  /** Best dashboard path for current user */
  primaryPath: string;
  /** All dashboards user can access */
  availableDashboards: { role: AppRole; path: string; label: string }[];
  /** Default refresh interval in ms */
  defaultRefreshMs: number;
  /** Primary role label */
  primaryRole: AppRole | null;
}

const ROLE_LABELS: Partial<Record<AppRole, string>> = {
  admin: 'Admin',
  ceo: 'CEO',
  responsabile_callcenter: 'Resp. Call Center',
  responsabile_venditori: 'Resp. Venditori',
  amministrazione: 'Amministrazione',
  operatore_callcenter: 'Operatore Call Center',
  venditore: 'Venditore',
  callcenter: 'Call Center',
  sales: 'Sales',
};

/** All possible dashboard views for admin/ceo oversight */
const ALL_DASHBOARD_VIEWS: { role: AppRole; path: string; label: string }[] = [
  { role: 'admin', path: '/dashboard/admin', label: 'Admin' },
  { role: 'ceo', path: '/dashboard/ceo', label: 'CEO' },
  { role: 'responsabile_callcenter', path: '/dashboard/responsabile-callcenter', label: 'Resp. Call Center' },
  { role: 'responsabile_venditori', path: '/dashboard/responsabile-venditori', label: 'Resp. Venditori' },
  { role: 'operatore_callcenter', path: '/dashboard/callcenter', label: 'Operatore Call Center' },
  { role: 'venditore', path: '/dashboard/venditore', label: 'Venditore' },
];

export function useRoleDashboard(): RoleDashboardInfo {
  const { userRoles, isAdmin, isCeo } = useAuth();
  const { currentBrand, isAllBrandsSelected } = useBrand();

  // Collect roles for current brand context
  const activeRoles = new Set<AppRole>();

  if (isAdmin) activeRoles.add('admin');
  if (isCeo) activeRoles.add('ceo');

  if (!isAllBrandsSelected && currentBrand) {
    userRoles
      .filter(r => r.brand_id === currentBrand.id)
      .forEach(r => activeRoles.add(r.role as AppRole));
  } else {
    // Global view: collect all roles
    userRoles.forEach(r => activeRoles.add(r.role as AppRole));
  }

  // Admin and CEO can see ALL dashboard views for oversight
  const canSeeAll = isAdmin || isCeo;

  // Build available dashboards (deduplicated by path)
  const seenPaths = new Set<string>();
  const availableDashboards: RoleDashboardInfo['availableDashboards'] = [];

  if (canSeeAll) {
    // Admin/CEO: show all dashboard views
    for (const entry of ALL_DASHBOARD_VIEWS) {
      if (!seenPaths.has(entry.path)) {
        seenPaths.add(entry.path);
        availableDashboards.push(entry);
      }
    }
  } else {
    // Regular users: only dashboards matching their roles
    for (const entry of ROLE_DASHBOARD_MAP) {
      if (activeRoles.has(entry.role) && !seenPaths.has(entry.path)) {
        seenPaths.add(entry.path);
        availableDashboards.push({
          ...entry,
          label: ROLE_LABELS[entry.role] || entry.role,
        });
      }
    }
  }

  const primary = availableDashboards[0] ?? null;

  return {
    primaryPath: primary?.path ?? '/dashboard/overview',
    availableDashboards,
    defaultRefreshMs: primary ? (ROLE_REFRESH_DEFAULTS[primary.role] ?? 60_000) : 60_000,
    primaryRole: primary?.role ?? null,
  };
}
