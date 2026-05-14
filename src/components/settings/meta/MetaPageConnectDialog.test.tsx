import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * E2E-style integration test for MetaPageConnectDialog when Meta OAuth
 * has NOT been completed for the current brand.
 *
 * Verifies the regression introduced in Sprint Meta Stream 2:
 *   - meta-list-pages risponde 200 con `requires_oauth: true`
 *   - il dialog NON va in blank screen
 *   - viene mostrato il bottone "Connetti Meta (OAuth)"
 *   - la lista pagine resta vuota (no "Nessuna pagina disponibile" alert,
 *     no error destructive alert)
 */

// --- Mocks -----------------------------------------------------------------

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

vi.mock("@/contexts/BrandContext", () => ({
  useBrand: () => ({
    currentBrand: { id: "brand-test-1", name: "Brand Test" },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { MetaPageConnectDialog } from "./MetaPageConnectDialog";

function renderDialog() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MetaPageConnectDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("MetaPageConnectDialog — OAuth not completed", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("mostra il bottone 'Connetti Meta (OAuth)' senza blank screen quando requires_oauth=true", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        pages: [],
        businesses: [],
        ad_accounts: [],
        requires_oauth: true,
        oauth_status: "not_completed",
        message: "Connetti prima Meta via OAuth",
      },
      error: null,
    });

    renderDialog();

    // Titolo del dialog visibile (no blank)
    expect(
      await screen.findByText(/Collega pagina Facebook/i),
    ).toBeInTheDocument();

    // CTA OAuth visibile
    expect(
      await screen.findByRole("button", { name: /Connetti Meta \(OAuth\)/i }),
    ).toBeInTheDocument();

    // Nessun alert destructive di errore
    expect(
      screen.queryByText(/Nessuna pagina disponibile/i),
    ).not.toBeInTheDocument();

    // Nessuna pagina renderizzata
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("mostra il bottone OAuth anche se l'edge ritorna l'errore legacy oauth_not_completed (400)", async () => {
    // Simula il vecchio comportamento (errore 400 wrappato dal SDK Supabase).
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge function returned 400",
        context: {
          json: async () => ({
            error: "oauth_not_completed",
            message: "Connetti prima Meta via OAuth",
          }),
        },
      },
    });

    renderDialog();

    expect(
      await screen.findByRole("button", { name: /Connetti Meta \(OAuth\)/i }),
    ).toBeInTheDocument();

    // Nessuna blank screen / nessun crash di runtime: il titolo è sempre lì.
    expect(screen.getByText(/Collega pagina Facebook/i)).toBeInTheDocument();
  });

  it("mostra l'empty state 'Nessuna pagina disponibile' quando OAuth è completato ma non ci sono pagine", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        pages: [],
        businesses: [],
        ad_accounts: [],
      },
      error: null,
    });

    renderDialog();

    expect(
      await screen.findByText(/Nessuna pagina disponibile/i),
    ).toBeInTheDocument();

    // Il bottone OAuth NON deve comparire in questo caso
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Connetti Meta \(OAuth\)/i }),
      ).not.toBeInTheDocument();
    });
  });
});
