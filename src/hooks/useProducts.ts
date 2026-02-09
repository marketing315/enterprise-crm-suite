import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWriteBrandId } from "@/hooks/useWriteBrandId";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import type { Product } from "@/types/sales";
import { untypedClient } from "@/integrations/supabase/untypedClient";

interface UseProductsOptions {
  activeOnly?: boolean;
}

export function useProducts(options: UseProductsOptions = { activeOnly: true }) {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ["products", isAllBrandsSelected ? "all" : currentBrand?.id, options.activeOnly],
    queryFn: async (): Promise<Product[]> => {
      if (!isAllBrandsSelected && !currentBrand) return [];
      if (isAllBrandsSelected && allBrandIds.length === 0) return [];

      let query = untypedClient
        .from("products")
        .select("*")
        .order("name", { ascending: true });

      if (isAllBrandsSelected) {
        query = query.in("brand_id", allBrandIds);
      } else {
        query = query.eq("brand_id", currentBrand!.id);
      }

      if (options.activeOnly) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as Product[];
    },
    enabled: isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand,
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
  const { getWriteBrandId } = useWriteBrandId();

  return useMutation({
    mutationFn: async (input: CreateProductInput) => {
      const brandId = getWriteBrandId();

      const { data, error } = await untypedClient
        .from("products")
        .insert({
          brand_id: brandId,
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
