/**
 * Re-exports the main Supabase client cast to `any` for tables
 * not yet present in the generated types.
 *
 * IMPORTANT: This is intentionally the SAME client instance used by the
 * typed import (`@/integrations/supabase/client`).  A second
 * `createClient()` would create an independent auth session that
 * drifts out of sync after token refresh (~1 h), causing silent 401s.
 *
 *   import { untypedClient } from "@/integrations/supabase/untypedClient";
 */
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const untypedClient = supabase as any;
