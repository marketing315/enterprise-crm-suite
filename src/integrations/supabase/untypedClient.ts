/**
 * Shared untyped Supabase client for tables not yet in generated types.
 * 
 * DO NOT create separate createClient() instances in hooks.
 * Import this instead:
 * 
 *   import { untypedClient } from "@/integrations/supabase/untypedClient";
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const untypedClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
