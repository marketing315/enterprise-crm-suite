// C6: AI quota & token-budget guard (shared helper)
//
// Wraps `consume_ai_quota` con fail-closed semantics + cap default su max_tokens.
// Ogni edge function AI DEVE:
//   1) chiamare `enforceAiQuota` PRIMA della call al modello
//   2) usare `capMaxTokens(requested, endpoint)` per evitare context bomb
//
// Per system jobs (no JWT), passare `userId: null` → sentinel SYSTEM_USER_ID.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SYSTEM_AI_USER_ID = "00000000-0000-0000-0000-000000000000";

/** Default daily limits per endpoint (request count). */
export const AI_DAILY_LIMITS: Record<string, number> = {
  "ai-chat": 300,
  "ai-agent": 300,
  "ai-classify": 5000,           // system, batch on lead-events
  "ai-tag-deals": 2000,          // system, batch
  "ai-call-proposals": 1000,     // system, on-demand
  "ai-generate-automation": 50,  // user-triggered
  "ai-generate-webhook-mapping": 100, // user-triggered
};

/** Default max_tokens cap per endpoint (model output). */
export const AI_MAX_TOKENS_CAP: Record<string, number> = {
  "ai-chat": 1500,
  "ai-agent": 4096,
  "ai-classify": 800,
  "ai-tag-deals": 600,
  "ai-call-proposals": 1200,
  "ai-generate-automation": 2500,
  "ai-generate-webhook-mapping": 2500,
};

export interface QuotaCheckArgs {
  supabase: SupabaseClient;
  userId: string | null;          // null → system job
  brandId: string;
  endpoint: keyof typeof AI_DAILY_LIMITS | string;
  inputChars: number;
  dailyLimit?: number;
}

export type QuotaResult =
  | { ok: true; remaining: number; used: number; dailyLimit: number }
  | { ok: false; status: 429 | 503; response: Response };

const corsLike = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

/**
 * Returns `{ ok:true, ... }` if quota was consumed.
 * Returns `{ ok:false, response }` ready-to-return on 429/503.
 * Fail-closed: errore RPC → 503 (no abuse silenzioso).
 */
export async function enforceAiQuota(args: QuotaCheckArgs): Promise<QuotaResult> {
  const userId = args.userId ?? SYSTEM_AI_USER_ID;
  const limit = args.dailyLimit ?? AI_DAILY_LIMITS[args.endpoint] ?? 300;

  const { data, error } = await args.supabase.rpc("consume_ai_quota", {
    p_user_id: userId,
    p_brand_id: args.brandId,
    p_endpoint: args.endpoint,
    p_input_chars: Math.max(0, Math.floor(args.inputChars || 0)),
    p_daily_limit: limit,
  });

  if (error) {
    console.error(`[ai-quota] RPC error endpoint=${args.endpoint}:`, error.message);
    return {
      ok: false,
      status: 503,
      response: new Response(
        JSON.stringify({ error: "ai_quota_unavailable", message: "Quota service unavailable, retry later." }),
        { status: 503, headers: corsLike },
      ),
    };
  }

  const q = data as { allowed: boolean; remaining: number; daily_limit: number; used: number };
  if (!q?.allowed) {
    console.warn(`[ai-quota] exceeded user=${userId} brand=${args.brandId} endpoint=${args.endpoint} limit=${q?.daily_limit}`);
    return {
      ok: false,
      status: 429,
      response: new Response(
        JSON.stringify({
          error: "ai_daily_quota_exceeded",
          code: "AI_DAILY_QUOTA_EXCEEDED",
          message: `Limite giornaliero AI raggiunto (${q?.daily_limit ?? limit} richieste).`,
          daily_limit: q?.daily_limit ?? limit,
        }),
        { status: 429, headers: corsLike },
      ),
    };
  }

  return { ok: true, remaining: q.remaining, used: q.used, dailyLimit: q.daily_limit };
}

/** Clamp max_tokens entro il cap configurato per evitare risposte runaway. */
export function capMaxTokens(requested: number | undefined, endpoint: string): number {
  const cap = AI_MAX_TOKENS_CAP[endpoint] ?? 2000;
  if (!requested || requested <= 0) return cap;
  return Math.min(requested, cap);
}
