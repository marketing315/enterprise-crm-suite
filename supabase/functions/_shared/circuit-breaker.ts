// H7: Persistent circuit breaker for upstream calls.
//
// Backed by `public.circuit_breaker_state` + RPCs `cb_check_state` / `cb_record_outcome`.
// State is shared across edge function invocations (cold starts safe).
//
// Usage:
//   const cb = createCircuitBreaker(supabase, "lead-digest:n8n", { threshold: 5, cooldownSeconds: 120 });
//   const allowed = await cb.allow();
//   if (!allowed.ok) return fallback();
//   try {
//     const res = await fetch(...);
//     await cb.recordSuccess();
//   } catch (e) {
//     await cb.recordFailure(String(e));
//     return fallback();
//   }

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface CircuitBreakerOptions {
  threshold?: number;        // consecutive failures to trip open (default 5)
  cooldownSeconds?: number;  // wait before half_open probe (default 60)
}

export interface CircuitAllowResult {
  ok: boolean;                       // true = call may proceed
  state: "closed" | "open" | "half_open";
  reason?: "open_cooldown";
  nextAttemptAt?: string | null;
}

export interface CircuitBreaker {
  name: string;
  allow(): Promise<CircuitAllowResult>;
  recordSuccess(): Promise<void>;
  recordFailure(error?: string): Promise<void>;
}

export function createCircuitBreaker(
  supabase: SupabaseLike,
  name: string,
  opts: CircuitBreakerOptions = {},
): CircuitBreaker {
  const threshold = opts.threshold ?? 5;
  const cooldown = opts.cooldownSeconds ?? 60;

  return {
    name,
    async allow(): Promise<CircuitAllowResult> {
      try {
        const { data, error } = await supabase.rpc("cb_check_state", { p_name: name });
        if (error || !data) {
          // Fail-safe: if breaker storage is unavailable, allow the call (don't compound the outage).
          return { ok: true, state: "closed" };
        }
        const row = Array.isArray(data) ? data[0] : data;
        const state = (row?.state ?? "closed") as "closed" | "open" | "half_open";
        if (state === "open") {
          return {
            ok: false,
            state,
            reason: "open_cooldown",
            nextAttemptAt: row?.next_attempt_at ?? null,
          };
        }
        return { ok: true, state };
      } catch {
        return { ok: true, state: "closed" };
      }
    },
    async recordSuccess(): Promise<void> {
      try {
        await supabase.rpc("cb_record_outcome", {
          p_name: name,
          p_success: true,
          p_threshold: threshold,
          p_cooldown_seconds: cooldown,
          p_error: null,
        });
      } catch {
        // ignore
      }
    },
    async recordFailure(error?: string): Promise<void> {
      try {
        await supabase.rpc("cb_record_outcome", {
          p_name: name,
          p_success: false,
          p_threshold: threshold,
          p_cooldown_seconds: cooldown,
          p_error: error ?? null,
        });
      } catch {
        // ignore
      }
    },
  };
}
