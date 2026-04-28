import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertChannelType = "webhook" | "email";

export interface AlertChannel {
  id: string;
  brand_id: string;
  name: string;
  channel_type: AlertChannelType;
  destination: string;
  webhook_secret: string | null;
  min_severity: AlertSeverity;
  anomaly_types: string[];
  is_active: boolean;
  mask_pii: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertDelivery {
  id: string;
  channel_id: string;
  anomaly_id: string | null;
  brand_id: string;
  status: "pending" | "sent" | "failed" | "retrying";
  attempt_count: number;
  response_status: number | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export function useAlertChannels() {
  return useQuery({
    queryKey: ["audit-alert-channels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_alert_channels")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AlertChannel[];
    },
    staleTime: 60_000,
  });
}

export function useAlertDeliveries(limit = 50) {
  return useQuery({
    queryKey: ["audit-alert-deliveries", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_alert_deliveries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AlertDelivery[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertAlertChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channel: Partial<AlertChannel> & { name: string; channel_type: AlertChannelType; destination: string }) => {
      const payload = {
        name: channel.name,
        channel_type: channel.channel_type,
        destination: channel.destination,
        webhook_secret: channel.webhook_secret ?? null,
        min_severity: channel.min_severity ?? "high",
        anomaly_types: channel.anomaly_types ?? [],
        is_active: channel.is_active ?? true,
        mask_pii: channel.mask_pii ?? true,
        brand_id: channel.brand_id ?? "00000000-0000-0000-0000-000000000000",
      };
      if (channel.id) {
        const { error } = await supabase
          .from("audit_alert_channels")
          .update(payload)
          .eq("id", channel.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("audit_alert_channels")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-alert-channels"] });
      toast({ title: "Canale salvato" });
    },
    onError: (e: Error) => {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    },
  });
}

export function useDeleteAlertChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("audit_alert_channels")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-alert-channels"] });
      toast({ title: "Canale eliminato" });
    },
  });
}

export function useDispatchAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("audit-alert-dispatcher", {
        body: {},
      });
      if (error) throw error;
      return data as { claimed: number; sent: number; failed: number };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["audit-alert-deliveries"] });
      toast({
        title: "Dispatcher eseguito",
        description: `Claim: ${r.claimed}, inviati: ${r.sent}, falliti: ${r.failed}`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Errore dispatcher", description: e.message, variant: "destructive" });
    },
  });
}
