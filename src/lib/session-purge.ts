/**
 * F3 — Best-effort server-side purge of session data after logout.
 *
 * Calls the `purge_user_session_data` RPC to revoke audit entries and
 * delete consumed/expired oauth_sessions and idempotency_keys for the
 * outgoing user. The call is intentionally fire-and-forget: any failure
 * (network down, RPC rolled back) MUST NOT block the local signOut UX —
 * the scheduled job `cleanup_session_data_all` is the safety net.
 *
 * Tenant scoping: when a brand is currently selected, we pass it so the
 * purge stays brand-scoped on multi-brand accounts.
 */
import { supabase } from "@/integrations/supabase/client";

export async function purgeServerSessionData(
  authUserId: string | null | undefined,
  brandId: string | null = null,
): Promise<void> {
  if (!authUserId) return;
  try {
    await supabase.rpc("purge_user_session_data" as never, {
      p_auth_user_id: authUserId,
      p_brand_id: brandId,
    } as never);
  } catch (err) {
    // Non-fatal: the cron job will catch leftovers within 15 minutes.
    console.warn("[session-purge] server purge failed (non-fatal):", err);
  }
}
