import { createClient } from "npm:@supabase/supabase-js@2";
import { checkIpRateLimit, rateLimited429 } from "../_shared/ip-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ServiceCheck {
  name: string;
  status: "healthy" | "degraded" | "down";
  latency_ms: number;
  detail?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // H1: IP rate limit per evitare scraping del check pubblico
  const rl = await checkIpRateLimit(req, { scope: "health-check", maxPerMin: 30 });
  if (!rl.allowed) return rateLimited429(rl.retryAfter);

  const started = performance.now();
  const checks: ServiceCheck[] = [];

  // 1. Database connectivity
  try {
    const t0 = performance.now();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { error } = await supabase.from("brands").select("id").limit(1);
    const latency = Math.round(performance.now() - t0);
    checks.push({
      name: "database",
      status: error ? "down" : latency > 2000 ? "degraded" : "healthy",
      latency_ms: latency,
      detail: error?.message,
    });
  } catch (e) {
    checks.push({
      name: "database",
      status: "down",
      latency_ms: 0,
      detail: String(e),
    });
  }

  // 2. Edge Functions runtime (self-check)
  checks.push({
    name: "edge_runtime",
    status: "healthy",
    latency_ms: Math.round(performance.now() - started),
  });

  // 3. Timestamp (Europe/Rome) for monitoring
  const now = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());

  const overall = checks.every((c) => c.status === "healthy")
    ? "healthy"
    : checks.some((c) => c.status === "down")
      ? "down"
      : "degraded";

  return new Response(
    JSON.stringify({
      status: overall,
      timestamp: now,
      uptime_seconds: Math.round(performance.now() / 1000),
      services: checks,
    }),
    {
      status: overall === "down" ? 503 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
