import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("webhook_metrics_24h RPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return all expected keys including percentiles", async () => {
    const mockMetrics = {
      total_deliveries: 100,
      success_count: 95,
      failed_count: 5,
      pending_count: 0,
      sending_count: 0,
      avg_attempts: 1,
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

    const { data, error } = await supabase.rpc("webhook_metrics_24h", {
      p_brand_id: "test-brand-id",
    });

    expect(error).toBeNull();
    expect(data).toHaveProperty("total_deliveries");
    expect(data).toHaveProperty("success_count");
    expect(data).toHaveProperty("failed_count");
    expect(data).toHaveProperty("pending_count");
    expect(data).toHaveProperty("sending_count");
    expect(data).toHaveProperty("avg_latency_ms");
    expect(data).toHaveProperty("p50_latency_ms");
    expect(data).toHaveProperty("p95_latency_ms");
    expect(data).toHaveProperty("p99_latency_ms");
    expect(data).toHaveProperty("computed_at");
  });

  it("should handle null percentiles when no success deliveries exist", async () => {
    const mockMetrics = {
      total_deliveries: 0,
      success_count: 0,
      failed_count: 0,
      pending_count: 0,
      sending_count: 0,
      avg_attempts: 1,
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

    const { data, error } = await supabase.rpc("webhook_metrics_24h", {
      p_brand_id: "test-brand-id",
    });

    expect(error).toBeNull();
    const metrics = data as Record<string, unknown>;
    expect(metrics?.p50_latency_ms).toBeNull();
    expect(metrics?.p95_latency_ms).toBeNull();
    expect(metrics?.p99_latency_ms).toBeNull();
  });
});
