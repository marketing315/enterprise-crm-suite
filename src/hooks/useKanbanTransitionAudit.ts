import { supabase } from "@/integrations/supabase/client";
import { untypedClient } from "@/integrations/supabase/untypedClient";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface TransitionParams {
  dealId: string;
  brandId: string;
  fromStageId: string | null;
  fromStageLabel: string | null;
  toStageId: string;
  toStageLabel: string;
}

/**
 * Records a Kanban stage transition and posts a system message in the deal's chat thread.
 * Idempotent: uses dealId + fromStageId + toStageId + timestamp (minute-level) as dedup key.
 */
export async function recordKanbanTransition(params: TransitionParams): Promise<void> {
  const { dealId, brandId, fromStageId, fromStageLabel, toStageId, toStageLabel } = params;

  // Guard: no-op if from === to
  if (fromStageId === toStageId) return;

  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get display name
    const { data: profile } = await untypedClient
      .from("users")
      .select("id, full_name")
      .eq("supabase_auth_id", user.id)
      .single();

    const actorName = profile?.full_name || "Utente sconosciuto";
    const actorAppUserId = profile?.id ?? null;
    const actorAuthUserId = user.id;
    const occurredAt = new Date();

    // Idempotency key: deal + from + to + minute-level timestamp
    const minuteKey = format(occurredAt, "yyyy-MM-dd'T'HH:mm");
    const idempotencyKey = `${dealId}:${fromStageId || "null"}:${toStageId}:${minuteKey}`;

    // 1. Insert transition record (idempotent via unique index)
    const { error: transitionError } = await untypedClient
      .from("deal_stage_transitions")
      .insert({
        deal_id: dealId,
        brand_id: brandId,
        from_stage_id: fromStageId,
        to_stage_id: toStageId,
        from_stage_label: fromStageLabel || "Sconosciuto",
        to_stage_label: toStageLabel,
        actor_user_id: actorAuthUserId,
        actor_display_name: actorName,
        idempotency_key: idempotencyKey,
        occurred_at: occurredAt.toISOString(),
      });

    // If duplicate, skip silently
    if (transitionError) {
      if (transitionError.code === "23505") {
        // unique_violation = duplicate, skip
        return;
      }
      console.error("Transition insert error:", transitionError);
      return;
    }

    // 2. Get or create entity thread for the deal
    const { data: threadId, error: threadError } = await supabase.rpc(
      "get_or_create_entity_thread",
      {
        p_brand_id: brandId,
        p_entity_type: "deal",
        p_entity_id: dealId,
      }
    );

    if (threadError || !threadId) {
      console.error("Thread creation error:", threadError);
      return;
    }

    // 3. Build system message
    const timeStr = format(occurredAt, "HH:mm", { locale: it });
    const dateStr = format(occurredAt, "d MMMM yyyy", { locale: it });
    const fromLabel = fromStageLabel || "stato iniziale";
    const messageText = `${actorName} ha spostato alle ${timeStr} del ${dateStr} lo stato del deal da "${fromLabel}" a "${toStageLabel}".`;

    // 4. Insert system chat message
    const { error: msgError } = await untypedClient
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        brand_id: brandId,
        sender_user_id: actorAppUserId,
        sender_type: "system",
        message_text: messageText,
        ai_context: {
          type: "system_kanban_transition",
          deal_id: dealId,
          from_stage_id: fromStageId,
          to_stage_id: toStageId,
          from_stage_label: fromLabel,
          to_stage_label: toStageLabel,
          actor_user_id: actorAppUserId,
          actor_display_name: actorName,
          occurred_at: occurredAt.toISOString(),
          idempotency_key: idempotencyKey,
        },
      });

    if (msgError) {
      console.error("System message insert error:", msgError);
    }
  } catch (err) {
    // Fire-and-forget: don't block the stage update
    console.error("Kanban transition audit error:", err);
  }
}
