import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CreateBrandInput {
  name: string;
  slug: string;
}

export function useCreateBrand(opts?: { onSuccess?: (brand: { id: string; name: string; slug: string }) => void }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, slug }: CreateBrandInput) => {
      const { data, error } = await supabase
        .from("brands")
        .insert({ name, slug })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["brands"] });
      opts?.onSuccess?.(data as { id: string; name: string; slug: string });
    },
  });
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}
