import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ResponsiveLayout } from '@/components/layout/ResponsiveLayout';

// Mock all heavy globals/providers used by both layouts so we can isolate the switch.
vi.mock('@/components/contacts/IncomingCallPopup', () => ({
  IncomingCallPopup: () => null,
}));
vi.mock('@/components/auth/IdleTimeoutWatcher', () => ({
  IdleTimeoutWatcher: () => null,
}));
vi.mock('@/components/realtime/RealtimeStaleBanner', () => ({
  RealtimeStaleBanner: () => null,
}));
vi.mock('@/components/onboarding/WelcomeModal', () => ({
  WelcomeModal: () => null,
}));
vi.mock('@/components/onboarding/AppTour', () => ({
  AppTour: () => null,
}));
vi.mock('@/components/mobile/MobileMoreSheet', () => ({
  MobileMoreSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="more-sheet" /> : null,
}));
vi.mock('@/components/mobile/MobileSearch', () => ({
  MobileSearch: ({ open }: { open: boolean }) =>
    open ? <div data-testid="search-sheet" /> : null,
}));

// Stub MainLayout so we don't pull SidebarProvider et al.
vi.mock('@/components/layout/MainLayout', () => ({
  MainLayout: () => <div data-testid="desktop-layout" />,
}));

// Brand context
vi.mock('@/contexts/BrandContext', () => ({
  useBrand: () => ({ currentBrand: { id: 'b1', name: 'Brand Uno' } }),
}));

// Tabs hook: return three tabs (home/search/menu) deterministic
vi.mock('@/hooks/useRoleMobileTabs', async () => {
  const lucide = await import('lucide-react');
  return {
    useRoleMobileTabs: () => [
      { id: 'home', label: 'Home', icon: lucide.LayoutDashboard, path: '/dashboard/overview' },
      { id: 'search', label: 'Cerca', icon: lucide.Search, action: 'search', isPrimaryAction: true },
      { id: 'menu', label: 'Menu', icon: lucide.Menu, action: 'menu' },
    ],
  };
});

const mockUseIsMobile = vi.fn();
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

function renderAt(path = '/dashboard/overview') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ResponsiveLayout />}>
          <Route path="/dashboard/overview" element={<div>Home page</div>} />
          <Route path="/notifications" element={<div>Notifiche page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResponsiveLayout / MobileLayout (F2.4)', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReset();
  });

  it('renders MainLayout on desktop (useIsMobile=false)', () => {
    mockUseIsMobile.mockReturnValue(false);
    renderAt();
    expect(screen.getByTestId('desktop-layout')).toBeInTheDocument();
  });

  it('renders MobileLayout with header, outlet and tab bar on mobile', () => {
    mockUseIsMobile.mockReturnValue(true);
    renderAt();
    expect(screen.queryByTestId('desktop-layout')).not.toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Contenuto principale' })).toBeInTheDocument();
    expect(screen.getByText('Home page')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navigazione principale mobile' })).toBeInTheDocument();
    // Brand surfaces in the header subtitle
    expect(screen.getByText('Brand Uno')).toBeInTheDocument();
  });

  it('opens MobileSearch when tab action="search" is fired', () => {
    mockUseIsMobile.mockReturnValue(true);
    renderAt();
    expect(screen.queryByTestId('search-sheet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerca' }));
    expect(screen.getByTestId('search-sheet')).toBeInTheDocument();
  });

  it('opens MobileMoreSheet when tab action="menu" is fired', () => {
    mockUseIsMobile.mockReturnValue(true);
    renderAt();
    expect(screen.queryByTestId('more-sheet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByTestId('more-sheet')).toBeInTheDocument();
  });

  it('exposes skip-link as the first focusable target', () => {
    mockUseIsMobile.mockReturnValue(true);
    renderAt();
    const link = screen.getByRole('link', { name: 'Vai al contenuto principale' });
    expect(link).toHaveAttribute('href', '#main-content');
  });
});
