import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import type { SalesOrderItem, CreateOrderItemInput } from "@/types/sales";

// Untyped client for new tables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const untypedClient = createClient(supabaseUrl, supabaseKey);

export function useSalesOrderItems(orderId: string | null) {
  return useQuery({
    queryKey: ["sales-order-items", orderId],
    queryFn: async (): Promise<SalesOrderItem[]> => {
      if (!orderId) return [];

      const { data, error } = await untypedClient
        .from("sales_order_items")
        .select(`
          *,
          product:products(id, name, sku, default_price)
        `)
        .eq("order_id", orderId)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return (data || []) as SalesOrderItem[];
    },
    enabled: !!orderId,
  });
}

export function useAddOrderItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, item }: { orderId: string; item: CreateOrderItemInput }) => {
      // Calculate line_total
      const lineTotal = item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100);

      // Get max sort_order
      const { data: existingItems } = await untypedClient
        .from("sales_order_items")
        .select("sort_order")
        .eq("order_id", orderId)
        .order("sort_order", { ascending: false })
        .limit(1);

      const nextSortOrder = existingItems && existingItems.length > 0 
        ? (existingItems[0].sort_order || 0) + 1 
        : 0;

      const { data, error } = await untypedClient
        .from("sales_order_items")
        .insert({
          order_id: orderId,
          product_id: item.product_id || null,
          name: item.name,
          description: item.description || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          vat_rate: item.vat_rate ?? 22,
          line_total: lineTotal,
          sort_order: nextSortOrder,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["sales-order-items", orderId] });
      queryClient.invalidateQueries({ queryKey: ["sales-order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Prodotto aggiunto");
    },
    onError: () => {
      toast.error("Errore nell'aggiunta del prodotto");
    },
  });
}

export function useUpdateOrderItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      itemId, 
      orderId,
      data 
    }: { 
      itemId: string; 
      orderId: string;
      data: Partial<CreateOrderItemInput> 
    }) => {
      // Recalculate line_total if quantity or unit_price changed
      let updateData: Record<string, unknown> = { ...data };
      
      if (data.quantity !== undefined || data.unit_price !== undefined || data.discount_percent !== undefined) {
        // Fetch current item to get missing values
        const { data: currentItem } = await untypedClient
          .from("sales_order_items")
          .select("quantity, unit_price, discount_percent")
          .eq("id", itemId)
          .single();

        if (currentItem) {
          const qty = data.quantity ?? currentItem.quantity;
          const price = data.unit_price ?? currentItem.unit_price;
          const discount = data.discount_percent ?? currentItem.discount_percent ?? 0;
          updateData.line_total = qty * price * (1 - discount / 100);
        }
      }

      const { error } = await untypedClient
        .from("sales_order_items")
        .update(updateData)
        .eq("id", itemId);

      if (error) throw error;
    },
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["sales-order-items", orderId] });
      queryClient.invalidateQueries({ queryKey: ["sales-order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Prodotto aggiornato");
    },
    onError: () => {
      toast.error("Errore nell'aggiornamento del prodotto");
    },
  });
}

export function useDeleteOrderItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, orderId }: { itemId: string; orderId: string }) => {
      const { error } = await untypedClient
        .from("sales_order_items")
        .delete()
        .eq("id", itemId);

      if (error) throw error;
    },
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["sales-order-items", orderId] });
      queryClient.invalidateQueries({ queryKey: ["sales-order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Prodotto rimosso");
    },
    onError: () => {
      toast.error("Errore nella rimozione del prodotto");
    },
  });
}
