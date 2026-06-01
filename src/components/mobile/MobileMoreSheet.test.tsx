import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Mocks BEFORE importing the SUT ---
const authState = {
  user: { full_name: 'Mario Rossi', email: 'mario@example.com', avatar_url: null } as {
    full_name: string;
    email: string;
    avatar_url: string | null;
  },
  isAdmin: false,
  isCeo: false,
  hasRole: vi.fn(() => false),
  signOut: vi.fn(async () => {}),
};
const brandState = {
  currentBrand: { id: 'b1', name: 'Brand 1' } as { id: string; name: string } | null,
  hasBrandSelected: true,
};
let marketingAccess = false;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));
vi.mock('@/contexts/BrandContext', () => ({
  useBrand: () => brandState,
  SYSTEM_BRAND_ID: '00000000-0000-0000-0000-000000000000',
}));
vi.mock('@/hooks/useMarketingAccess', () => ({
  useHasMarketingAccess: () => marketingAccess,
  useCanSeeMarketingSubmenu: () => false,
}));
vi.mock('@/components/layout/BrandSelector', () => ({
  BrandSelector: () => <div data-testid="brand-selector-mock" />,
}));
const setThemeMock = vi.fn();
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: setThemeMock }),
}));

// Stub navigate so we can assert without exercising real router
const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { MobileMoreSheet } from './MobileMoreSheet';

function renderSheet(open = true, onOpenChange = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <MobileMoreSheet open={open} onOpenChange={onOpenChange} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.isAdmin = false;
  authState.isCeo = false;
  authState.hasRole = vi.fn(() => false);
  authState.signOut = vi.fn(async () => {});
  brandState.currentBrand = { id: 'b1', name: 'Brand 1' };
  brandState.hasBrandSelected = true;
  marketingAccess = false;
  navigateMock.mockReset();
  setThemeMock.mockReset();
});

describe('MobileMoreSheet', () => {
  it('non rende nulla quando chiuso', () => {
    const { container } = renderSheet(false);
    // vaul portal non aperto → niente body con testid
    expect(container.querySelector('[data-testid="mobile-more-sheet-body"]')).toBeNull();
  });

  it('mostra ricerca, brand selector, account e logout', () => {
    renderSheet();
    expect(screen.getByLabelText('Cerca nel menu')).toBeInTheDocument();
    expect(screen.getByTestId('brand-selector-mock')).toBeInTheDocument();
    expect(screen.getByText('Mario Rossi')).toBeInTheDocument();
    expect(screen.getByText('mario@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-more-logout')).toBeInTheDocument();
  });

  it('mostra sezione Quotidiano e nasconde Configurazione per utente non-admin', () => {
    renderSheet();
    expect(screen.getByRole('region', { name: 'Quotidiano' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Configurazione' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Sistema' })).toBeNull();
  });

  it('mostra Configurazione e Sistema per admin', () => {
    authState.isAdmin = true;
    renderSheet();
    expect(screen.getByRole('region', { name: 'Configurazione' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sistema' })).toBeInTheDocument();
  });

  it('filtra i risultati con la ricerca e mostra empty state', () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText('Cerca nel menu'), { target: { value: 'pipeline' } });
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(screen.queryByText('Appuntamenti')).toBeNull();

    fireEvent.change(screen.getByLabelText('Cerca nel menu'), { target: { value: 'xyzqqqq' } });
    expect(screen.getByRole('status')).toHaveTextContent('Nessun risultato');
  });

  it('navigate e chiude lo sheet quando si seleziona una voce', () => {
    const onOpen = vi.fn();
    renderSheet(true, onOpen);
    fireEvent.click(screen.getByRole('button', { name: /Pipeline/ }));
    expect(navigateMock).toHaveBeenCalledWith('/pipeline');
    expect(onOpen).toHaveBeenCalledWith(false);
  });

  it('mostra sezione Marketing quando hasMarketingAccess è true', () => {
    marketingAccess = true;
    renderSheet();
    expect(screen.getByRole('region', { name: 'Marketing' })).toBeInTheDocument();
  });

  it('cambia tema cliccando un option del radiogroup Tema', () => {
    renderSheet();
    const themeGroup = screen.getByRole('radiogroup', { name: 'Tema' });
    fireEvent.click(within(themeGroup).getByRole('radio', { name: /Scuro/ }));
    expect(setThemeMock).toHaveBeenCalledWith('dark');
  });

  it('logout chiama signOut e naviga a /login', async () => {
    const onOpen = vi.fn();
    renderSheet(true, onOpen);
    fireEvent.click(screen.getByTestId('mobile-more-logout'));
    // signOut è async; aspetta microtask
    await Promise.resolve();
    await Promise.resolve();
    expect(authState.signOut).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/login');
    expect(onOpen).toHaveBeenCalledWith(false);
  });

  it('disabilita voci diverse da /dashboard quando nessun brand è selezionato', () => {
    brandState.hasBrandSelected = false;
    renderSheet();
    const pipeline = screen.getByRole('button', { name: /Pipeline/ });
    expect(pipeline).toBeDisabled();
    const dashboard = screen.getByRole('button', { name: /Dashboard/ });
    expect(dashboard).not.toBeDisabled();
  });
});
