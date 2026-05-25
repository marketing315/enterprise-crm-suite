/**
 * GDPR — Hook gestione consenso registrazione chiamate per brand.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RecordingLegalBasis = "consent" | "legitimate_interest";

export interface BrandCallConsentConfig {
  brand_id: string;
  recording_legal_basis: RecordingLegalBasis;
  ivr_announcement_audio_url: string | null;
  ivr_consent_required: boolean;
  policy_version: string;
  updated_at: string;
}

export interface CallConsentEvent {
  id: string;
  brand_id: string;
  call_log_id: string | null;
  contact_id: string | null;
  consent_action: string;
  source: string;
  legal_basis: string | null;
  policy_version: string | null;
  dtmf_input: string | null;
  evidence_url: string | null;
  recorded_at: string;
  recorded_by_user_id: string | null;
  metadata: Record<string, unknown> | null;
}

export function useBrandCallConsentConfig(brandId: string | null) {
  return useQuery({
    queryKey: ["brand-call-consent-config", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<BrandCallConsentConfig | null> => {
      const { data, error } = await supabase
        .from("brand_call_consent_config")
        .select("*")
        .eq("brand_id", brandId!)
        .maybeSingle();
      if (error) throw error;
      return (data as BrandCallConsentConfig | null) ?? null;
    },
  });
}

export function useUpsertBrandCallConsentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: Partial<BrandCallConsentConfig> & { brand_id: string }) => {
      const { data, error } = await supabase
        .from("brand_call_consent_config")
        .upsert(cfg, { onConflict: "brand_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["brand-call-consent-config", vars.brand_id] });
    },
  });
}

export function useCallConsentEvents(brandId: string | null, limit = 100) {
  return useQuery({
    queryKey: ["call-consent-events", brandId, limit],
    enabled: !!brandId,
    queryFn: async (): Promise<CallConsentEvent[]> => {
      const { data, error } = await supabase
        .from("call_consent_events")
        .select("*")
        .eq("brand_id", brandId!)
        .order("recorded_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as CallConsentEvent[];
    },
  });
}

export function useLogCallConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      brand_id: string;
      call_log_id?: string | null;
      contact_id?: string | null;
      consent_action: string;
      source?: string;
      legal_basis?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.rpc("log_call_consent", {
        p_brand_id: args.brand_id,
        p_call_log_id: args.call_log_id ?? null,
        p_contact_id: args.contact_id ?? null,
        p_consent_action: args.consent_action,
        p_source: args.source ?? "operator",
        p_legal_basis: args.legal_basis ?? "consent",
        p_metadata: (args.metadata ?? null) as never,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["call-consent-events", vars.brand_id] });
    },
  });
}
