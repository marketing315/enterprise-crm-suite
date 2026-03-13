import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";

// ── Hoisted mocks ──────────────────────────────────────────────
const { mockAuth, mockSupabase } = vi.hoisted(() => ({
  mockAuth: {
    user: null as any,
    userRoles: [] as any[],
    isLoading: false,
    isAdmin: false,
    isCeo: false,
    session: null,
    supabaseUser: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    hasRole: vi.fn().mockReturnValue(false),
  },
  mockSupabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabase,
}));

import { BrandProvider, useBrand, SYSTEM_BRAND_ID } from "@/contexts/BrandContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <BrandProvider>{children}</BrandProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockAuth.user = null;
  mockAuth.isAdmin = false;
  mockAuth.isCeo = false;
  mockAuth.userRoles = [];
});

describe("BrandContext", () => {
  it("returns empty brands when no user", async () => {
    const { result } = renderHook(() => useBrand(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.brands).toEqual([]);
    expect(result.current.currentBrand).toBeNull();
  });

  it("fetches brands when user exists", async () => {
    const mockBrands = [
      { id: "brand-1", name: "Brand A", slug: "a", is_system: false },
      { id: "brand-2", name: "Brand B", slug: "b", is_system: false },
    ];
    mockAuth.user = { id: "user-1" };
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: mockBrands, error: null }),
      }),
    });

    const { result } = renderHook(() => useBrand(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.brands).toHaveLength(2);
  });

  it("separates system brand from regular brands", async () => {
    const mockBrands = [
      { id: SYSTEM_BRAND_ID, name: "System", slug: "system", is_system: true },
      { id: "brand-1", name: "Brand A", slug: "a", is_system: false },
    ];
    mockAuth.user = { id: "user-1" };
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: mockBrands, error: null }),
      }),
    });

    const { result } = renderHook(() => useBrand(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.brands).toHaveLength(1);
    expect(result.current.systemBrand?.id).toBe(SYSTEM_BRAND_ID);
  });

  it("restores brand selection from localStorage", async () => {
    const mockBrands = [
      { id: "brand-1", name: "Brand A", slug: "a", is_system: false },
    ];
    localStorage.setItem("crm_selected_brand_id", "brand-1");
    mockAuth.user = { id: "user-1" };
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: mockBrands, error: null }),
      }),
    });

    const { result } = renderHook(() => useBrand(), { wrapper });
    await waitFor(() => expect(result.current.currentBrand?.id).toBe("brand-1"));
  });

  it("clears invalid stored brand (R08 fix)", async () => {
    localStorage.setItem("crm_selected_brand_id", "non-existent-brand");
    mockAuth.user = { id: "user-1" };
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    const { result } = renderHook(() => useBrand(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentBrand).toBeNull();
    expect(localStorage.getItem("crm_selected_brand_id")).toBeNull();
  });

  it("handles fetch error gracefully", async () => {
    mockAuth.user = { id: "user-1" };
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: null, error: { message: "RLS denied" } }),
      }),
    });

    const { result } = renderHook(() => useBrand(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.brands).toEqual([]);
  });

  it("SYSTEM_BRAND_ID constant matches expected UUID", () => {
    expect(SYSTEM_BRAND_ID).toBe("00000000-0000-0000-0000-000000000000");
  });
});
