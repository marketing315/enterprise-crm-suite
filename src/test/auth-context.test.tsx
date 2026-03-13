import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";

// ── Supabase mock (hoisted) ────────────────────────────────────
const { mockSupabase, mockUnsubscribe } = vi.hoisted(() => {
  const mockUnsubscribe = vi.fn();
  return {
    mockUnsubscribe,
    mockSupabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockImplementation((cb: any) => {
          return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
        }),
        signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
        signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabase,
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
});

describe("AuthContext", () => {
  it("starts with isLoading=true and resolves to false", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("returns null user when no session exists", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.supabaseUser).toBeNull();
  });

  it("sets up auth state listener on mount", async () => {
    renderHook(() => useAuth(), { wrapper });
    expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalledOnce();
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledOnce();
  });

  it("hasRole returns false when no roles", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasRole("admin")).toBe(false);
    expect(result.current.hasRole("ceo")).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isCeo).toBe(false);
  });

  it("signIn calls supabase auth", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.signIn("test@example.com", "password123");
    });
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
    });
  });

  it("signOut clears all state", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.signOut();
    });
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.userRoles).toEqual([]);
    expect(result.current.session).toBeNull();
  });

  it("signUp passes fullName in metadata", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.signUp("test@example.com", "password123", "Mario Rossi");
    });
    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
        password: "password123",
        options: expect.objectContaining({
          data: { full_name: "Mario Rossi" },
        }),
      })
    );
  });

  it("handles getSession error gracefully (B2 fix)", async () => {
    mockSupabase.auth.getSession.mockRejectedValueOnce(new Error("Network error"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });
});
