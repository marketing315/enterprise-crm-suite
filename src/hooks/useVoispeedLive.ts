/**
 * F6 — Live VoiSpeed wallboard hook (Realtime).
 * Sottoscrive `voispeed_agent_status` e `voispeed_queue_stats` per brand corrente.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AgentStatus =
  | "available" | "on_call" | "paused" | "wrap_up" | "offline" | "ringing" | "dnd";

export interface VoispeedAgent {
  id: string;
  brand_id: string;
  user_id: string | null;
  voispeed_ext: string;
  status: AgentStatus;
  queue_name: string | null;
  since: string;
  updated_at: string;
}

export interface VoispeedQueueStat {
  id: string;
  brand_id: string;
  queue_name: string;
  stat_ts: string;
  calls_waiting: number | null;
  longest_wait_seconds: number | null;
  agents_available: number | null;
  agents_busy: number | null;
  service_level_pct: number | null;
  abandoned_15m: number | null;
}

export function useVoispeedAgents(brandId: string | null) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  const query = useQuery({
    queryKey: ["voispeed-agents", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<VoispeedAgent[]> => {
      const { data, error } = await supabase
        .from("voispeed_agent_status")
        .select("*")
        .eq("brand_id", brandId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VoispeedAgent[];
    },
  });

  useEffect(() => {
    if (!brandId) return;
    const channel = supabase
      .channel(`voispeed-agents:${brandId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voispeed_agent_status", filter: `brand_id=eq.${brandId}` },
        () => qc.invalidateQueries({ queryKey: ["voispeed-agents", brandId] }),
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [brandId, qc]);

  return { ...query, connected };
}

export function useVoispeedQueueLatest(brandId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["voispeed-queue-latest", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<VoispeedQueueStat[]> => {
      // Ultima riga per ogni coda
      const { data, error } = await supabase
        .from("voispeed_queue_stats")
        .select("*")
        .eq("brand_id", brandId!)
        .order("stat_ts", { ascending: false })
        .limit(200);
      if (error) throw error;
      const seen = new Set<string>();
      const out: VoispeedQueueStat[] = [];
      for (const row of (data ?? []) as VoispeedQueueStat[]) {
        if (seen.has(row.queue_name)) continue;
        seen.add(row.queue_name);
        out.push(row);
      }
      return out;
    },
  });

  useEffect(() => {
    if (!brandId) return;
    const channel = supabase
      .channel(`voispeed-queue:${brandId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "voispeed_queue_stats", filter: `brand_id=eq.${brandId}` },
        () => qc.invalidateQueries({ queryKey: ["voispeed-queue-latest", brandId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [brandId, qc]);

  return query;
}
