/**
 * useAppointmentOutcomes — read append-only outcome history for an appointment.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppointmentOutcomeCode } from "./taxonomy";

export interface AppointmentOutcomeRow {
  id: string;
  appointment_id: string;
  brand_id: string;
  outcome_code: AppointmentOutcomeCode;
  outcome_notes: string | null;
  reschedule_reason: string | null;
  next_action: string | null;
  recorded_by_user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function useAppointmentOutcomes(appointmentId: string | undefined) {
  return useQuery({
    queryKey: ["appointment-outcomes", appointmentId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("appointment_outcomes") as any)
        .select("*")
        .eq("appointment_id", appointmentId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AppointmentOutcomeRow[];
    },
    enabled: !!appointmentId,
  });
}
