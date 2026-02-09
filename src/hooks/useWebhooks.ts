import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useWriteBrandId } from "@/hooks/useWriteBrandId";
import type { Json } from "@/integrations/supabase/types";

export type PayloadFormat = "json" | "form_urlencoded";

export interface PayloadMapping {
  [targetField: string]: string; // e.g. { "nome": "contact.first_name" }
}

export interface CustomUrlParams {
  [key: string]: string; // e.g. { "idprogetto": "487" }
}

export interface OutboundWebhook {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  event_types: string[];
  payload_format: PayloadFormat;
  payload_mapping: PayloadMapping | null;
  custom_url_params: CustomUrlParams | null;
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

// Event type definition
export interface WebhookEventType {
  value: string;
  label: string;
}

// PRD-aligned event types grouped by category
export const WEBHOOK_EVENT_TYPE_CATEGORIES: Array<{
  category: string;
  events: WebhookEventType[];
}> = [
  {
    category: "Lead Events",
    events: [
      { value: "lead_event.created", label: "Lead Event Creato" },
    ],
  },
  {
    category: "Pipeline",
    events: [
      { value: "pipeline.stage_changed", label: "Stage Pipeline Cambiato" },
      { value: "sale.recorded", label: "Vendita Registrata" },
    ],
  },
  {
    category: "Tags",
    events: [
      { value: "tags.updated", label: "Tags Aggiornati" },
    ],
  },
  {
    category: "Appuntamenti",
    events: [
      { value: "appointment.created", label: "Appuntamento Creato" },
      { value: "appointment.updated", label: "Appuntamento Aggiornato" },
    ],
  },
  {
    category: "Ticket",
    events: [
      { value: "ticket.created", label: "Ticket Creato" },
      { value: "ticket.updated", label: "Ticket Aggiornato" },
      { value: "ticket.assigned", label: "Ticket Assegnato" },
      { value: "ticket.status_changed", label: "Cambio Status" },
      { value: "ticket.priority_changed", label: "Cambio Priorità" },
      { value: "ticket.sla_breached", label: "SLA Violato" },
      { value: "ticket.resolved", label: "Ticket Risolto" },
      { value: "ticket.closed", label: "Ticket Chiuso" },
    ],
  },
  {
    category: "Contatti & Deal",
    events: [
      { value: "contact.created", label: "Contatto Creato" },
      { value: "contact.updated", label: "Contatto Aggiornato" },
      { value: "deal.created", label: "Deal Creato" },
      { value: "deal.stage_changed", label: "Deal Stage Cambiato" },
      { value: "deal.closed", label: "Deal Chiuso" },
    ],
  },
  {
    category: "Sistema",
    events: [
      { value: "webhook.test", label: "Test" },
    ],
  },
];

// Flat list for backward compatibility
export const WEBHOOK_EVENT_TYPES: WebhookEventType[] = WEBHOOK_EVENT_TYPE_CATEGORIES.flatMap(
  (cat) => cat.events
);

// Generate a secure random secret
export function generateWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("");
}

// ============= Webhooks CRUD =============

export function useWebhooks() {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ["webhooks", isAllBrandsSelected ? "all" : currentBrand?.id],
    queryFn: async (): Promise<OutboundWebhook[]> => {
      if (!currentBrand?.id) return [];

      // RPC handles system brand resolution internally
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
  const { getWriteBrandId } = useWriteBrandId();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      url: string;
      secret: string;
      event_types: string[];
      is_active: boolean;
      payload_format?: PayloadFormat;
      payload_mapping?: PayloadMapping | null;
      custom_url_params?: CustomUrlParams | null;
    }): Promise<{ webhook_id: string; secret: string }> => {
      const brandId = getWriteBrandId();

      const { data, error } = await supabase.rpc("create_outbound_webhook", {
        p_brand_id: brandId,
        p_name: params.name,
        p_url: params.url,
        p_secret: params.secret,
        p_event_types: params.event_types,
        p_is_active: params.is_active,
        p_payload_format: params.payload_format || "json",
        p_payload_mapping: (params.payload_mapping || null) as Json,
        p_custom_url_params: (params.custom_url_params || null) as Json,
      });

      if (error) throw error;
      
      const result = data as { webhook_id: string; secret: string }[] | null;
      if (!result || result.length === 0) throw new Error("Failed to create webhook");
      
      return result[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      name?: string;
      url?: string;
      event_types?: string[];
      is_active?: boolean;
      payload_format?: PayloadFormat;
      payload_mapping?: PayloadMapping | null;
      custom_url_params?: CustomUrlParams | null;
    }): Promise<boolean> => {
      const { data, error } = await supabase.rpc("update_outbound_webhook", {
        p_id: params.id,
        p_name: params.name ?? null,
        p_url: params.url ?? null,
        p_event_types: params.event_types ?? null,
        p_is_active: params.is_active ?? null,
        p_payload_format: params.payload_format ?? null,
        p_payload_mapping: (params.payload_mapping ?? null) as Json,
        p_custom_url_params: (params.custom_url_params ?? null) as Json,
      });

      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
}

export function useRotateWebhookSecret() {
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc("delete_outbound_webhook", {
        p_id: id,
      });

      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
}

export function useTestWebhook() {
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries"] });
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
  const { currentBrand, isAllBrandsSelected } = useBrand();

  return useQuery({
    queryKey: [
      "webhook-deliveries",
      isAllBrandsSelected ? "all" : currentBrand?.id,
      params.webhookId,
      params.status,
      params.eventType,
      params.limit,
      params.offset,
    ],
    queryFn: async (): Promise<DeliveriesResponse> => {
      if (!currentBrand?.id) return { deliveries: [], total_count: 0, limit: 50, offset: 0 };

      const { data, error } = await supabase.rpc("list_webhook_deliveries" as any, {
        p_brand_id: currentBrand.id,
        p_webhook_id: params.webhookId || null,
        p_status: params.status || null,
        p_event_type: params.eventType || null,
        p_limit: params.limit ?? 50,
        p_offset: params.offset ?? 0,
      });

      if (error) throw error;
      return data as unknown as DeliveriesResponse;
    },
    enabled: !!currentBrand?.id,
    refetchInterval: 60000,
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
