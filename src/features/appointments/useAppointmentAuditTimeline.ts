import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppointmentTimelineEvent {
  id: string;
  kind: "audit" | "outcome";
  action: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

/**
 * Unified timeline for an appointment:
 *  - audit_log_unified view (legacy audit_log + new audit_events) — A4-bis
 *  - appointment_outcomes (executed, no-show, cancelled, ...)
 * Sorted DESC by occurred_at.
 */
export function useAppointmentAuditTimeline(appointmentId: string | undefined) {
  return useQuery({
    queryKey: ["appointment-timeline", appointmentId],
    enabled: !!appointmentId,
    queryFn: async (): Promise<AppointmentTimelineEvent[]> => {
      if (!appointmentId) return [];

      const [auditRes, outcomesRes] = await Promise.all([
        supabase
          // A4-bis: read from unified view (audit_events ∪ audit_log)
          .from("audit_log_unified" as never)
          .select("id, action, actor_user_id, old_value, new_value, metadata, created_at")
          .eq("entity_type", "appointment")
          .eq("entity_id", appointmentId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("appointment_outcomes")
          .select("id, outcome_code, outcome_notes, reschedule_reason, next_action, recorded_by_user_id, recorded_at, metadata")
          .eq("appointment_id", appointmentId)
          .order("recorded_at", { ascending: false })
          .limit(200),
      ]);

      if (auditRes.error) throw auditRes.error;
      if (outcomesRes.error) throw outcomesRes.error;

      type AuditRow = {
        id: string;
        action: string;
        actor_user_id: string | null;
        old_value: Record<string, unknown> | null;
        new_value: Record<string, unknown> | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
      };
      const auditRows = (auditRes.data ?? []) as unknown as AuditRow[];

      // Resolve actor names in a single pass
      const actorIds = new Set<string>();
      auditRows.forEach((r) => r.actor_user_id && actorIds.add(r.actor_user_id));
      outcomesRes.data?.forEach((r) => r.recorded_by_user_id && actorIds.add(r.recorded_by_user_id));

      let usersMap = new Map<string, string>();
      if (actorIds.size > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, full_name, email")
          .in("id", Array.from(actorIds));
        users?.forEach((u) => usersMap.set(u.id, u.full_name || u.email));
      }

      const auditEvents: AppointmentTimelineEvent[] = auditRows.map((r) => ({
        id: `audit-${r.id}`,
        kind: "audit",
        action: r.action,
        occurred_at: r.created_at,
        actor_user_id: r.actor_user_id,
        actor_name: r.actor_user_id ? usersMap.get(r.actor_user_id) ?? null : null,
        old_value: r.old_value ?? null,
        new_value: r.new_value ?? null,
        metadata: r.metadata ?? {},
      }));

      const outcomeEvents: AppointmentTimelineEvent[] = (outcomesRes.data || []).map((r) => ({
        id: `outcome-${r.id}`,
        kind: "outcome",
        action: `outcome:${r.outcome_code}`,
        occurred_at: r.recorded_at,
        actor_user_id: r.recorded_by_user_id,
        actor_name: r.recorded_by_user_id ? usersMap.get(r.recorded_by_user_id) ?? null : null,
        old_value: null,
        new_value: {
          outcome_code: r.outcome_code,
          outcome_notes: r.outcome_notes,
          reschedule_reason: r.reschedule_reason,
          next_action: r.next_action,
        },
        metadata: (r.metadata as Record<string, unknown>) ?? {},
      }));

      return [...auditEvents, ...outcomeEvents].sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
      );
    },
    staleTime: 30_000,
  });
}
