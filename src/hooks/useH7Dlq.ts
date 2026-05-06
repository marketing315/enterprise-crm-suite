import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// H7 — Hooks for the 4 new dispatcher DLQs (outbound webhook, sheets export,
// lead digest, notification webhook). Replays go through SECURITY DEFINER
// RPCs that enforce admin/CEO membership server-side.

export type H7DlqKind =
  | "outbound_webhook"
  | "sheets_export"
  | "lead_digest"
  | "notification_webhook";

const VIEW_BY_KIND: Record<H7DlqKind, string> = {
  outbound_webhook: "outbound_webhook_dlq",
  sheets_export: "sheets_export_dlq",
  lead_digest: "lead_digest_dlq",
  notification_webhook: "notification_webhook_dlq",
};

const RPC_BY_KIND: Record<H7DlqKind, string> = {
  outbound_webhook: "replay_outbound_webhook_dlq",
  sheets_export: "replay_sheets_export_dlq",
  lead_digest: "replay_lead_digest_dlq",
  notification_webhook: "replay_notification_webhook_dlq",
};

export function useH7Dlq(kind: H7DlqKind) {
  return useQuery({
    queryKey: ["h7-dlq", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        // deno-lint-ignore no-explicit-any
        .from(VIEW_BY_KIND[kind] as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as unknown) as Array<Record<string, unknown>>;
    },
  });
}

export function useH7Replay(kind: H7DlqKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        // deno-lint-ignore no-explicit-any
        RPC_BY_KIND[kind] as any,
        { p_id: id },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["h7-dlq", kind] });
    },
  });
}
