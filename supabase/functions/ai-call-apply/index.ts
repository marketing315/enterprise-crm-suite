import { createClient } from "npm:@supabase/supabase-js@2";
import { redactForLog } from "../_shared/pii-redact.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// C1: Verify cross-brand ownership before any mutation.
// Throws if entity does not belong to the caller's brand.
async function assertEntityOwnership(
  supabase: any,
  callerInternalUserId: string,
  brandId: string,
  table: string,
  entityId: string | null | undefined,
): Promise<void> {
  if (!entityId) return;
  const { error } = await supabase.rpc("assert_brand_access", {
    p_user_id: callerInternalUserId,
    p_brand_id: brandId,
    p_entity_table: table,
    p_entity_id: entityId,
  });
  if (error) {
    throw new Error(`cross_brand_access_denied:${table}:${error.message}`);
  }
}

// C3: stage_name whitelist regex (defends against AI prompt-injection / control chars)
const STAGE_NAME_RE = /^[\p{L}\p{N} _\-/]{1,80}$/u;

// Apply a single approved proposal idempotently
async function applyProposal(
  supabase: any,
  proposal: any,
  decisionId: string,
  callerInternalUserId: string,
): Promise<{ success: boolean; error?: string; result?: any }> {
  const changes = proposal.edited_changes || proposal.proposed_changes;
  const brandId = proposal.brand_id;
  const contactId = proposal.contact_id;
  const dealId = proposal.deal_id;

  try {
    // C1: enforce ownership of every referenced entity before mutating
    if (contactId) await assertEntityOwnership(supabase, callerInternalUserId, brandId, "contacts", contactId);
    if (dealId) await assertEntityOwnership(supabase, callerInternalUserId, brandId, "deals", dealId);
    if (proposal.call_log_id) await assertEntityOwnership(supabase, callerInternalUserId, brandId, "call_logs", proposal.call_log_id);

    switch (proposal.action_type) {
      case "update_contact": {
        if (!contactId) return { success: false, error: "No contact_id" };
        const allowedFields = [
          "first_name", "last_name", "email", "city", "cap", "address",
          "notes", "status", "province", "country", "company_name",
        ];
        const updates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(changes)) {
          if (allowedFields.includes(k)) updates[k] = v;
        }
        if (Object.keys(updates).length === 0) return { success: true, result: "no_changes" };
        const { error } = await supabase.from("contacts").update(updates).eq("id", contactId);
        if (error) throw error;
        return { success: true, result: updates };
      }

      case "update_kanban_stage": {
        if (!dealId) return { success: false, error: "No deal_id" };
        const stageName = changes.stage_name as string;
        if (!stageName) return { success: false, error: "No stage_name in changes" };
        // C3: validate stage_name against strict whitelist (defends against AI output injection)
        if (!STAGE_NAME_RE.test(stageName)) {
          return { success: false, error: `invalid_stage_name:"${stageName}"` };
        }
        const { data: stage } = await supabase
          .from("pipeline_stages")
          .select("id, brand_id")
          .eq("brand_id", brandId)
          .eq("name", stageName)
          .eq("is_active", true)
          .maybeSingle();
        if (!stage || stage.brand_id !== brandId) {
          return { success: false, error: `stage_not_in_brand:"${stageName}"` };
        }

        const { error } = await supabase
          .from("deals")
          .update({ current_stage_id: stage.id })
          .eq("id", dealId);
        if (error) throw error;
        return { success: true, result: { stage_id: stage.id, stage_name: stageName } };
      }

      case "create_or_update_ticket": {
        if (!contactId) return { success: false, error: "No contact_id" };
        const { data, error } = await supabase.from("tickets").insert({
          brand_id: brandId,
          contact_id: contactId,
          deal_id: dealId,
          title: changes.title || "Ticket da chiamata",
          description: changes.description || "",
          priority: changes.priority || 3,
          status: "open",
          source_context: "ai_call_proposal",
        }).select("id").single();
        if (error) throw error;
        return { success: true, result: { ticket_id: data.id } };
      }

      case "create_or_update_appointment": {
        if (!contactId) return { success: false, error: "No contact_id" };
        const scheduledAt = changes.scheduled_at as string;
        if (!scheduledAt) return { success: false, error: "No scheduled_at" };
        const { data, error } = await supabase.from("appointments").insert({
          brand_id: brandId,
          contact_id: contactId,
          deal_id: dealId,
          scheduled_at: scheduledAt,
          duration_minutes: changes.duration_minutes || 30,
          address: changes.address || null,
          city: changes.city || null,
          notes: changes.notes || null,
          status: "scheduled",
          appointment_type: changes.appointment_type || "primo_appuntamento",
        }).select("id").single();
        if (error) throw error;
        return { success: true, result: { appointment_id: data.id } };
      }

      case "create_lead_event": {
        if (!contactId) return { success: false, error: "No contact_id" };
        const { data, error } = await supabase.from("lead_events").insert({
          brand_id: brandId,
          contact_id: contactId,
          deal_id: dealId,
          source: "api",
          source_name: "ai_call_proposal",
          raw_payload: changes,
          occurred_at: new Date().toISOString(),
        }).select("id").single();
        if (error) throw error;
        return { success: true, result: { lead_event_id: data.id } };
      }

      case "update_deal": {
        if (!dealId) return { success: false, error: "No deal_id" };
        const allowedDeal = ["value", "notes", "status"];
        const updates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(changes)) {
          if (allowedDeal.includes(k)) updates[k] = v;
        }
        if (Object.keys(updates).length === 0) return { success: true, result: "no_changes" };
        const { error } = await supabase.from("deals").update(updates).eq("id", dealId);
        if (error) throw error;
        return { success: true, result: updates };
      }

      case "add_action_suggestion": {
        const { data, error } = await supabase.from("action_suggestions").insert({
          brand_id: brandId,
          entity_type: changes.entity_type || "contact",
          entity_id: contactId || dealId,
          suggestion_type: changes.suggestion_type || "follow_up",
          title: changes.title || "Azione suggerita da AI",
          description: changes.description || "",
          priority: changes.priority || 3,
          confidence: proposal.ai_confidence || 0.7,
        }).select("id").single();
        if (error) throw error;
        return { success: true, result: { suggestion_id: data.id } };
      }

      case "update_call_log": {
        const callLogId = proposal.call_log_id;
        if (!callLogId) return { success: false, error: "No call_log_id" };
        const allowedCall = ["notes", "outcome"];
        const updates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(changes)) {
          if (allowedCall.includes(k)) updates[k] = v;
        }
        if (Object.keys(updates).length === 0) return { success: true, result: "no_changes" };
        const { error } = await supabase.from("call_logs").update(updates).eq("id", callLogId);
        if (error) throw error;
        return { success: true, result: updates };
      }

      default:
        return { success: false, error: `Unknown action_type: ${proposal.action_type}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: internalUser } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_auth_id", user.id)
      .single();
    if (!internalUser) {
      return new Response(JSON.stringify({ error: "user not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, proposal_id, brand_id, decision, edited_changes, rejection_reason } = await req.json();

    if (action === "decide") {
      // Record decision & update proposal status
      if (!proposal_id || !brand_id || !decision) {
        return new Response(JSON.stringify({ error: "proposal_id, brand_id, decision required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const validDecisions = ["approved", "rejected", "edited_then_approved"];
      if (!validDecisions.includes(decision)) {
        return new Response(JSON.stringify({ error: "Invalid decision" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // C1: validate that proposal_id actually belongs to the brand_id from body
      // and that the caller is a member of that brand. Defends against IDOR where
      // a malicious client passes a proposal_id from brand X with brand_id=Y.
      const { data: proposalGuard, error: propGuardErr } = await supabase
        .from("ai_call_action_proposals")
        .select("brand_id")
        .eq("id", proposal_id)
        .maybeSingle();
      if (propGuardErr || !proposalGuard) {
        return new Response(JSON.stringify({ error: "proposal_not_found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (proposalGuard.brand_id !== brand_id) {
        return new Response(JSON.stringify({ error: "brand_id_mismatch" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Verify caller membership of that brand (admin/ceo allowed)
      const { error: membershipErr } = await supabase.rpc("assert_brand_membership", {
        p_user_id: internalUser.id,
        p_brand_id: brand_id,
      });
      if (membershipErr) {
        return new Response(JSON.stringify({ error: "cross_brand_access_denied" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert decision record
      const { data: decisionRow, error: decErr } = await supabase
        .from("ai_call_action_decisions")
        .insert({
          proposal_id,
          brand_id,
          decided_by: internalUser.id,
          decision,
          edited_changes: decision === "edited_then_approved" ? edited_changes : null,
          rejection_reason: decision === "rejected" ? rejection_reason : null,
        })
        .select("id")
        .single();
      if (decErr) throw new Error(`Decision insert failed: ${decErr.message}`);

      // Update proposal status
      await supabase
        .from("ai_call_action_proposals")
        .update({ decision_status: decision })
        .eq("id", proposal_id);

      // If approved/edited, apply immediately
      if (decision === "approved" || decision === "edited_then_approved") {
        const { data: proposal } = await supabase
          .from("ai_call_action_proposals")
          .select("*")
          .eq("id", proposal_id)
          .single();

        if (proposal) {
          const idempotencyKey = `${proposal_id}_${decisionRow.id}`;

          // Check idempotency
          const { data: existing } = await supabase
            .from("ai_call_action_executions")
            .select("id")
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();

          if (!existing) {
            const mergedProposal = {
              ...proposal,
              edited_changes: decision === "edited_then_approved" ? edited_changes : null,
            };

            const startTs = Date.now();
            const result = await applyProposal(supabase, mergedProposal, decisionRow.id, internalUser.id);
            const durationMs = Date.now() - startTs;

            await supabase.from("ai_call_action_executions").insert({
              proposal_id,
              decision_id: decisionRow.id,
              brand_id,
              status: result.success ? "success" : "failed",
              executed_at: new Date().toISOString(),
              duration_ms: durationMs,
              error_message: result.error || null,
              result_snapshot: result.result || null,
              idempotency_key: idempotencyKey,
            });

            return new Response(JSON.stringify({
              decision: decision,
              execution: result.success ? "success" : "failed",
              error: result.error,
              result: result.result,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ decision, execution: "already_executed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ decision }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // C4: redact PII from error context before logging
    console.error("[ai-call-apply] Error:", JSON.stringify(redactForLog({ message: err?.message, stack: err?.stack })));
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
