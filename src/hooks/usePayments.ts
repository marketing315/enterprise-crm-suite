import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWriteBrandId } from "@/hooks/useWriteBrandId";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import type { Payment, RecordPaymentInput } from "@/types/sales";
import { untypedClient } from "@/integrations/supabase/untypedClient";

export function useOrderPayments(orderId: string | null) {
  return useQuery({
    queryKey: ["order-payments", orderId],
    queryFn: async (): Promise<Payment[]> => {
      if (!orderId) return [];

      const { data, error } = await untypedClient
        .from("payments")
        .select(`
          *,
          recorded_by:users!payments_recorded_by_user_id_fkey(id, full_name)
        `)
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Payment[];
    },
    enabled: !!orderId,
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { getWriteBrandId } = useWriteBrandId();

  return useMutation({
    mutationFn: async (input: RecordPaymentInput) => {
      const brandId = getWriteBrandId();

      const { data, error } = await untypedClient
        .from("payments")
        .insert({
          brand_id: brandId,
          order_id: input.order_id,
          amount: input.amount,
          method: input.method,
          reference: input.reference || null,
          notes: input.notes || null,
          status: "completed",
          paid_at: input.paid_at || new Date().toISOString(),
          recorded_by_user_id: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["order-payments", input.order_id] });
      queryClient.invalidateQueries({ queryKey: ["sales-order", input.order_id] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-kpis"] });
      toast.success("Pagamento registrato");
    },
    onError: () => {
      toast.error("Errore nella registrazione del pagamento");
    },
  });
}

export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      paymentId, 
      status,
      orderId 
    }: { 
      paymentId: string; 
      status: Payment["status"];
      orderId: string;
    }) => {
      const updateData: Record<string, unknown> = { status };
      
      if (status === "completed") {
        updateData.paid_at = new Date().toISOString();
      } else if (status === "refunded") {
        updateData.paid_at = null;
      }

      const { error } = await untypedClient
        .from("payments")
        .update(updateData)
        .eq("id", paymentId);

      if (error) throw error;
    },
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["order-payments", orderId] });
      queryClient.invalidateQueries({ queryKey: ["sales-order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-kpis"] });
      toast.success("Stato pagamento aggiornato");
    },
    onError: () => {
      toast.error("Errore nell'aggiornamento del pagamento");
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentId, orderId }: { paymentId: string; orderId: string }) => {
      const { error } = await untypedClient
        .from("payments")
        .delete()
        .eq("id", paymentId);

      if (error) throw error;
    },
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["order-payments", orderId] });
      queryClient.invalidateQueries({ queryKey: ["sales-order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-kpis"] });
      toast.success("Pagamento eliminato");
    },
    onError: () => {
      toast.error("Errore nell'eliminazione del pagamento");
    },
  });
}
