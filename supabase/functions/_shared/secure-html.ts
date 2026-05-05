// H3 — Headers di sicurezza per pagine HTML restituite da edge function (es. OAuth callback).
// CSP strict: nessun JS, frame negato, no referrer outbound.
// Le pagine attuali usano <style> inline -> 'unsafe-inline' per style-src.

export const SECURE_HTML_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};
