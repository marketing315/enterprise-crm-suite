import { describe, expect, it } from "vitest";
import { validatePin } from "@/lib/biometric/pin-policy";

describe("biometric pin-policy", () => {
  it("rejects non-6-digit values", () => {
    expect(validatePin("").ok).toBe(false);
    expect(validatePin("12345").ok).toBe(false);
    expect(validatePin("1234567").ok).toBe(false);
    expect(validatePin("12345a").ok).toBe(false);
  });

  it("rejects all-same digits", () => {
    expect(validatePin("000000").ok).toBe(false);
    expect(validatePin("777777").ok).toBe(false);
  });

  it("rejects trivial sequences", () => {
    expect(validatePin("123456").ok).toBe(false);
    expect(validatePin("654321").ok).toBe(false);
    expect(validatePin("567890").ok).toBe(false);
    expect(validatePin("098765").ok).toBe(false);
  });

  it("accepts a reasonable PIN", () => {
    expect(validatePin("249103").ok).toBe(true);
    expect(validatePin("814062").ok).toBe(true);
  });
});
