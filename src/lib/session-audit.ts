/**
 * A6 — Session audit client helper.
 *
 * Best-effort logger for auth/session events. Failures are swallowed:
 * audit must never block the auth flow. Server-side `log_session_event`
 * RPC enforces the actual security boundary (own user only, enum check).
 */
import { supabase } from "@/integrations/supabase/client";

export type SessionEventType =
  | "signin"
  | "signout"
  | "token_refresh"
  | "password_reset"
  | "mfa_enroll"
  | "mfa_challenge_success"
  | "mfa_challenge_failed";

interface LogOptions {
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
}

function getUserAgent(): string {
  if (typeof navigator === "undefined") return "";
  return (navigator.userAgent || "").slice(0, 512);
}

export async function logSessionEvent(
  eventType: SessionEventType,
  options: LogOptions = {},
): Promise<void> {
  try {
    await supabase.rpc("log_session_event", {
      p_event_type: eventType,
      p_ip_address: null, // server-side IP capture would require an edge function; left null
      p_user_agent: getUserAgent(),
      p_session_id: options.sessionId ?? null,
      p_metadata: (options.metadata ?? {}) as never,
    });
  } catch (err) {
    // Best-effort: never throw from audit
    console.warn("[session-audit] log failed", err);
  }
}
