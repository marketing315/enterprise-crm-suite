import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));
vi.mock('@/hooks/useRoleDashboard', () => ({
  useRoleDashboard: () => roleDashState,
}));

import { useRoleMobileTabs } from './useRoleMobileTabs';

function setRole(role: AppRole | null, opts: Partial<typeof authState> = {}) {
  authState.isAdmin = role === 'admin' || !!opts.isAdmin;
  authState.isCeo = role === 'ceo' || !!opts.isCeo;
  authState.userRoles = role ? [{ role, brand_id: null }] : [];
  roleDashState.primaryRole = role;
  roleDashState.primaryPath = role ? `/dashboard/${role}` : '/dashboard/overview';
}

beforeEach(() => {
  setRole(null);
});

describe('useRoleMobileTabs', () => {
  const roles: AppRole[] = [
    'admin',
    'ceo',
    'amministrazione',
    'responsabile_venditori',
    'responsabile_callcenter',
    'venditore',
    'sales',
    'operatore_callcenter',
    'callcenter',
  ];

  it.each(roles)('returns ≤5 coherent tabs for role %s', (role) => {
    setRole(role);
    const { result } = renderHook(() => useRoleMobileTabs());
    const tabs = result.current;

    expect(tabs.length).toBeGreaterThan(0);
    expect(tabs.length).toBeLessThanOrEqual(5);

    // First tab is Home pointing to the role dashboard
    expect(tabs[0].id).toBe('home');
    expect(tabs[0].path).toBe(roleDashState.primaryPath);

    // Last tab is the Menu sheet
    expect(tabs[tabs.length - 1].id).toBe('menu');
    expect(tabs[tabs.length - 1].action).toBe('menu');

    // Exactly one primary action (FAB-in-bar)
    expect(tabs.filter((t) => t.isPrimaryAction).length).toBe(1);

    // Each tab is path-only XOR action-only
    for (const t of tabs) {
      expect(Boolean(t.path) !== Boolean(t.action)).toBe(true);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.icon).toBeTruthy();
    }

    // IDs unique
    const ids = tabs.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('falls back to a minimal layout when no role is active', () => {
    setRole(null);
    const { result } = renderHook(() => useRoleMobileTabs());
    const tabs = result.current;
    expect(tabs.length).toBeLessThanOrEqual(5);
    expect(tabs[0].id).toBe('home');
    expect(tabs[tabs.length - 1].id).toBe('menu');
  });
});
