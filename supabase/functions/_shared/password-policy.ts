// Shared password policy used by admin endpoints (reset/create user).
// Aligned to OWASP ASVS L2 (≥12 chars, complexity, common-password blacklist).
//
// Note: HIBP (Have I Been Pwned) k-anonymity check should be enabled at the
// Supabase Auth layer via `password_hibp_enabled = true` (see configure_auth).
// This keeps server-side validation deterministic and avoids extra latency
// on every admin reset. We still enforce the 4 rules below regardless.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// Curated list of the most common / breached passwords (lowercased).
// Kept short on purpose: HIBP at the Auth layer covers the long tail.
const COMMON_PASSWORDS = new Set<string>([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "azerty",
  "abc123",
  "abcd1234",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "111111",
  "000000",
  "iloveyou",
  "admin",
  "admin123",
  "administrator",
  "letmein",
  "welcome",
  "welcome1",
  "monkey",
  "dragon",
  "master",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "superman",
  "batman",
  "trustno1",
  "ralph",
  "ralph123",
  "lovable",
  "lovable123",
  "supabase",
  "changeme",
  "changeme123",
  "test1234",
  "test123456",
  "ciao1234",
  "benvenuto",
  "benvenuto1",
  "italia2024",
  "italia2025",
  "italia2026",
  "estate2024",
  "estate2025",
]);

export interface PasswordPolicyResult {
  ok: boolean;
  /** Italian, user-facing message — safe to surface in API responses. */
  error?: string;
  /** Stable code for clients/automations. */
  code?:
    | "PASSWORD_REQUIRED"
    | "PASSWORD_TOO_SHORT"
    | "PASSWORD_TOO_LONG"
    | "PASSWORD_LOW_COMPLEXITY"
    | "PASSWORD_TOO_COMMON"
    | "PASSWORD_WHITESPACE_EDGES";
}

/**
 * Validates a password against the project policy:
 *  - 12..128 chars
 *  - at least 3 of 4 classes: lowercase, uppercase, digit, symbol
 *  - not in the common-password blacklist (case-insensitive, trimmed)
 *  - no leading/trailing whitespace (avoids accidental copy-paste tokens)
 */
export function validatePassword(input: unknown): PasswordPolicyResult {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, code: "PASSWORD_REQUIRED", error: "La password è obbligatoria" };
  }

  if (input !== input.trim()) {
    return {
      ok: false,
      code: "PASSWORD_WHITESPACE_EDGES",
      error: "La password non può iniziare o finire con uno spazio",
    };
  }

  if (input.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      code: "PASSWORD_TOO_SHORT",
      error: `La password deve essere di almeno ${PASSWORD_MIN_LENGTH} caratteri`,
    };
  }

  if (input.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      code: "PASSWORD_TOO_LONG",
      error: `La password non può superare ${PASSWORD_MAX_LENGTH} caratteri`,
    };
  }

  const hasLower = /[a-z]/.test(input);
  const hasUpper = /[A-Z]/.test(input);
  const hasDigit = /\d/.test(input);
  const hasSymbol = /[^A-Za-z0-9]/.test(input);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (classes < 3) {
    return {
      ok: false,
      code: "PASSWORD_LOW_COMPLEXITY",
      error:
        "La password deve contenere almeno 3 tra: lettere minuscole, maiuscole, numeri, simboli",
    };
  }

  if (COMMON_PASSWORDS.has(input.toLowerCase())) {
    return {
      ok: false,
      code: "PASSWORD_TOO_COMMON",
      error: "Questa password è troppo comune, scegline un'altra",
    };
  }

  return { ok: true };
}
