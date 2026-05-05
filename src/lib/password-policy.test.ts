import { describe, it, expect } from "vitest";
import { validatePassword } from "./password-policy";

describe("client password policy (mirror)", () => {
  it("rejects empty / non-string", () => {
    expect(validatePassword("").ok).toBe(false);
    expect(validatePassword(undefined as unknown as string).ok).toBe(false);
  });
  it("rejects short", () => {
    expect(validatePassword("Aa1!short").code).toBe("PASSWORD_TOO_SHORT");
  });
  it("rejects whitespace edges", () => {
    expect(validatePassword(" Abcdef1!ghij").code).toBe("PASSWORD_WHITESPACE_EDGES");
  });
  it("rejects low complexity (only 2 classes)", () => {
    expect(validatePassword("abcdefghijkl").code).toBe("PASSWORD_LOW_COMPLEXITY");
  });
  it("rejects common", () => {
    expect(validatePassword("Password123!").ok).toBe(false);
  });
  it("accepts strong", () => {
    expect(validatePassword("Tr0ub4dor&3xyz").ok).toBe(true);
  });
});
