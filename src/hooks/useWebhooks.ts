import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface OutboundWebhook {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  event_types: string[];
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  webhook_name: string;
  event_type: string;
  event_id: string;
  status: "pending" | "sending" | "success" | "failed";
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  response_status: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDeliveryDetail extends WebhookDelivery {
  webhook_url: string;
  response_body: string | null;
  payload: Record<string, unknown>;
}

export interface DeliveriesResponse {
  deliveries: WebhookDelivery[];
  total_count: number;
  limit: number;
  offset: number;
}

// Supported event types for webhooks
export const WEBHOOK_EVENT_TYPES = [
  { value: "ticket.created", label: "Ticket Creato" },
  { value: "ticket.updated", label: "Ticket Aggiornato" },
  { value: "ticket.assigned", label: "Ticket Assegnato" },
  { value: "ticket.status_changed", label: "Cambio Status" },
  { value: "ticket.priority_changed", label: "Cambio Priorità" },
  { value: "ticket.sla_breached", label: "SLA Violato" },
  { value: "ticket.resolved", label: "Ticket Risolto" },
  { value: "ticket.closed", label: "Ticket Chiuso" },
  { value: "contact.created", label: "Contatto Creato" },
  { value: "contact.updated", label: "Contatto Aggiornato" },
  { value: "deal.created", label: "Deal Creato" },
  { value: "deal.stage_changed", label: "Deal Stage Cambiato" },
  { value: "deal.closed", label: "Deal Chiuso" },
  { value: "webhook.test", label: "Test" },
] as const;

// Generate a secure random secret
export function generateWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("");
}

// ============= Webhooks CRUD =============

export function useWebhooks() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["webhooks", currentBrand?.id],
    queryFn: async (): Promise<OutboundWebhook[]> => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase.rpc("list_outbound_webhooks", {
        p_brand_id: currentBrand.id,
      });

      if (error) throw error;
      return (data as OutboundWebhook[]) || [];
    },
    enabled: !!currentBrand?.id,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      url: string;
      secret: string;
      event_types: string[];
      is_active: boolean;
    }): Promise<{ webhook_id: string; secret: string }> => {
      if (!currentBrand?.id) throw new Error("No brand selected");

      const { data, error } = await supabase.rpc("create_outbound_webhook", {
        p_brand_id: currentBrand.id,
        p_name: params.name,
        p_url: params.url,
        p_secret: params.secret,
        p_event_types: params.event_types,
        p_is_active: params.is_active,
      });

      if (error) throw error;
      
      const result = data as { webhook_id: string; secret: string }[] | null;
      if (!result || result.length === 0) throw new Error("Failed to create webhook");
      
      return result[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", currentBrand?.id] });
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      name?: string;
      url?: string;
      event_types?: string[];
      is_active?: boolean;
    }): Promise<boolean> => {
      const { data, error } = await supabase.rpc("update_outbound_webhook", {
        p_id: params.id,
        p_name: params.name ?? null,
        p_url: params.url ?? null,
        p_event_types: params.event_types ?? null,
        p_is_active: params.is_active ?? null,
      });

      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", currentBrand?.id] });
    },
  });
}

export function useRotateWebhookSecret() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      newSecret: string;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc("rotate_outbound_webhook_secret", {
        p_id: params.id,
        p_new_secret: params.newSecret,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", currentBrand?.id] });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (id: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc("delete_outbound_webhook", {
        p_id: id,
      });

      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", currentBrand?.id] });
    },
  });
}

export function useTestWebhook() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (webhookId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("test_webhook", {
        p_webhook_id: webhookId,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      // Refresh deliveries after test
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", currentBrand?.id] });
    },
  });
}

// ============= Deliveries =============

export function useWebhookDeliveries(params: {
  webhookId?: string;
  status?: string;
  eventType?: string;
  limit?: number;
  offset?: number;
}) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: [
      "webhook-deliveries",
      currentBrand?.id,
      params.webhookId,
      params.status,
      params.eventType,
      params.limit,
      params.offset,
    ],
    queryFn: async (): Promise<DeliveriesResponse> => {
      if (!currentBrand?.id) return { deliveries: [], total_count: 0, limit: 50, offset: 0 };

      const { data, error } = await supabase.rpc("list_webhook_deliveries", {
        p_brand_id: currentBrand.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p_webhook_id: params.webhookId || null,
        p_status: (params.status || null) as "pending" | "sending" | "success" | "failed" | null,
        p_event_type: params.eventType || null,
        p_limit: params.limit ?? 50,
        p_offset: params.offset ?? 0,
      });

      if (error) throw error;
      return data as unknown as DeliveriesResponse;
    },
    enabled: !!currentBrand?.id,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

export function useWebhookDeliveryDetail(deliveryId: string | null) {
  return useQuery({
    queryKey: ["webhook-delivery-detail", deliveryId],
    queryFn: async (): Promise<WebhookDeliveryDetail | null> => {
      if (!deliveryId) return null;

      const { data, error } = await supabase.rpc("get_webhook_delivery", {
        p_delivery_id: deliveryId,
      });

      if (error) throw error;
      return data as unknown as WebhookDeliveryDetail | null;
    },
    enabled: !!deliveryId,
  });
}
