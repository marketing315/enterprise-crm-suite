import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal supabase client mock — we only assert on rpc invocations.
const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { purgeServerSessionData } from "@/lib/session-purge";

describe("F3 — purgeServerSessionData", () => {
  beforeEach(() => {
    rpcMock.mockClear();
  });

  it("no-op when authUserId is missing", async () => {
    await purgeServerSessionData(null);
    await purgeServerSessionData(undefined);
    await purgeServerSessionData("");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("invokes the RPC with auth id and brand id", async () => {
    await purgeServerSessionData("auth-123", "brand-abc");
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("purge_user_session_data", {
      p_auth_user_id: "auth-123",
      p_brand_id: "brand-abc",
    });
  });

  it("passes null brand id when not selected", async () => {
    await purgeServerSessionData("auth-123");
    expect(rpcMock).toHaveBeenCalledWith("purge_user_session_data", {
      p_auth_user_id: "auth-123",
      p_brand_id: null,
    });
  });

  it("never throws when the RPC fails (cron is the safety net)", async () => {
    rpcMock.mockRejectedValueOnce(new Error("network down"));
    await expect(purgeServerSessionData("auth-123")).resolves.toBeUndefined();
  });
});
