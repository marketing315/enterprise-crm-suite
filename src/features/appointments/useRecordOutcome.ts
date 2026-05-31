/**
 * useRecordOutcome — wraps the public.record_appointment_outcome RPC.
 * Append-only: never mutates legacy data, only inserts a new outcome row
 * and lets the RPC perform the forward-only status transition.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AppointmentOutcomeCode } from "./taxonomy";

export interface RecordOutcomePayload {
  appointmentId: string;
  outcomeCode: AppointmentOutcomeCode;
  outcomeNotes?: string | null;
  rescheduleReason?: string | null;
  nextAction?: string | null;
  metadata?: Record<string, unknown>;
}

export function useRecordOutcome() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RecordOutcomePayload) => {
      const { data, error } = await (supabase.rpc as any)("record_appointment_outcome", {
        p_appointment_id: payload.appointmentId,
        p_outcome_code: payload.outcomeCode,
        p_outcome_notes: payload.outcomeNotes ?? null,
        p_reschedule_reason: payload.rescheduleReason ?? null,
        p_next_action: payload.nextAction ?? null,
        p_metadata: payload.metadata ?? {},
      });
      if (error) throw error;
      return data as string; // outcome row id
    },
    onSuccess: (_id, variables) => {
      toast.success("Esito registrato");
      qc.invalidateQueries({ queryKey: ["appointment-detail", variables.appointmentId] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["appointment-outcomes", variables.appointmentId] });
      qc.invalidateQueries({ queryKey: ["salesperson-appointments-day"] });
      qc.invalidateQueries({ queryKey: ["salesperson-upcoming-appts"] });
      qc.invalidateQueries({ queryKey: ["salesperson-appointments-today"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Errore nella registrazione dell'esito";
      toast.error(msg);
    },
  });
}
