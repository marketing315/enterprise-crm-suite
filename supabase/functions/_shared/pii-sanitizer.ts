// _shared/pii-sanitizer.ts
// C4 — Sanitize/pseudonymize PII fields in outbound webhook payloads.
//
// Two strategies:
//  - "redact": replace value with null
//  - "pseudonymize": HMAC-SHA256(value, secret) → stable across runs for the
//    same secret, irreversible, suitable for downstream dedup without exposing PII.

const PII_FIELDS = new Set<string>([
  "email",
  "phone",
  "phone_normalized",
  "first_name",
  "last_name",
  "full_name",
  "address",
  "tax_id",
  "iban",
  "fiscal_code",
  "codice_fiscale",
]);

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sanitizePiiPayload(
  payload: Record<string, unknown>,
  opts: { strategy?: "redact" | "pseudonymize"; secret?: string } = {},
): Promise<{ payload: Record<string, unknown>; redactedFields: string[] }> {
  const strategy = opts.strategy ?? "pseudonymize";
  const secret = opts.secret ?? "";
  const redacted: string[] = [];

  async function walk(obj: unknown): Promise<unknown> {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
      const out = [];
      for (const item of obj) out.push(await walk(item));
      return out;
    }
    if (typeof obj !== "object") return obj;
    const src = obj as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (PII_FIELDS.has(k.toLowerCase()) && v != null && v !== "") {
        redacted.push(k);
        if (strategy === "pseudonymize" && secret) {
          out[k] = `pii:${(await hmacSha256Hex(secret, String(v))).slice(0, 24)}`;
        } else {
          out[k] = null;
        }
      } else if (typeof v === "object" && v !== null) {
        out[k] = await walk(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  const sanitized = (await walk(payload)) as Record<string, unknown>;
  return { payload: sanitized, redactedFields: [...new Set(redacted)] };
}
