import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

export interface KepleroLookupSetting {
  id: string;
  brand_id: string | null;
  is_enabled: boolean;
  response_profile: string;
  extra_fields: string[];
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface KepleroLookupSecret {
  id: string;
  brand_id: string | null;
  is_active: boolean;
  created_at: string;
  rotated_at: string | null;
}

export function useKepleroLookupSettings() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["keplero-lookup-settings", currentBrand?.id],
    queryFn: async () => {
      // Fetch global + brand-specific settings
      let query = (supabase as any)
        .from("keplero_lookup_settings")
        .select("*")
        .or(`brand_id.is.null${currentBrand?.id ? `,brand_id.eq.${currentBrand.id}` : ""}`)
        .order("brand_id", { ascending: false, nullsFirst: false });

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as KepleroLookupSetting[];
    },
    enabled: true,
  });
}

export function useKepleroLookupSecrets() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["keplero-lookup-secrets", currentBrand?.id],
    queryFn: async () => {
      let query = (supabase as any)
        .from("keplero_lookup_secrets")
        .select("id, brand_id, is_active, created_at, rotated_at")
        .or(`brand_id.is.null${currentBrand?.id ? `,brand_id.eq.${currentBrand.id}` : ""}`)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as KepleroLookupSecret[];
    },
    enabled: true,
  });
}

export function useToggleKepleroLookup() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async ({ enabled, brandId }: { enabled: boolean; brandId: string | null }) => {
      let existingQuery = (supabase as any)
        .from("keplero_lookup_settings")
        .select("id");

      existingQuery = brandId ? existingQuery.eq("brand_id", brandId) : existingQuery.is("brand_id", null);

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        const { error } = await (supabase as any)
          .from("keplero_lookup_settings")
          .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("keplero_lookup_settings")
          .insert({ brand_id: brandId, is_enabled: enabled });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keplero-lookup-settings"] });
      toast.success("Impostazione aggiornata");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useGenerateKepleroSecret() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ brandId }: { brandId: string | null }): Promise<string> => {
      // Generate a random secret
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const secret = Array.from(array)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Hash it for storage
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const secretHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      // Deactivate old secrets for this brand
      let deactivateQuery = (supabase as any)
        .from("keplero_lookup_secrets")
        .update({ is_active: false, rotated_at: new Date().toISOString() })
        .eq("is_active", true);

      deactivateQuery = brandId
        ? deactivateQuery.eq("brand_id", brandId)
        : deactivateQuery.is("brand_id", null);

      const { error: deactivateError } = await deactivateQuery;
      if (deactivateError) throw deactivateError;

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      // Insert new secret
      const { error } = await (supabase as any)
        .from("keplero_lookup_secrets")
        .insert({
          brand_id: brandId,
          secret_hash: secretHash,
          is_active: true,
          created_by: authData.user?.id ?? null,
        });

      if (error) throw error;
      return secret; // Return plaintext secret (shown once)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keplero-lookup-secrets"] });
      toast.success("Nuovo secret generato");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useTestKepleroLookup() {
  return useMutation({
    mutationFn: async ({
      phone,
      brandSlug,
      secret,
    }: {
      phone: string;
      brandSlug: string;
      secret: string;
    }) => {
      // Sanitize: strip non-ASCII / invisible chars from header/body values
      const cleanPhone = phone.trim().replace(/[^\x20-\x7E]/g, "");
      const cleanSecret = secret.trim().replace(/[^\x20-\x7E]/g, "");
      const cleanSlug = brandSlug.trim().replace(/[^\x20-\x7E]/g, "");

      if (!/^[a-f0-9]{64}$/i.test(cleanSecret)) {
        throw new Error("Secret non valido: atteso formato esadecimale a 64 caratteri");
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/keplero-contact-lookup`;

      // First attempt: GET + custom header (Keplero production-compatible)
      try {
        const getUrl = `${baseUrl}?phone=${encodeURIComponent(cleanPhone)}&brand_slug=${encodeURIComponent(cleanSlug)}`;
        const response = await fetch(getUrl, {
          method: "GET",
          headers: {
            "x-keplero-secret": cleanSecret,
          },
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Lookup failed");
        return data;
      } catch (err) {
        // Fallback: POST body (avoids header encoding/client quirks)
        const fallbackResponse = await fetch(baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone: cleanPhone,
            brand_slug: cleanSlug,
            secret: cleanSecret,
          }),
        });

        let fallbackData: any = null;
        try {
          fallbackData = await fallbackResponse.json();
        } catch {
          // ignore json parse errors
        }

        if (!fallbackResponse.ok) {
          throw new Error(fallbackData?.error || (err as Error)?.message || "Lookup failed");
        }

        return fallbackData;
      }
    },
  });
}
