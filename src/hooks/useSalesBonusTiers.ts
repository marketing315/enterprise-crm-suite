/**
 * F4 — CRUD sales_bonus_tiers (versionati per brand).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SalesBonusTier {
  id: string;
  brand_id: string;
  label: string;
  threshold_gross: number;
  bonus_amount: number | null;
  bonus_percent: number | null;
  valid_from: string;
  valid_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useSalesBonusTiers(brandId: string | null) {
  return useQuery({
    queryKey: ["sales-bonus-tiers", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<SalesBonusTier[]> => {
      const { data, error } = await supabase
        .from("sales_bonus_tiers")
        .select("*")
        .eq("brand_id", brandId!)
        .order("valid_from", { ascending: false })
        .order("threshold_gross", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SalesBonusTier[];
    },
  });
}

export function useUpsertBonusTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<SalesBonusTier> & { brand_id: string; label: string; threshold_gross: number; valid_from: string }) => {
      const { data, error } = await supabase
        .from("sales_bonus_tiers")
        .upsert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["sales-bonus-tiers", vars.brand_id] });
      toast.success("Tier salvato");
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore salvataggio tier"),
  });
}

export function useDeleteBonusTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, brand_id }: { id: string; brand_id: string }) => {
      const { error } = await supabase.from("sales_bonus_tiers").delete().eq("id", id);
      if (error) throw error;
      return { id, brand_id };
    },
    onSuccess: ({ brand_id }) => {
      qc.invalidateQueries({ queryKey: ["sales-bonus-tiers", brand_id] });
      toast.success("Tier eliminato");
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore eliminazione tier"),
  });
}
