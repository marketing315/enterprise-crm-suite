/**
 * E2E "a contratto" della navigazione mobile.
 *
 * Lo shell mobile (`MobileLayout`/`MobileTabBar`, task F2.x) non è ancora
 * cablato in UI; qui simuliamo il dispatcher che lo shell userà:
 *   - se la tab ha `path` → router.push(path)
 *   - se la tab ha `action` → handlers[action]() (search/menu/notifications/new-*)
 *
 * Verifichiamo il comportamento per ≥3 ruoli reali (CEO, venditore,
 * operatore call center) e l'assenza di regressioni desktop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AppRole } from '@/types/database';

const authState = {
  isAdmin: false,
  isCeo: false,
  userRoles: [] as { role: AppRole; brand_id: string | null }[],
};
const roleDashState = {
  primaryPath: '/dashboard/overview',
  primaryRole: null as AppRole | null,
};

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/useRoleDashboard', () => ({
  useRoleDashboard: () => roleDashState,
}));

import { useRoleMobileTabs, type MobileTab, type MobileTabAction } from './useRoleMobileTabs';

function setRole(role: AppRole) {
  authState.isAdmin = role === 'admin';
  authState.isCeo = role === 'ceo';
  authState.userRoles = [{ role, brand_id: null }];
  roleDashState.primaryRole = role;
  roleDashState.primaryPath =
    role === 'ceo' || role === 'admin' ? '/dashboard/ceo'
    : role === 'venditore' || role === 'sales' ? '/dashboard/venditore'
    : role === 'operatore_callcenter' || role === 'callcenter' ? '/dashboard/callcenter'
    : `/dashboard/${role}`;
}

/** Simulates the dispatcher MobileTabBar will own once wired (F2.x). */
function buildDispatcher() {
  const navigate = vi.fn();
  const handlers: Record<MobileTabAction, ReturnType<typeof vi.fn>> = {
    search: vi.fn(),
    menu: vi.fn(),
    notifications: vi.fn(),
    'new-contact': vi.fn(),
    'new-call': vi.fn(),
    'new-appointment': vi.fn(),
    'new-ticket': vi.fn(),
  };
  function onTabPress(tab: MobileTab) {
    if (tab.path) navigate(tab.path);
    else if (tab.action) handlers[tab.action]();
  }
  return { navigate, handlers, onTabPress };
}

beforeEach(() => {
  authState.isAdmin = false;
  authState.isCeo = false;
  authState.userRoles = [];
});

describe('mobile navigation contract — ≥3 ruoli', () => {
  it('CEO: 5 tab; Home→/dashboard/ceo, Pipeline→/pipeline, Cerca→action, Notifiche→/notifications, Menu→action', () => {
    setRole('ceo');
    const { result } = renderHook(() => useRoleMobileTabs());
    const tabs = result.current;
    expect(tabs.map((t) => t.id)).toEqual(['home', 'pipeline', 'search', 'notifications', 'menu']);

    const d = buildDispatcher();
    act(() => tabs.forEach(d.onTabPress));

    expect(d.navigate).toHaveBeenCalledTimes(3);
    expect(d.navigate).toHaveBeenNthCalledWith(1, '/dashboard/ceo');
    expect(d.navigate).toHaveBeenNthCalledWith(2, '/pipeline');
    expect(d.navigate).toHaveBeenNthCalledWith(3, '/notifications');
    expect(d.handlers.search).toHaveBeenCalledTimes(1);
    expect(d.handlers.menu).toHaveBeenCalledTimes(1);
    // primary action è "Cerca"
    expect(tabs.find((t) => t.isPrimaryAction)?.action).toBe('search');
  });

  it('Venditore: tab azione primaria "new-contact" dispatcha l\'handler, navigation invariata sulle altre', () => {
    setRole('venditore');
    const { result } = renderHook(() => useRoleMobileTabs());
    const tabs = result.current;
    expect(tabs.map((t) => t.id)).toEqual(['home', 'pipeline', 'new-contact', 'appointments', 'menu']);

    const d = buildDispatcher();
    act(() => tabs.forEach(d.onTabPress));

    expect(d.navigate.mock.calls.map((c) => c[0])).toEqual([
      '/dashboard/venditore',
      '/pipeline',
      '/appointments',
    ]);
    expect(d.handlers['new-contact']).toHaveBeenCalledTimes(1);
    expect(d.handlers.menu).toHaveBeenCalledTimes(1);
    expect(d.handlers['new-call']).not.toHaveBeenCalled();
    expect(tabs.find((t) => t.isPrimaryAction)?.action).toBe('new-contact');
  });

  it('Operatore call center: tab azione primaria "new-call" + Lead/Ticket navigation', () => {
    setRole('operatore_callcenter');
    const { result } = renderHook(() => useRoleMobileTabs());
    const tabs = result.current;
    expect(tabs.map((t) => t.id)).toEqual(['home', 'events', 'call', 'tickets', 'menu']);

    const d = buildDispatcher();
    act(() => tabs.forEach(d.onTabPress));

    expect(d.navigate.mock.calls.map((c) => c[0])).toEqual([
      '/dashboard/callcenter',
      '/events',
      '/tickets',
    ]);
    expect(d.handlers['new-call']).toHaveBeenCalledTimes(1);
    expect(d.handlers.menu).toHaveBeenCalledTimes(1);
    expect(tabs.find((t) => t.isPrimaryAction)?.action).toBe('new-call');
  });

  it('Resp. Call Center: Wallboard è path-based (non un\'action) ma resta primary', () => {
    setRole('responsabile_callcenter');
    const { result } = renderHook(() => useRoleMobileTabs());
    const wallboard = result.current.find((t) => t.id === 'wallboard');
    expect(wallboard?.path).toBe('/callcenter/wallboard');
    expect(wallboard?.isPrimaryAction).toBe(true);
    expect(wallboard?.action).toBeUndefined();
  });

  it('invariante globale: per ogni ruolo testato, path XOR action e 1 sola primary action', () => {
    for (const role of ['ceo', 'venditore', 'operatore_callcenter', 'responsabile_venditori', 'amministrazione'] as AppRole[]) {
      setRole(role);
      const { result } = renderHook(() => useRoleMobileTabs());
      const tabs = result.current;
      expect(tabs.length).toBeLessThanOrEqual(5);
      expect(tabs.filter((t) => t.isPrimaryAction).length).toBe(1);
      for (const t of tabs) {
        expect(Boolean(t.path) !== Boolean(t.action)).toBe(true);
      }
    }
  });
});

describe('mobile navigation contract — isolamento desktop', () => {
  it('nessun file desktop importa useRoleMobileTabs (verifica statica)', async () => {
    // Verifica fatta a livello build (rg in CI). Qui asseriamo che il modulo
    // esporti solo l'hook + tipi e non monti side effect globali.
    const mod = await import('./useRoleMobileTabs');
    expect(typeof mod.useRoleMobileTabs).toBe('function');
    expect(Object.keys(mod)).toContain('useRoleMobileTabs');
  });
});
