import type { EffectivePiiRule, MaskStrategy } from "@/hooks/useAuditPiiPolicies";

/**
 * Resolve which masking strategy applies to a given field name based on the
 * effective PII rules for the current user. Returns 'none' when no rule matches.
 */
export function resolveStrategy(fieldName: string, rules: EffectivePiiRule[]): MaskStrategy {
  const lc = fieldName.toLowerCase();
  for (const r of rules) {
    if (lc.includes(r.field_pattern.toLowerCase())) {
      return r.strategy;
    }
  }
  return "none";
}

/**
 * Apply a masking strategy to a primitive value. Non-string values are coerced.
 */
export function applyMask(value: unknown, strategy: MaskStrategy): string {
  if (value === null || value === undefined) return "—";
  const str = typeof value === "string" ? value : JSON.stringify(value);

  switch (strategy) {
    case "none":
      return str;
    case "full":
      return "••••••••";
    case "hash":
      return `#${simpleHash(str)}`;
    case "partial":
      return partialMask(str);
    default:
      return str;
  }
}

/**
 * Partial masking heuristics:
 *  - email: keep first char + domain (j***@example.com)
 *  - phone (digits): show last 4
 *  - generic short strings: first char + ••• + last char
 *  - long strings: first 3 + ••• + last 2
 */
function partialMask(str: string): string {
  if (!str) return "—";

  // Email
  if (str.includes("@")) {
    const [local, domain] = str.split("@");
    const visible = local.slice(0, 1);
    return `${visible}${"•".repeat(Math.max(local.length - 1, 3))}@${domain}`;
  }

  // Phone-like (mostly digits, with possible +/spaces)
  const digits = str.replace(/\D/g, "");
  if (digits.length >= 6 && digits.length / str.length > 0.6) {
    return `••• ••• ${digits.slice(-4)}`;
  }

  // Short strings
  if (str.length <= 4) return `${str.charAt(0)}•••`;

  // Generic
  return `${str.slice(0, 3)}${"•".repeat(Math.min(str.length - 5, 6))}${str.slice(-2)}`;
}

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).slice(0, 8);
}
