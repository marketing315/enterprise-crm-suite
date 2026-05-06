/**
 * F1 — HTML escape & safe-URL per edge function che assemblano HTML
 * (es. body email transazionali costruiti via string concat).
 *
 * Dove possibile preferire i template react-email; questo helper è il
 * fallback per le code-paths legacy che ancora costruiscono HTML inline.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/[&<>"'`=\/]/g, (c) => HTML_ESCAPE_MAP[c]);
}

const SAFE_HREF_RE = /^(https?:|mailto:|tel:)/i;
const DANGEROUS_SCHEME_RE = /^[\s\u0000-\u001f\u007f-\u009f]*(javascript|data|vbscript|file|blob|about|intent)\s*:/i;

/**
 * Restituisce un href sicuro per <a href="...">.
 * - Bloccato → ritorna "#"
 * - Permessi: http(s), mailto, tel
 * - Sempre HTML-escaped
 */
export function safeHrefHtml(raw: unknown): string {
  if (typeof raw !== "string") return "#";
  const cleaned = raw.replace(/[\u0000-\u001f\u007f-\u009f]+/g, "").trim();
  if (!cleaned) return "#";
  if (DANGEROUS_SCHEME_RE.test(raw) || DANGEROUS_SCHEME_RE.test(cleaned)) return "#";
  if (!SAFE_HREF_RE.test(cleaned)) return "#";
  try {
    const u = new URL(cleaned);
    return escapeHtml(u.toString());
  } catch {
    return "#";
  }
}
