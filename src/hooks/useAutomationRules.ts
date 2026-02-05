import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { Json } from "@/integrations/supabase/types";

// ============= Types =============

export type ConditionOperator = "eq" | "neq" | "contains" | "starts_with" | "exists" | "not_exists" | "gt" | "gte" | "lt" | "lte" | "in";

export interface ConditionItem {
  path: string;
  op: ConditionOperator;
  value?: unknown;
}

export interface Conditions {
  all?: ConditionItem[];
  any?: ConditionItem[];
}

export type ActionType = 
  | "upsert_contact" 
  | "add_tag" 
  | "create_deal" 
  | "create_ticket" 
  | "send_outbound_webhook" 
  | "set_callback_requested"
  | "log_note";

export interface Action {
  type: ActionType;
  match?: Record<string, string>;
  fields?: Record<string, string>;
  entity?: "contact" | "deal" | "ticket";
  tag?: string;
  webhook_id?: string;
  value?: boolean;
  note?: string;
}

export interface AutomationRule {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  trigger_event_type: string | null;
  trigger_source: string | null;
  conditions: Conditions;
  action_type: string;
  action_config: Record<string, unknown>;
  actions: Action[];
  stop_on_failure: boolean;
  priority: number;
  requires_confirmation: boolean;
  execution_count: number;
  last_executed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: string;
  brand_id: string;
  rule_id: string | null;
  event_id: string | null;
  entity_type: string;
  entity_id: string;
  action_taken: string;
  action_details: Record<string, unknown> | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  steps_log: StepLog[] | null;
  created_entities: Record<string, string> | null;
  error_message: string | null;
  created_at: string;
}

export interface StepLog {
  step: number;
  action_type: string;
  status: "success" | "failed" | "skipped";
  result?: Record<string, unknown>;
  error?: string;
  duration_ms: number;
}

export interface WebhookInboundEvent {
  id: string;
  brand_id: string;
  source: string;
  event_type: string;
  payload: Record<string, unknown>;
  received_at: string;
  status: "pending" | "processing" | "processed" | "failed" | "skipped";
  processed_at: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

// ============= Event Types =============

export const AUTOMATION_EVENT_TYPES = [
  // Keplero events
  { value: "keplero.ricontatto", label: "Keplero - Ricontatto" },
  { value: "keplero.appuntamento", label: "Keplero - Appuntamento" },
  { value: "keplero.rifiuto", label: "Keplero - Rifiuto" },
  { value: "keplero.lead", label: "Keplero - Nuovo Lead" },
  { value: "keplero.*", label: "Keplero - Tutti gli eventi" },
  // Meta events
  { value: "meta.lead", label: "Meta Lead Ads" },
  // VOIspeed events
  { value: "voispeed.call_start", label: "VOIspeed - Inizio Chiamata" },
  { value: "voispeed.call_end", label: "VOIspeed - Fine Chiamata" },
  { value: "voispeed.call_answered", label: "VOIspeed - Chiamata Risposta" },
  { value: "voispeed.call_missed", label: "VOIspeed - Chiamata Persa" },
  { value: "voispeed.*", label: "VOIspeed - Tutti gli eventi" },
  // Generic inbound
  { value: "inbound.*", label: "Inbound - Tutti i webhook" },
];

export const ACTION_TYPES: { value: ActionType; label: string; description: string }[] = [
  { value: "upsert_contact", label: "Crea/Aggiorna Contatto", description: "Trova o crea un contatto basandosi sul telefono" },
  { value: "add_tag", label: "Aggiungi Tag", description: "Tagga il contatto o deal creato" },
  { value: "create_deal", label: "Crea Deal", description: "Crea un deal nella pipeline" },
  { value: "create_ticket", label: "Crea Ticket", description: "Apre un ticket di supporto" },
  { value: "set_callback_requested", label: "Richiedi Ricontatto", description: "Imposta flag callback_requested" },
  { value: "send_outbound_webhook", label: "Invia Webhook", description: "Inoltra ad un webhook outbound" },
  { value: "log_note", label: "Aggiungi Nota", description: "Aggiunge una nota all'entità" },
];

export const CONDITION_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "exists", label: "Esiste" },
  { value: "not_exists", label: "Non esiste" },
  { value: "eq", label: "Uguale a" },
  { value: "neq", label: "Diverso da" },
  { value: "contains", label: "Contiene" },
  { value: "starts_with", label: "Inizia con" },
  { value: "gt", label: "Maggiore di" },
  { value: "gte", label: "Maggiore o uguale" },
  { value: "lt", label: "Minore di" },
  { value: "lte", label: "Minore o uguale" },
  { value: "in", label: "In lista" },
];

// ============= Payload Fields for Templates =============

