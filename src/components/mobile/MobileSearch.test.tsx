import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock data hook to avoid hitting Supabase
type Hit = { id: string; first_name: string | null; last_name: string | null; email: string | null };
const state = {
  enabled: false,
  isLoading: false,
  noResults: false,
  contacts: [] as Hit[],
  tickets: [] as { id: string; title: string | null; status: string | null }[],
  deals: [] as Array<{
    id: string;
    value: number | null;
    status: string | null;
    contact_id: string;
    contact: Hit | null;
  }>,
  debouncedQuery: '',
};

vi.mock('@/components/search/useGlobalSearch', async () => {
  const actual = await vi.importActual<typeof import('@/components/search/useGlobalSearch')>(
    '@/components/search/useGlobalSearch',
  );
  return {
    ...actual,
    useGlobalSearchData: () => state,
  };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/lib/userScopedStorage', () => {
  let store: Record<string, string> = {};
  return {
    userStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      __reset: () => {
        store = {};
      },
    },
  };
});

import { MobileSearch } from './MobileSearch';
import { userStorage } from '@/lib/userScopedStorage';

function renderSearch(open = true, onOpenChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MobileSearch open={open} onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.enabled = false;
  state.isLoading = false;
  state.noResults = false;
  state.contacts = [];
  state.tickets = [];
  state.deals = [];
  state.debouncedQuery = '';
  navigateMock.mockReset();
  (userStorage as unknown as { __reset: () => void }).__reset();
});

describe('MobileSearch', () => {
  it('non rende il sheet quando chiuso', () => {
    renderSearch(false);
    expect(screen.queryByTestId('mobile-search-root')).toBeNull();
  });

  it('rende input, placeholder hint e suggerimento iniziale', () => {
    renderSearch();
    expect(screen.getByLabelText('Cerca contatti, deal, ticket')).toBeInTheDocument();
    expect(screen.getByText(/Inizia a digitare per cercare/)).toBeInTheDocument();
  });

  it('auto-focus sull input dopo apertura', async () => {
    renderSearch();
    await waitFor(
      () => expect(document.activeElement).toBe(screen.getByLabelText('Cerca contatti, deal, ticket')),
      { timeout: 1000 },
    );
  });

  it('mostra stato loading', () => {
    state.enabled = true;
    state.isLoading = true;
    state.debouncedQuery = 'ma';
    renderSearch();
    expect(screen.getByRole('status')).toHaveTextContent(/Cerco/);
  });

  it('mostra empty state con la query', () => {
    state.enabled = true;
    state.noResults = true;
    state.debouncedQuery = 'asdfgh';
    renderSearch();
    expect(screen.getByRole('status')).toHaveTextContent(/Nessun risultato.*asdfgh/);
  });

  it('rende gruppi contatti/deal/ticket e naviga al click', () => {
    state.enabled = true;
    state.debouncedQuery = 'rossi';
    state.contacts = [
      { id: 'c1', first_name: 'Mario', last_name: 'Rossi', email: 'mario@example.com' },
    ];
    state.deals = [
      {
        id: 'd1',
        value: 1234.5,
        status: 'open',
        contact_id: 'c1',
        contact: { id: 'c1', first_name: 'Mario', last_name: 'Rossi', email: null },
      },
    ];
    state.tickets = [{ id: 't1', title: 'Problema fattura', status: 'open' }];
    const onOpen = vi.fn();
    renderSearch(true, onOpen);

    expect(screen.getByRole('region', { name: 'Contatti' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Deal' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ticket' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Mario Rossi.*mario@example/ }));
    expect(navigateMock).toHaveBeenCalledWith('/contacts?id=c1');
    expect(onOpen).toHaveBeenCalledWith(false);
  });

  it('mostra i recenti se presenti in storage quando non si digita', () => {
    userStorage.setItem('global-search.recents', JSON.stringify(['rossi', 'fattura']));
    renderSearch();
    const recentsSection = screen.getByRole('region', { name: 'Ricerche recenti' });
    expect(recentsSection).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rossi/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fattura/ })).toBeInTheDocument();
  });

  it('cancella i recenti via bottone "Cancella"', () => {
    userStorage.setItem('global-search.recents', JSON.stringify(['rossi']));
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: 'Cancella' }));
    expect(screen.queryByRole('button', { name: /rossi/ })).toBeNull();
    expect(userStorage.getItem('global-search.recents')).toBe('[]');
  });

  it('chiude lo sheet col bottone X', () => {
    const onOpen = vi.fn();
    renderSearch(true, onOpen);
    fireEvent.click(screen.getByLabelText('Chiudi ricerca'));
    expect(onOpen).toHaveBeenCalledWith(false);
  });

  it('salva nei recenti quando ci sono risultati per la query corrente', async () => {
    state.enabled = true;
    state.debouncedQuery = 'mario';
    state.contacts = [{ id: 'c1', first_name: 'Mario', last_name: 'Rossi', email: null }];
    renderSearch();
    await act(async () => {});
    const saved = JSON.parse(userStorage.getItem('global-search.recents') ?? '[]');
    expect(saved).toContain('mario');
  });
});
