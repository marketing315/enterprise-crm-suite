import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { 
  SalesOrder, 
  SalesOrderWithRelations, 
  SalesOrderStatus,
  SalesKpis 
} from "@/types/sales";

// Untyped client for new tables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const untypedClient = createClient(supabaseUrl, supabaseKey);

interface UseSalesOrdersOptions {
  status?: SalesOrderStatus | SalesOrderStatus[];
  assignedUserId?: string;
  from?: Date;
  to?: Date;
}

export function useSalesOrders(options: UseSalesOrdersOptions = {}) {
  const { currentBrand } = useBrand();
  const { status, assignedUserId, from, to } = options;

  return useQuery({
    queryKey: ["sales-orders", currentBrand?.id, status, assignedUserId, from?.toISOString(), to?.toISOString()],
    queryFn: async (): Promise<SalesOrderWithRelations[]> => {
      if (!currentBrand) return [];

      let query = untypedClient
        .from("sales_orders")
        .select(`
          *,
          contact:contacts(id, first_name, last_name, email),
          assigned_user:users!sales_orders_assigned_user_id_fkey(id, full_name, email)
        `)
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false });

      if (status) {
        if (Array.isArray(status)) {
          query = query.in("status", status);
        } else {
          query = query.eq("status", status);
        }
      }

      if (assignedUserId) {
        query = query.eq("assigned_user_id", assignedUserId);
      }

      if (from) {
        query = query.gte("created_at", from.toISOString());
      }

      if (to) {
        query = query.lte("created_at", to.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as SalesOrderWithRelations[];
    },
    enabled: !!currentBrand,
  });
}

export function useSalesOrder(orderId: string | null) {
  return useQuery({
    queryKey: ["sales-order", orderId],
    queryFn: async (): Promise<SalesOrderWithRelations | null> => {
      if (!orderId) return null;

      const { data, error } = await untypedClient
        .from("sales_orders")
        .select(`
          *,
          contact:contacts(id, first_name, last_name, email),
          assigned_user:users!sales_orders_assigned_user_id_fkey(id, full_name, email),
          items:sales_order_items(
            *,
            product:products(id, name, sku)
          ),
          payments(
            *,
            recorded_by:users!payments_recorded_by_user_id_fkey(id, full_name)
          )
        `)
        .eq("id", orderId)
        .single();

      if (error) throw error;
      return data as SalesOrderWithRelations;
    },
    enabled: !!orderId,
  });
}

export function useCreateSalesOrderFromDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dealId: string) => {
      const { data, error } = await untypedClient
        .rpc("create_sales_order_from_deal", { p_deal_id: dealId });

      if (error) throw error;
      return data as string;
    },
    onSuccess: (orderId) => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Vendita creata con successo");
      return orderId;
    },
    onError: (error: Error) => {
      if (error.message.includes("already exists")) {
        toast.error("Esiste già una vendita per questo deal");
      } else {
        toast.error("Errore nella creazione della vendita");
      }
    },
  });
}

export function useUpdateSalesOrderStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: SalesOrderStatus }) => {
      const updateData: Record<string, unknown> = { 
        status,
        updated_at: new Date().toISOString()
      };

      if (status === "confirmed") {
        updateData.confirmed_at = new Date().toISOString();
      } else if (status === "cancelled") {
        updateData.cancelled_at = new Date().toISOString();
      }

      const { error } = await untypedClient
        .from("sales_orders")
        .update(updateData)
        .eq("id", orderId);

      if (error) throw error;

      // Log to history
      await untypedClient
        .from("sales_order_history")
        .insert({
          order_id: orderId,
          action: "status_change",
          new_status: status,
          changed_by_user_id: user?.id,
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-order"] });
      toast.success("Stato ordine aggiornato");
    },
    onError: () => {
      toast.error("Errore nell'aggiornamento dello stato");
    },
  });
}

export function useUpdateSalesOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: Partial<SalesOrder> }) => {
      const { error } = await untypedClient
        .from("sales_orders")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-order"] });
      toast.success("Ordine aggiornato");
    },
    onError: () => {
      toast.error("Errore nell'aggiornamento dell'ordine");
    },
  });
}

export function useSalesKpis(from: Date, to: Date, userId?: string) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["sales-kpis", currentBrand?.id, from.toISOString(), to.toISOString(), userId],
    queryFn: async (): Promise<SalesKpis> => {
      if (!currentBrand) {
        return {
          total_revenue: 0,
          total_orders: 0,
          orders_paid: 0,
          orders_pending: 0,
          avg_order_value: 0,
          conversion_rate: 0,
        };
      }

      const { data, error } = await untypedClient
        .rpc("get_sales_kpis", {
          p_brand_id: currentBrand.id,
          p_from: from.toISOString(),
          p_to: to.toISOString(),
          p_user_id: userId || null,
        });

      if (error) throw error;
      return data as SalesKpis;
    },
    enabled: !!currentBrand,
  });
}

// Check if a deal already has a sales order
export function useDealSalesOrder(dealId: string | null) {
  return useQuery({
    queryKey: ["deal-sales-order", dealId],
    queryFn: async (): Promise<SalesOrder | null> => {
      if (!dealId) return null;

      const { data, error } = await untypedClient
        .from("sales_orders")
        .select("*")
        .eq("deal_id", dealId)
        .maybeSingle();

      if (error) throw error;
      return data as SalesOrder | null;
    },
    enabled: !!dealId,
  });
}
