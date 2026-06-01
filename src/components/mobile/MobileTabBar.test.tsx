import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { LayoutDashboard, GitBranch, Search, Bell, Menu } from 'lucide-react';
import { MobileTabBar } from './MobileTabBar';
import type { MobileTab } from '@/hooks/useRoleMobileTabs';

const sampleTabs: MobileTab[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'pipeline', label: 'Pipeline', icon: GitBranch, path: '/pipeline' },
  { id: 'search', label: 'Cerca', icon: Search, action: 'search', isPrimaryAction: true },
  { id: 'notifications', label: 'Notifiche', icon: Bell, path: '/notifications' },
  { id: 'menu', label: 'Menu', icon: Menu, action: 'menu' },
];

function renderAt(path: string, props: Partial<Parameters<typeof MobileTabBar>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MobileTabBar tabs={sampleTabs} {...props} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="location">{loc.pathname}</span>;
}

describe('MobileTabBar', () => {
  it('renderizza tutte le tab fornite', () => {
    renderAt('/dashboard');
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerca' })).toBeInTheDocument();
  });

  it('aria-label nav e role=navigation', () => {
    renderAt('/dashboard');
    expect(screen.getByRole('navigation', { name: 'Navigazione principale mobile' })).toBeInTheDocument();
  });

  it('marca la tab attiva con aria-current=page (match esatto)', () => {
    renderAt('/pipeline');
    const active = screen.getByRole('button', { name: 'Pipeline' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('match anche come prefisso (es. /pipeline/123)', () => {
    renderAt('/pipeline/123');
    expect(screen.getByRole('button', { name: 'Pipeline' })).toHaveAttribute('aria-current', 'page');
  });

  it('click su tab con path naviga', () => {
    renderAt('/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Notifiche' }));
    expect(screen.getByTestId('location').textContent).toBe('/notifications');
  });

  it('click su tab con action invoca onAction', () => {
    const onAction = vi.fn();
    renderAt('/dashboard', { onAction });
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(onAction).toHaveBeenCalledWith('menu');
  });

  it('isPrimaryAction → FAB rialzato con bg-primary e shadow-hero', () => {
    renderAt('/dashboard');
    const fab = screen.getByRole('button', { name: 'Cerca' });
    expect(fab.className).toMatch(/bg-primary/);
    expect(fab.className).toMatch(/shadow-hero/);
    expect(fab.className).toMatch(/rounded-full/);
  });

  it('cella non-FAB ha min-h>=44px (min-h-[56px])', () => {
    renderAt('/dashboard');
    const btn = screen.getByRole('button', { name: 'Home' });
    expect(btn.className).toMatch(/min-h-\[56px\]/);
  });

  it('nav ha pb-safe + backdrop-blur (glassmorphism)', () => {
    renderAt('/dashboard');
    const nav = screen.getByRole('navigation');
    expect(nav.className).toMatch(/pb-safe/);
    expect(nav.className).toMatch(/backdrop-blur-xl/);
    expect(nav.className).toMatch(/sticky/);
  });

  it('tab senza action e senza path non rompe se cliccata', () => {
    const tabs: MobileTab[] = [
      { id: 'noop', label: 'Noop', icon: Menu },
    ];
    render(
      <MemoryRouter>
        <MobileTabBar tabs={tabs} />
      </MemoryRouter>,
    );
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Noop' }))).not.toThrow();
  });
});
