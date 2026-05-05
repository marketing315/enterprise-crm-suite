// C4: PII redactor for AI logs / SIEM exports / debug payloads.
// Versioned policy so SIEM consumers can detect format drift.
// Strategy: replace structured PII with type-tagged tokens (e.g. <EMAIL>, <PHONE>).

export const REDACT_POLICY_VERSION = "v1";

// Italian fiscal code (codice fiscale): 6 letters + 2 digits + 1 letter + 2 digits + 1 letter + 3 digits + 1 letter
const CF_RE = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi;
// IBAN (loose): 2 letters + 2 digits + up to 30 alphanumeric
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi;
// Email
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// Phone (E.164 + Italian local): +39..., 39..., 3xx..., or 10-13 digits with optional separators
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{3,4}[\s.-]?\d{0,4}/g;
// Italian VAT (Partita IVA): 11 digits
const PIVA_RE = /\b\d{11}\b/g;
// Credit card-ish 13-19 digits with optional separators
const CC_RE = /\b(?:\d[ -]*?){13,19}\b/g;

const KEY_REDACT_PATTERNS = [
  /password/i, /passwd/i, /secret/i, /token/i, /api[_-]?key/i,
  /authorization/i, /cookie/i, /session/i, /ssn/i, /codice[_-]?fiscale/i,
  /iban/i, /credit[_-]?card/i, /card[_-]?number/i, /cvv/i,
];

function redactString(s: string): string {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(EMAIL_RE, "<EMAIL>")
    .replace(IBAN_RE, "<IBAN>")
    .replace(CF_RE, "<CF>")
    .replace(CC_RE, (m) => (m.replace(/\D/g, "").length >= 13 ? "<CC>" : m))
    .replace(PIVA_RE, "<PIVA>")
    .replace(PHONE_RE, (m) => (m.replace(/\D/g, "").length >= 8 ? "<PHONE>" : m));
}

function shouldRedactKey(key: string): boolean {
  return KEY_REDACT_PATTERNS.some((re) => re.test(key));
}

/**
 * Redact PII from arbitrary JSON-like value. Pure function, returns a new object.
 * Cap depth and node count to avoid pathological inputs.
 */
export function redactPII(value: unknown, opts: { maxDepth?: number; maxNodes?: number } = {}): unknown {
  const maxDepth = opts.maxDepth ?? 8;
  const maxNodes = opts.maxNodes ?? 5000;
  let nodes = 0;

  function walk(v: unknown, depth: number): unknown {
    if (nodes++ > maxNodes) return "<TRUNCATED>";
    if (depth > maxDepth) return "<DEPTH_LIMIT>";
    if (v === null || v === undefined) return v;
    if (typeof v === "string") return redactString(v);
    if (typeof v === "number" || typeof v === "boolean") return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        if (shouldRedactKey(k)) {
          out[k] = "<REDACTED>";
        } else {
          out[k] = walk(child, depth + 1);
        }
      }
      return out;
    }
    return v;
  }

  return walk(value, 0);
}

/**
 * Convenience wrapper for log lines. Returns a JSON-safe object with the policy version embedded
 * so SIEM ingest can validate the redaction contract.
 */
export function redactForLog(payload: unknown): { policy: string; payload: unknown } {
  return {
    policy: REDACT_POLICY_VERSION,
    payload: redactPII(payload),
  };
}
