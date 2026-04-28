import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppointmentConflict {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  contact_id: string;
  status: string;
}

interface ConflictParams {
  brandId?: string | null;
  assignedSalesUserId?: string | null;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  excludeAppointmentId?: string | null;
  enabled?: boolean;
}

/**
 * Phase 1 Block 3 — read-only conflict detection.
 * Returns overlapping appointments for the same sales user inside the brand.
 */
export function useAppointmentConflict(params: ConflictParams) {
  const {
    brandId,
    assignedSalesUserId,
    scheduledAt,
    durationMinutes,
    excludeAppointmentId,
    enabled = true,
  } = params;

  return useQuery({
    queryKey: [
      "appointment-conflict",
      brandId,
      assignedSalesUserId,
      scheduledAt,
      durationMinutes,
      excludeAppointmentId,
    ],
    queryFn: async (): Promise<AppointmentConflict[]> => {
      if (!brandId || !assignedSalesUserId || !scheduledAt || !durationMinutes) {
        return [];
      }
      const { data, error } = await supabase.rpc("check_appointment_conflict", {
        p_brand_id: brandId,
        p_assigned_sales_user_id: assignedSalesUserId,
        p_scheduled_at: scheduledAt,
        p_duration_minutes: durationMinutes,
        p_exclude_appointment_id: excludeAppointmentId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as AppointmentConflict[];
    },
    enabled:
      enabled &&
      !!brandId &&
      !!assignedSalesUserId &&
      !!scheduledAt &&
      !!durationMinutes,
    staleTime: 30_000,
  });
}
