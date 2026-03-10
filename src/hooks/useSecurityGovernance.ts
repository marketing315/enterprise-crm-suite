import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface SecurityReview {
  id: string;
  brand_id: string;
  quarter: string;
  review_type: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  signed_off_at: string | null;
  signed_off_by: string | null;
  lead_user_id: string | null;
  summary: string | null;
  total_findings: number;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  created_at: string;
}

export interface SecurityFinding {
  id: string;
  review_id: string;
  brand_id: string;
  severity: string;
  area: string;
  checklist_ref: string | null;
  title: string;
  description: string | null;
  status: string;
  owner_user_id: string | null;
  remediation_pr: string | null;
  remediated_at: string | null;
  sla_deadline: string | null;
  created_at: string;
}

export interface IncidentDrill {
  id: string;
  brand_id: string;
  quarter: string;
  scenario_id: string;
  scenario_name: string;
  drill_type: string;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  facilitator_user_id: string | null;
  ttd_minutes: number | null;
  ttm_minutes: number | null;
  escalation_correct: boolean | null;
  runbook_compliance_pct: number | null;
  debrief_notes: string | null;
  action_items: unknown[];
  created_at: string;
}

export function useSecurityReviews() {
  const { currentBrand } = useBrand();
  return useQuery({
    queryKey: ["security-reviews", currentBrand?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_reviews" as never)
        .select("*")
        .eq("brand_id", currentBrand!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SecurityReview[];
    },
    enabled: !!currentBrand?.id,
  });
}

export function useSecurityFindings(reviewId?: string) {
  const { currentBrand } = useBrand();
  return useQuery({
    queryKey: ["security-findings", currentBrand?.id, reviewId],
    queryFn: async () => {
      let q = supabase
        .from("security_findings" as never)
        .select("*")
        .eq("brand_id", currentBrand!.id)
        .order("created_at", { ascending: false });
      if (reviewId) q = q.eq("review_id", reviewId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SecurityFinding[];
    },
    enabled: !!currentBrand?.id,
  });
}

export function useIncidentDrills() {
  const { currentBrand } = useBrand();
  return useQuery({
    queryKey: ["incident-drills", currentBrand?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_drills" as never)
        .select("*")
        .eq("brand_id", currentBrand!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as IncidentDrill[];
    },
    enabled: !!currentBrand?.id,
  });
}
