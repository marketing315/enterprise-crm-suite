/**
 * F1 — Safe URL helper.
 *
 * Sanitizza URL provenienti da fonti non fidate (raw_payload webhook, AI,
 * input utente, configurazioni esterne) prima di iniettarli come href/src.
 *
 * Schemi bloccati: javascript:, data:, vbscript:, file:, blob:, about:, intent:,
 * varianti con whitespace/control chars/case mix (es. "JaVaScRiPt:", "java\tscript:").
 *
 * Schemi consentiti per default (web): http, https, mailto, tel, sms.
 *
 * Ritorna `null` (oppure un fallback opzionale) per URL pericolosi.
 */

const DEFAULT_ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:", "sms:"]);

// Pattern di scheme: rimuove control chars + whitespace prima del ":"
// Catturiamo TUTTO ciò che precede il primo ":" che assomiglia a uno scheme valido.
const DANGEROUS_SCHEME_RE = /^(?:[\s\u0000-\u001f\u007f-\u009f]*)(javascript|data|vbscript|file|blob|about|intent)\s*:/i;

export interface SanitizeUrlOptions {
  /** Protocolli consentiti, override del default. Es: ["https:"] */
  allowedProtocols?: string[];
  /** Permette URL relativi (es: "/path", "./x", "../x", "#anchor"). Default true. */
  allowRelative?: boolean;
  /** Valore restituito se l'URL è pericoloso. Default null. */
  fallback?: string | null;
}

/**
 * Restituisce l'URL se sicuro, altrimenti `fallback` (default null).
 */
export function sanitizeUrl(
  raw: unknown,
  opts: SanitizeUrlOptions = {},
): string | null {
  const fallback = opts.fallback ?? null;
  if (typeof raw !== "string") return fallback;
  // Trim e rimozione control chars iniziali (browser normalizzano questi)
  const cleaned = raw.replace(/[\u0000-\u001f\u007f-\u009f]+/g, "").trim();
  if (!cleaned) return fallback;

  // Block dangerous schemes (anche con whitespace/case mix)
  if (DANGEROUS_SCHEME_RE.test(raw) || DANGEROUS_SCHEME_RE.test(cleaned)) {
    return fallback;
  }

  // Relative URL / fragment / query-only
  if (cleaned.startsWith("/") || cleaned.startsWith("#") || cleaned.startsWith("?") ||
      cleaned.startsWith("./") || cleaned.startsWith("../")) {
    return opts.allowRelative === false ? fallback : cleaned;
  }

  const allowed = opts.allowedProtocols
    ? new Set(opts.allowedProtocols.map((p) => (p.endsWith(":") ? p : `${p}:`).toLowerCase()))
    : DEFAULT_ALLOWED_PROTOCOLS;

  // Cerca uno scheme esplicito
  const schemeMatch = cleaned.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!schemeMatch) {
    // Nessuno scheme → trattiamo come relativo se consentito
    return opts.allowRelative === false ? fallback : cleaned;
  }
  const scheme = `${schemeMatch[1].toLowerCase()}:`;
  if (!allowed.has(scheme)) return fallback;

  try {
    // Validazione finale tramite URL parser
    const u = new URL(cleaned);
    if (!allowed.has(u.protocol.toLowerCase())) return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

/**
 * Variante che ritorna sempre una stringa (vuota se non sicura).
 * Utile dentro JSX: `<a href={safeHref(x)}>` evita il warning su null.
 */
export function safeHref(raw: unknown, opts?: SanitizeUrlOptions): string {
  return sanitizeUrl(raw, opts) ?? "";
}
