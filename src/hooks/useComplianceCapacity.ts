import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AccessReview {
  id: string;
  review_period: string;
  status: "pending" | "in_progress" | "completed" | "overdue";
  total_users: number;
  reviewed_users: number;
  revoked_count: number;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

export interface AccessReviewItem {
  id: string;
  review_id: string;
  user_id: string;
  user_email: string | null;
  current_role_label: string | null;
  decision: "keep" | "revoke" | "change_role" | "pending" | null;
  decision_notes: string | null;
  decided_at: string | null;
}

export interface ComplianceChange {
  id: string;
  change_type: string;
  actor_email: string | null;
  target_resource: string | null;
  old_value: any;
  new_value: any;
  reason: string | null;
  occurred_at: string;
}

export interface ComplianceEvidence {
  id: string;
  evidence_type: string;
  period: string;
  payload: any;
  collected_at: string;
  notes: string | null;
}

export interface CapacitySnapshot {
  id: string;
  metric_name: string;
  metric_value: number;
  unit: string | null;
  captured_at: string;
}

export interface CapacityThreshold {
  metric_name: string;
  warn_threshold: number;
  critical_threshold: number;
  unit: string | null;
  growth_rate_warn_pct: number | null;
  is_active: boolean;
}

export interface AnomalyDetection {
  id: string;
  metric_name: string;
  observed_value: number;
  expected_value: number;
  z_score: number;
  severity: "info" | "warning" | "critical";
  direction: "spike" | "drop";
  acknowledged_at: string | null;
  detected_at: string;
}

// ---------- Access Reviews ----------
export function useAccessReviews() {
  return useQuery({
    queryKey: ["access-reviews"],
    queryFn: async (): Promise<AccessReview[]> => {
      const { data, error } = await supabase
        .from("access_reviews")
        .select("*")
        .order("review_period", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AccessReview[];
    },
    staleTime: 60_000,
  });
}

export function useAccessReviewItems(reviewId: string | null) {
  return useQuery({
    queryKey: ["access-review-items", reviewId],
    queryFn: async (): Promise<AccessReviewItem[]> => {
      if (!reviewId) return [];
      const { data, error } = await supabase
        .from("access_review_items")
        .select("*")
        .eq("review_id", reviewId)
        .order("user_email", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AccessReviewItem[];
    },
    enabled: !!reviewId,
  });
}

export function useGenerateAccessReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (period: string) => {
      const { data, error } = await supabase.rpc("generate_access_review", { p_period: period });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["access-reviews"] });
      toast.success("Access review generata");
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });
}

export function useUpdateReviewItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; review_id: string; decision: string; decision_notes?: string }) => {
      const { error } = await supabase
        .from("access_review_items")
        .update({
          decision: input.decision,
          decision_notes: input.decision_notes ?? null,
          decided_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["access-review-items", vars.review_id] });
      qc.invalidateQueries({ queryKey: ["access-reviews"] });
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });
}

// ---------- Compliance Change Log ----------
export function useComplianceChangeLog(limit = 100) {
  return useQuery({
    queryKey: ["compliance-change-log", limit],
    queryFn: async (): Promise<ComplianceChange[]> => {
      const { data, error } = await supabase
        .from("compliance_change_log")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ComplianceChange[];
    },
    staleTime: 30_000,
  });
}

// ---------- Compliance Evidence ----------
export function useComplianceEvidence() {
  return useQuery({
    queryKey: ["compliance-evidence"],
    queryFn: async (): Promise<ComplianceEvidence[]> => {
      const { data, error } = await supabase
        .from("compliance_evidence")
        .select("*")
        .order("collected_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ComplianceEvidence[];
    },
  });
}

// ---------- Capacity ----------
export function useCapacitySnapshots(metricName?: string) {
  return useQuery({
    queryKey: ["capacity-snapshots", metricName],
    queryFn: async (): Promise<CapacitySnapshot[]> => {
      let q = supabase
        .from("capacity_snapshots")
        .select("*")
        .order("captured_at", { ascending: false })
        .limit(500);
      if (metricName) q = q.eq("metric_name", metricName);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CapacitySnapshot[];
    },
    staleTime: 60_000,
  });
}

export function useCapacityThresholds() {
  return useQuery({
    queryKey: ["capacity-thresholds"],
    queryFn: async (): Promise<CapacityThreshold[]> => {
      const { data, error } = await supabase.from("capacity_thresholds").select("*");
      if (error) throw error;
      return (data ?? []) as CapacityThreshold[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useCaptureCapacitySnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("capture_capacity_snapshot");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capacity-snapshots"] });
      toast.success("Snapshot capacity catturato");
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });
}

// ---------- Anomaly ----------
export function useAnomalyDetections(onlyUnacked = false) {
  return useQuery({
    queryKey: ["anomaly-detections", onlyUnacked],
    queryFn: async (): Promise<AnomalyDetection[]> => {
      let q = supabase
        .from("anomaly_detections")
        .select("*")
        .order("detected_at", { ascending: false })
        .limit(200);
      if (onlyUnacked) q = q.is("acknowledged_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AnomalyDetection[];
    },
    staleTime: 30_000,
  });
}

export function useAcknowledgeAnomaly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("anomaly_detections")
        .update({ acknowledged_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["anomaly-detections"] });
      toast.success("Anomalia confermata");
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });
}

export function useTriggerAnomalyDetection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("detect_anomalies", { p_lookback_hours: 1 });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["anomaly-detections"] });
      toast.success(`Detection eseguita: ${data?.anomalies_detected ?? 0} anomalie`);
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });
}
