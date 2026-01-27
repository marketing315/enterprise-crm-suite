import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { ReactNode } from "react";

// Mock supabase client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

// Mock BrandContext
vi.mock("@/contexts/BrandContext", () => ({
  useBrand: () => ({
    currentBrand: { id: "test-brand-id", name: "Test Brand" },
  }),
}));

import { supabase } from "@/integrations/supabase/client";
import { useWebhookMetrics24h } from "@/hooks/useWebhookMetrics";

// Wrapper for react-query using React.createElement (no JSX)
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// Helper to wait for hook to settle
async function waitForHookToSettle(result: { current: { isLoading: boolean } }) {
  const maxAttempts = 50;
  let attempts = 0;
  while (result.current.isLoading && attempts < maxAttempts) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    attempts++;
  }
}

describe("useWebhookMetrics24h", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call webhook_metrics_24h RPC with correct brand_id", async () => {
    const mockMetrics = {
      total_deliveries: 100,
      success_count: 95,
      failed_count: 5,
      pending_count: 0,
      sending_count: 0,
      avg_attempts: 1.5,
      avg_latency_ms: 150,
      p50_latency_ms: 120,
      p95_latency_ms: 280,
      p99_latency_ms: 450,
      computed_at: new Date().toISOString(),
    };

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: mockMetrics,
      error: null,
    } as never);

    const { result } = renderHook(() => useWebhookMetrics24h(), {
      wrapper: createWrapper(),
    });

    await waitForHookToSettle(result);

    // Verify RPC was called with correct function name and parameters
    expect(supabase.rpc).toHaveBeenCalledWith("webhook_metrics_24h", {
      p_brand_id: "test-brand-id",
    });
  });

  it("should return data with all expected fields including percentiles", async () => {
    const mockMetrics = {
      total_deliveries: 100,
      success_count: 95,
      failed_count: 5,
      pending_count: 0,
      sending_count: 0,
      avg_attempts: 1.2,
      avg_latency_ms: 150,
      p50_latency_ms: 120,
      p95_latency_ms: 280,
      p99_latency_ms: 450,
      computed_at: new Date().toISOString(),
    };

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: mockMetrics,
      error: null,
    } as never);

    const { result } = renderHook(() => useWebhookMetrics24h(), {
      wrapper: createWrapper(),
    });

    await waitForHookToSettle(result);

    // Verify type mapping includes all fields
    const data = result.current.data;
    expect(data).toHaveProperty("total_deliveries", 100);
    expect(data).toHaveProperty("success_count", 95);
    expect(data).toHaveProperty("failed_count", 5);
    expect(data).toHaveProperty("avg_attempts", 1.2);
    expect(data).toHaveProperty("avg_latency_ms", 150);
    expect(data).toHaveProperty("p50_latency_ms", 120);
    expect(data).toHaveProperty("p95_latency_ms", 280);
    expect(data).toHaveProperty("p99_latency_ms", 450);
  });

  it("should handle null percentiles when no success deliveries exist", async () => {
    const mockMetrics = {
      total_deliveries: 0,
      success_count: 0,
      failed_count: 0,
      pending_count: 0,
      sending_count: 0,
      avg_attempts: 0,
      avg_latency_ms: null,
      p50_latency_ms: null,
      p95_latency_ms: null,
      p99_latency_ms: null,
      computed_at: new Date().toISOString(),
    };

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: mockMetrics,
      error: null,
    } as never);

    const { result } = renderHook(() => useWebhookMetrics24h(), {
      wrapper: createWrapper(),
    });

    await waitForHookToSettle(result);

    const data = result.current.data;
    expect(data?.p50_latency_ms).toBeNull();
    expect(data?.p95_latency_ms).toBeNull();
    expect(data?.p99_latency_ms).toBeNull();
    expect(data?.avg_latency_ms).toBeNull();
  });
});
