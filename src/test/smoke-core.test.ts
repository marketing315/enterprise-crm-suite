import { describe, it, expect, vi } from "vitest";

/**
 * Smoke tests for core routing & auth guards.
 * These run on every PR to catch regressions in critical paths.
 * 
 * Risk tier: HIGH (auth, routing)
 */

// Mock modules before imports
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          then: vi.fn(),
        }),
        then: vi.fn(),
      }),
    }),
  },
}));

describe("Smoke: Core Route Definitions", () => {
  it("App module exports a default component", async () => {
    // Verify the App module can be imported without crashing
    const module = await import("@/App");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("critical page modules are importable", async () => {
    // These imports verify that the module graph for core pages is intact.
    // A broken import chain here = broken production build.
    const criticalPages = [
      () => import("@/pages/Login"),
      () => import("@/pages/Dashboard"),
      () => import("@/pages/Pipeline"),
      () => import("@/pages/Tickets"),
      () => import("@/pages/Contacts"),
      () => import("@/pages/Sales"),
      () => import("@/pages/Settings"),
    ];

    const results = await Promise.allSettled(criticalPages.map(fn => fn()));
    
    for (const result of results) {
      expect(result.status).toBe("fulfilled");
      if (result.status === "fulfilled") {
        expect(result.value.default).toBeDefined();
      }
    }
  });
});

describe("Smoke: Auth Context Contract", () => {
  it("AuthProvider module exports expected symbols", async () => {
    const mod = await import("@/contexts/AuthContext");
    expect(mod.AuthProvider).toBeDefined();
    expect(mod.useAuth).toBeDefined();
  });

  it("BrandProvider module exports expected symbols", async () => {
    const mod = await import("@/contexts/BrandContext");
    expect(mod.BrandProvider).toBeDefined();
    expect(mod.useBrand).toBeDefined();
  });
});

describe("Smoke: ProtectedRoute module", () => {
  it("exports ProtectedRoute component", async () => {
    const mod = await import("@/components/auth/ProtectedRoute");
    expect(mod.ProtectedRoute).toBeDefined();
  });
});
