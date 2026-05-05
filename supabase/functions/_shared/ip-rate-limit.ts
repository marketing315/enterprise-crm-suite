// H1 — Helper IP rate limit per webhook pubblici.
// Usa la RPC `consume_ip_rate_limit` (token bucket atomico in DB).

import { createClient } from "npm:@supabase/supabase-js@2";

export function extractClientIp(req: Request): string {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export interface IpRateLimitOptions {
  scope: string;
  identifier?: string;
  maxPerMin?: number;
}

/**
 * Fail-open su errori (RPC down, network) per non bloccare il traffico legittimo.
 * Restituisce { allowed: true } se consentito, { allowed: false, retryAfter } se 429.
 */
export async function checkIpRateLimit(
  req: Request,
  opts: IpRateLimitOptions,
): Promise<{ allowed: boolean; retryAfter?: number; identifier: string }> {
  const identifier = opts.identifier ?? extractClientIp(req);
  const max = opts.maxPerMin ?? 60;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data, error } = await supabase.rpc("consume_ip_rate_limit", {
      p_scope: opts.scope,
      p_identifier: identifier,
      p_max_per_min: max,
    });
    if (error) {
      console.warn("[ip-rate-limit] RPC error fail-open", error.message);
      return { allowed: true, identifier };
    }
    if (data === false) {
      return { allowed: false, retryAfter: 60, identifier };
    }
    return { allowed: true, identifier };
  } catch (e) {
    console.warn("[ip-rate-limit] exception fail-open", String(e));
    return { allowed: true, identifier };
  }
}

export function rateLimited429(retryAfter = 60): Response {
  return new Response(
    JSON.stringify({ error: "rate_limited" }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
