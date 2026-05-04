// Centralized CORS helpers for Supabase edge functions.
// ------------------------------------------------------------------
// Two modes:
//   - "public":     Access-Control-Allow-Origin: *   (no credentials)
//                   Use for webhook inbound endpoints (Meta/Keplero/etc.),
//                   public health checks, and anything that must be
//                   callable from arbitrary origins.
//
//   - "restricted": Echo the request Origin only if it matches a static
//                   allow-list. Otherwise emit "null" (browser blocks).
//                   Use for admin / management endpoints whose only
//                   legitimate caller is our own frontend.
//
// We never set Access-Control-Allow-Credentials: true together with "*".
// Adding ALLOW_CREDENTIALS for restricted mode is opt-in (cookies only).
//
// CDN safety: when the response varies based on the Origin we add
// `Vary: Origin` so caches don't poison cross-origin responses.

const DEFAULT_ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-internal-token, x-cron-secret";

const DEFAULT_ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

// Static allow-list for restricted mode. Production + Lovable preview hosts.
// Extra origins can be added at runtime via the ALLOWED_ORIGINS env var
// (comma-separated) without redeploying every function.
const STATIC_ALLOWED_ORIGINS: ReadonlyArray<string | RegExp> = [
  // Production custom domain
  "https://crm.gruppobenessere.it",
  // Lovable published app
  "https://ralph-hub.lovable.app",
  // Lovable preview/sandbox subdomains (per-project)
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/,
  // Local development
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
];

function getEnvAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  for (const entry of STATIC_ALLOWED_ORIGINS) {
    if (typeof entry === "string") {
      if (entry === origin) return true;
    } else if (entry.test(origin)) {
      return true;
    }
  }
  for (const entry of getEnvAllowedOrigins()) {
    if (entry === origin) return true;
  }
  return false;
}

export type CorsMode = "public" | "restricted";

export interface CorsOptions {
  /** Override default Access-Control-Allow-Headers list. */
  allowedHeaders?: string;
  /** Override default Access-Control-Allow-Methods list. */
  allowedMethods?: string;
  /** Set Access-Control-Allow-Credentials: true (restricted mode only). */
  allowCredentials?: boolean;
}

/**
 * Build CORS headers for a given request.
 *
 * @param req      The incoming Request (used to read the Origin header)
 * @param mode     "public" (wildcard) or "restricted" (allow-list)
 * @param options  Optional overrides
 */
export function buildCorsHeaders(
  req: Request,
  mode: CorsMode = "public",
  options: CorsOptions = {},
): Record<string, string> {
  const allowedHeaders = options.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS;
  const allowedMethods = options.allowedMethods ?? DEFAULT_ALLOWED_METHODS;

  if (mode === "public") {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": allowedHeaders,
      "Access-Control-Allow-Methods": allowedMethods,
    };
  }

  // restricted
  const origin = req.headers.get("origin") ?? "";
  const allowed = isOriginAllowed(origin);
  const headers: Record<string, string> = {
    // If not allowed, emit "null" so the browser blocks the response.
    // (We never echo an arbitrary Origin.)
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Allow-Methods": allowedMethods,
    "Vary": "Origin",
  };
  if (options.allowCredentials && allowed) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

/**
 * Convenience: handle OPTIONS preflight in one line.
 * Returns a Response if the request is OPTIONS, otherwise null.
 */
export function handlePreflight(
  req: Request,
  mode: CorsMode = "public",
  options: CorsOptions = {},
): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(req, mode, options),
  });
}

/**
 * Returns true if the request Origin is in the restricted allow-list.
 * Useful for additional defense-in-depth checks beyond the CORS header.
 */
export function isAllowedOrigin(req: Request): boolean {
  return isOriginAllowed(req.headers.get("origin") ?? "");
}
