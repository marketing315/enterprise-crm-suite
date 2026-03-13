import { describe, it, expect } from "vitest";
import { getModuleKeyForRoute } from "@/hooks/useFeatureFlags";

/**
 * Pure function tests for feature flag utilities.
 * No mocking needed — these test deterministic mapping logic.
 */
describe("getModuleKeyForRoute", () => {
  it("maps /chat to chat_team", () => {
    expect(getModuleKeyForRoute("/chat")).toBe("chat_team");
  });

  it("maps /admin/capi to capi_monitor", () => {
    expect(getModuleKeyForRoute("/admin/capi")).toBe("capi_monitor");
  });

  it("maps /ceo-dashboard to ceo_dashboard", () => {
    expect(getModuleKeyForRoute("/ceo-dashboard")).toBe("ceo_dashboard");
  });

  it("maps /azienda to company_finance", () => {
    expect(getModuleKeyForRoute("/azienda")).toBe("company_finance");
  });

  it("maps /azienda/costi to company_finance", () => {
    expect(getModuleKeyForRoute("/azienda/costi")).toBe("company_finance");
  });

  it("returns null for unknown routes", () => {
    expect(getModuleKeyForRoute("/unknown")).toBeNull();
    expect(getModuleKeyForRoute("/pipeline")).toBeNull();
    expect(getModuleKeyForRoute("")).toBeNull();
  });

  it("maps /install to pwa_install", () => {
    expect(getModuleKeyForRoute("/install")).toBe("pwa_install");
  });

  it("maps /admin/callcenter-kpi to callcenter_kpi", () => {
    expect(getModuleKeyForRoute("/admin/callcenter-kpi")).toBe("callcenter_kpi");
  });
});
