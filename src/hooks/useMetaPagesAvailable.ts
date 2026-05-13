import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MetaPage {
  id: string;
  name: string;
  category?: string;
  tasks?: string[];
}

export interface MetaBusiness {
  id: string;
  name: string;
}

export interface MetaAdAccount {
  id: string;
  name: string;
  currency?: string;
  status?: number;
}

export interface MetaPagesAvailable {
  pages: MetaPage[];
  businesses: MetaBusiness[];
  ad_accounts: MetaAdAccount[];
  warnings?: Array<{ code?: number; message?: string }>;
}

export interface MetaPagesError {
  error: string;
  message?: string;
  code?: number;
}

/**
 * Lists Meta Pages / Businesses / Ad Accounts available to the authenticated
 * user for a given brand. Requires Meta OAuth completed for that brand.
 */
export function useMetaPagesAvailable(brandId: string | null | undefined, enabled = true) {
  return useQuery<MetaPagesAvailable, MetaPagesError>({
    queryKey: ["meta-pages-available", brandId],
    enabled: enabled && !!brandId,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<MetaPagesAvailable & MetaPagesError>(
        "meta-list-pages",
        { body: { brand_id: brandId } },
      );
      if (error) {
        // Try to extract structured error from edge response
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          try {
            const json = await ctx.json();
            throw json as MetaPagesError;
          } catch {
            // fallthrough
          }
        }
        throw { error: "network", message: error.message } as MetaPagesError;
      }
      if (data && (data as MetaPagesError).error) {
        throw data as MetaPagesError;
      }
      return data as MetaPagesAvailable;
    },
  });
}
