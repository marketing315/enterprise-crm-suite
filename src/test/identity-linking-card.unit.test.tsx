import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    getUserIdentities: vi.fn(),
    linkIdentity: vi.fn(),
    unlinkIdentity: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: mockAuth },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { IdentityLinkingCard } from "@/components/settings/IdentityLinkingCard";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("IdentityLinkingCard (AC7 — identity linking)", () => {
  it("mostra le identità collegate ricevute da getUserIdentities", async () => {
    mockAuth.getUserIdentities.mockResolvedValue({
      data: {
        identities: [
          { id: "i1", provider: "email", identity_data: { email: "u@e.com" } },
          { id: "i2", provider: "google", identity_data: { email: "u@e.com" } },
        ],
      },
      error: null,
    });
    render(<IdentityLinkingCard />);
    await waitFor(() => expect(screen.getByText(/Google/i)).toBeInTheDocument());
    // Email è linkata → niente bottone "Collega Email" (non è nei SUPPORTED)
    // Google è già linkata → niente "Collega Google"
    expect(screen.queryByRole("button", { name: /Collega Google/i })).toBeNull();
    // Apple non è linkata → deve esserci il bottone
    expect(screen.getByRole("button", { name: /Collega Apple/i })).toBeInTheDocument();
  });

  it("clic su 'Collega Apple' invoca supabase.auth.linkIdentity", async () => {
    mockAuth.getUserIdentities.mockResolvedValue({
      data: { identities: [{ id: "i1", provider: "email", identity_data: {} }] },
      error: null,
    });
    mockAuth.linkIdentity.mockResolvedValue({ data: {}, error: null });
    render(<IdentityLinkingCard />);
    const btn = await screen.findByRole("button", { name: /Collega Apple/i });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(mockAuth.linkIdentity).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "apple" }),
      ),
    );
  });

  it("non chiama unlinkIdentity se c'è una sola identità", async () => {
    mockAuth.getUserIdentities.mockResolvedValue({
      data: { identities: [{ id: "only", provider: "google", identity_data: {} }] },
      error: null,
    });
    render(<IdentityLinkingCard />);
    await screen.findByText(/Google/i);
    // Il bottone unlink non viene renderizzato quando identities.length <= 1
    expect(mockAuth.unlinkIdentity).not.toHaveBeenCalled();
  });

  it("gestisce response vuota senza crash", async () => {
    mockAuth.getUserIdentities.mockResolvedValue({
      data: { identities: [] },
      error: null,
    });
    render(<IdentityLinkingCard />);
    await waitFor(() => expect(screen.getByText(/Nessuna identità/i)).toBeInTheDocument());
  });
});
