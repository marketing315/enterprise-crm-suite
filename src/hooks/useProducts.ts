import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import type { Product } from "@/types/sales";

// Untyped client for new tables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const untypedClient = createClient(supabaseUrl, supabaseKey);

interface UseProductsOptions {
  activeOnly?: boolean;
}

export function useProducts(options: UseProductsOptions = { activeOnly: true }) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["products", currentBrand?.id, options.activeOnly],
    queryFn: async (): Promise<Product[]> => {
      if (!currentBrand) return [];

      let query = untypedClient
        .from("products")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("name", { ascending: true });

      if (options.activeOnly) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as Product[];
    },
    enabled: !!currentBrand,
  });
}

export function useProduct(productId: string | null) {
  return useQuery({
    queryKey: ["product", productId],
    queryFn: async (): Promise<Product | null> => {
      if (!productId) return null;

      const { data, error } = await untypedClient
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      if (error) throw error;
      return data as Product;
    },
    enabled: !!productId,
  });
}

export interface CreateProductInput {
  name: string;
  description?: string;
  sku?: string;
  default_price: number;
  vat_rate?: number;
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (input: CreateProductInput) => {
      if (!currentBrand) throw new Error("No brand selected");

      const { data, error } = await untypedClient
        .from("products")
        .insert({
          brand_id: currentBrand.id,
          name: input.name,
          description: input.description || null,
          sku: input.sku || null,
          default_price: input.default_price,
          vat_rate: input.vat_rate ?? 22,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Prodotto creato");
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast.error("Esiste già un prodotto con questo SKU");
      } else {
        toast.error("Errore nella creazione del prodotto");
      }
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, data }: { productId: string; data: Partial<CreateProductInput & { is_active: boolean }> }) => {
      const { error } = await untypedClient
        .from("products")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", productId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      toast.success("Prodotto aggiornato");
    },
    onError: () => {
      toast.error("Errore nell'aggiornamento del prodotto");
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId: string) => {
      // Soft delete by setting is_active to false
      const { error } = await untypedClient
        .from("products")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", productId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Prodotto disattivato");
    },
    onError: () => {
      toast.error("Errore nella disattivazione del prodotto");
    },
  });
}
