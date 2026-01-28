import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

export interface MetaApp {
  id: string;
  brand_id: string;
  brand_slug: string;
  verify_token: string;
  app_secret: string;
  page_id: string | null;
  access_token: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MetaAppFormData {
  brand_id: string;
  brand_slug: string;
  verify_token: string;
  app_secret: string;
  page_id?: string;
  access_token: string;
  is_active?: boolean;
}

export function useMetaApps() {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();
  const queryClient = useQueryClient();

  const { data: metaApps = [], isLoading, error } = useQuery({
    queryKey: ["meta-apps", currentBrand?.id, isAllBrandsSelected],
    queryFn: async () => {
      let query = supabase
        .from("meta_apps")
        .select("*")
        .order("created_at", { ascending: false });

      if (isAllBrandsSelected) {
        query = query.in("brand_id", allBrandIds);
      } else if (currentBrand) {
        query = query.eq("brand_id", currentBrand.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as MetaApp[];
    },
    enabled: !!currentBrand,
  });

  const createMetaApp = useMutation({
    mutationFn: async (formData: MetaAppFormData) => {
      const { data, error } = await supabase
        .from("meta_apps")
        .insert({
          ...formData,
          is_active: formData.is_active ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-apps"] });
      toast.success("Meta App creata con successo");
    },
    onError: (error: any) => {
      console.error("Error creating meta app:", error);
      toast.error(error.message || "Errore nella creazione della Meta App");
    },
  });

  const updateMetaApp = useMutation({
    mutationFn: async ({ id, ...formData }: Partial<MetaApp> & { id: string }) => {
      const { data, error } = await supabase
        .from("meta_apps")
        .update(formData)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-apps"] });
      toast.success("Meta App aggiornata con successo");
    },
    onError: (error: any) => {
      console.error("Error updating meta app:", error);
      toast.error(error.message || "Errore nell'aggiornamento della Meta App");
    },
  });

  const deleteMetaApp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("meta_apps")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-apps"] });
      toast.success("Meta App eliminata con successo");
    },
    onError: (error: any) => {
      console.error("Error deleting meta app:", error);
      toast.error(error.message || "Errore nell'eliminazione della Meta App");
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("meta_apps")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-apps"] });
      toast.success("Stato aggiornato");
    },
    onError: (error: any) => {
      toast.error(error.message || "Errore nell'aggiornamento dello stato");
    },
  });

  return {
    metaApps,
    isLoading,
    error,
    createMetaApp,
    updateMetaApp,
    deleteMetaApp,
    toggleActive,
  };
}

// Generate a random verify token
export function generateVerifyToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
