import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface OnboardingStatus {
  preferred_name: string | null;
  primary_role_hint: string | null;
  preferred_brand_id: string | null;
  welcome_completed_at: string | null;
  tour_completed_at: string | null;
}

const QK = ['onboarding-status'];

export function useOnboardingStatus() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: QK,
    enabled: !!user?.id,
    staleTime: Infinity,
    queryFn: async (): Promise<OnboardingStatus | null> => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('users')
        .select('preferred_name, primary_role_hint, preferred_brand_id, welcome_completed_at, tour_completed_at')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as OnboardingStatus) ?? null;
    },
  });

  const status = query.data;
  return {
    status,
    isLoading: query.isLoading,
    needsWelcome: !!user?.id && !query.isLoading && !!status && !status.welcome_completed_at,
    needsTour: !!user?.id && !query.isLoading && !!status && !!status.welcome_completed_at && !status.tour_completed_at,
    refetch: query.refetch,
  };
}

export function useCompleteWelcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { preferred_name: string; primary_role_hint: string; preferred_brand_id: string | null }) => {
      const { error } = await supabase.rpc('complete_welcome', {
        p_preferred_name: input.preferred_name,
        p_primary_role_hint: input.primary_role_hint,
        p_preferred_brand_id: input.preferred_brand_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

export function useCompleteTour() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('complete_tour');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}