export const PAYLOAD_FIELDS = [
  { path: "payload.args.Nome", label: "Nome" },
  { path: "payload.args.Cognome", label: "Cognome" },
  { path: "payload.args.telefono_principale", label: "Telefono Principale" },
  { path: "payload.args.telefono_secondario", label: "Telefono Secondario" },
  { path: "payload.args.citta", label: "Città" },
  { path: "payload.args.cap", label: "CAP" },
  { path: "payload.args.indirizzo_completo", label: "Indirizzo" },
  { path: "payload.args.esito_chiamata", label: "Esito Chiamata" },
  { path: "payload.args.data_appuntamento", label: "Data Appuntamento" },
  { path: "payload.args.ora_appuntamento", label: "Ora Appuntamento" },
  { path: "payload.args.pacemaker", label: "Pacemaker" },
  { path: "payload.args.note", label: "Note" },
  { path: "payload.args.motivo_contatto", label: "Motivo Contatto" },
  { path: "payload.args.disponibilita_orarie", label: "Disponibilità Orarie" },
];

// ============= Hooks =============

export function useAutomationRules() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["automation-rules", currentBrand?.id],
    queryFn: async (): Promise<AutomationRule[]> => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase
        .from("automation_rules")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("priority", { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as AutomationRule[];
    },
    enabled: !!currentBrand?.id,
  });
}

export function useCreateAutomationRule() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      description?: string;
      trigger_event_type: string;
      trigger_source?: string;
      conditions?: Conditions;
      actions: Action[];
      stop_on_failure?: boolean;
      priority?: number;
      is_active?: boolean;
    }) => {
      if (!currentBrand?.id) throw new Error("No brand selected");

      const { data, error } = await supabase
        .from("automation_rules")
        .insert({
          brand_id: currentBrand.id,
          name: params.name,
          description: params.description || null,
          trigger_type: "webhook_event",
          trigger_config: {},
          trigger_event_type: params.trigger_event_type,
          trigger_source: params.trigger_source || null,
          conditions: (params.conditions || {}) as Json,
          action_type: "multi_action",
          action_config: {},
          actions: params.actions as unknown as Json,
          stop_on_failure: params.stop_on_failure ?? true,
          priority: params.priority ?? 100,
          is_active: params.is_active ?? true,
        })
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules", currentBrand?.id] });
    },
  });
}

export function useUpdateAutomationRule() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      name?: string;
      description?: string;
      trigger_event_type?: string;
      trigger_source?: string;
      conditions?: Conditions;
      actions?: Action[];
      stop_on_failure?: boolean;
      priority?: number;
      is_active?: boolean;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (params.name !== undefined) updateData.name = params.name;
      if (params.description !== undefined) updateData.description = params.description;
      if (params.trigger_event_type !== undefined) updateData.trigger_event_type = params.trigger_event_type;
      if (params.trigger_source !== undefined) updateData.trigger_source = params.trigger_source;
      if (params.conditions !== undefined) updateData.conditions = params.conditions;
      if (params.actions !== undefined) updateData.actions = params.actions;
      if (params.stop_on_failure !== undefined) updateData.stop_on_failure = params.stop_on_failure;
      if (params.priority !== undefined) updateData.priority = params.priority;
      if (params.is_active !== undefined) updateData.is_active = params.is_active;

      const { error } = await supabase
        .from("automation_rules")
        .update(updateData as Record<string, Json>)
        .eq("id", params.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules", currentBrand?.id] });
    },
  });
}

export function useDeleteAutomationRule() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("automation_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules", currentBrand?.id] });
    },
  });
}

// ============= Logs & Events =============

export function useAutomationLogs(params: { ruleId?: string; limit?: number }) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["automation-logs", currentBrand?.id, params.ruleId, params.limit],
    queryFn: async (): Promise<AutomationLog[]> => {
      if (!currentBrand?.id) return [];

      let query = supabase
        .from("automation_logs")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false })
        .limit(params.limit ?? 50);

      if (params.ruleId) {
        query = query.eq("rule_id", params.ruleId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AutomationLog[];
    },
    enabled: !!currentBrand?.id,
    refetchInterval: 10000,
  });
}

export function useInboundEvents(params: { status?: string; limit?: number }) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["inbound-events", currentBrand?.id, params.status, params.limit],
    queryFn: async (): Promise<WebhookInboundEvent[]> => {
      if (!currentBrand?.id) return [];

      let query = supabase
        .from("webhook_inbound_events")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("received_at", { ascending: false })
        .limit(params.limit ?? 50);

      if (params.status) {
        query = query.eq("status", params.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as WebhookInboundEvent[];
    },
    enabled: !!currentBrand?.id,
    refetchInterval: 10000,
  });
}
