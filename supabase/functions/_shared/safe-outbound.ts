// _shared/safe-outbound.ts
// C12 — SSRF guard for outbound fetch.
//
// Validates a target URL against:
//  - https-only (configurable to allow http for explicit local-dev whitelist)
//  - hostname not in BLOCKED_HOSTS
//  - resolved IPs not in private/loopback/link-local/IPv6 ULA ranges
//
// We use Deno.resolveDns when available (edge runtime supports it).
// On platforms where DNS resolution is unavailable, the check falls back to
// rejecting bare IP literals only — but Lovable Cloud runtime supports it.

const PRIVATE_IPV4_CIDRS: Array<[number, number]> = [
  // [network as 32-bit int, prefix bits]
  [ipv4ToInt("10.0.0.0"),       8],
  [ipv4ToInt("172.16.0.0"),    12],
  [ipv4ToInt("192.168.0.0"),   16],
  [ipv4ToInt("127.0.0.0"),      8],
  [ipv4ToInt("169.254.0.0"),   16],
  [ipv4ToInt("100.64.0.0"),    10], // CGNAT
  [ipv4ToInt("0.0.0.0"),        8],
];

const BLOCKED_HOSTS = new Set<string>([
  "metadata.google.internal",
  "metadata.aws.amazon.com",
  "169.254.169.254",
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
]);

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
  const ipInt = ipv4ToInt(ip);
  for (const [net, prefix] of PRIVATE_IPV4_CIDRS) {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    if ((ipInt & mask) === (net & mask)) return true;
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lc = ip.toLowerCase();
  if (lc === "::1" || lc === "::") return true;
  if (lc.startsWith("fc") || lc.startsWith("fd")) return true; // ULA fc00::/7
  if (lc.startsWith("fe8") || lc.startsWith("fe9") || lc.startsWith("fea") || lc.startsWith("feb")) return true; // link-local fe80::/10
  if (lc.startsWith("::ffff:")) {
    // IPv4-mapped IPv6
    const v4 = lc.slice(7);
    return isPrivateIPv4(v4);
  }
  return false;
}

function isPrivateIp(ip: string): boolean {
  return isPrivateIPv4(ip) || isPrivateIPv6(ip);
}

export type SafeUrlError =
  | "non_https"
  | "host_blocked"
  | "private_ip"
  | "dns_failed"
  | "invalid_url";

export interface SafeUrlOk {
  ok: true;
  url: URL;
  ips: string[];
}
export interface SafeUrlFail {
  ok: false;
  error: SafeUrlError;
  detail?: string;
}

export async function assertSafeUrl(
  input: string,
  opts: { allowHttp?: boolean } = {},
): Promise<SafeUrlOk | SafeUrlFail> {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return { ok: false, error: "invalid_url" };
  }

  if (u.protocol !== "https:" && !(opts.allowHttp && u.protocol === "http:")) {
    return { ok: false, error: "non_https", detail: u.protocol };
  }

  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    return { ok: false, error: "host_blocked", detail: host };
  }

  // Bare IP literal: validate directly
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")) {
    if (isPrivateIp(host)) {
      return { ok: false, error: "private_ip", detail: host };
    }
    return { ok: true, url: u, ips: [host] };
  }

  // Resolve DNS
  let ips: string[] = [];
  try {
    const a = await (Deno as unknown as {
      resolveDns?: (h: string, t: "A" | "AAAA") => Promise<string[]>;
    }).resolveDns?.(host, "A").catch(() => []) ?? [];
    const aaaa = await (Deno as unknown as {
      resolveDns?: (h: string, t: "A" | "AAAA") => Promise<string[]>;
    }).resolveDns?.(host, "AAAA").catch(() => []) ?? [];
    ips = [...a, ...aaaa];
  } catch {
    return { ok: false, error: "dns_failed", detail: host };
  }

  if (ips.length === 0) {
    return { ok: false, error: "dns_failed", detail: host };
  }

  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      return { ok: false, error: "private_ip", detail: `${host} → ${ip}` };
    }
  }

  return { ok: true, url: u, ips };
}

// Convenience wrapper: throw on failure with a structured error.
export async function safeFetch(
  input: string,
  init: RequestInit = {},
  opts: { allowHttp?: boolean } = {},
): Promise<Response> {
  const check = await assertSafeUrl(input, opts);
  if (!check.ok) {
    throw new Error(`safe_outbound_blocked:${check.error}:${check.detail ?? ""}`);
  }
  return await fetch(check.url.toString(), init);
}
