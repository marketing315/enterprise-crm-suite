// C3 — Zod-strict validation for AI tool-call outputs.
// Always parses inside try/catch and returns a discriminated result so callers
// can degrade gracefully (skip job / fall back) instead of throwing into the
// edge-runtime crash handler.
import { z, ZodSchema } from "https://esm.sh/zod@3.23.8";

export type AIValidateResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; raw?: unknown };

export function safeParseJsonString(input: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "json_parse_failed" };
  }
}

export function validateAIOutput<T>(
  schema: ZodSchema<T>,
  raw: unknown,
): AIValidateResult<T> {
  const r = schema.safeParse(raw);
  if (!r.success) {
    return {
      ok: false,
      error: `ai_output_invalid:${JSON.stringify(r.error.flatten().fieldErrors).slice(0, 400)}`,
      raw,
    };
  }
  return { ok: true, data: r.data };
}

// ── Schemas ──────────────────────────────────────────────────────────────────

export const ClassifyLeadSchema = z.object({
  lead_type: z.enum(["trial", "info", "support", "generic"]).default("generic"),
  priority: z.coerce.number().int().min(1).max(5).default(3),
  initial_stage_name: z.string().min(1).max(120).default("Nuovo Lead"),
  tags_to_apply: z.array(z.string().max(80)).max(20).default([]),
  should_create_ticket: z.boolean().default(false),
  ticket_type: z.string().max(80).nullable().default(null),
  should_create_or_update_appointment: z.boolean().default(false),
  appointment_action: z.enum(["create", "update", "none"]).default("none"),
  rationale: z.string().max(2000).default("Classificazione automatica"),
}).strict().passthrough(); // passthrough so unknown keys logged but not rejected

export const SuggestDealTagsSchema = z.object({
  tags_to_apply: z.array(z.string().min(1).max(80)).max(20),
  rationale: z.string().min(1).max(2000),
  confidence: z.coerce.number().min(0).max(1).default(0.8),
}).strict();

export const CallProposalSchema = z.object({
  action_type: z.enum([
    "update_contact", "update_kanban_stage", "create_or_update_ticket",
    "create_or_update_appointment", "create_lead_event", "update_deal",
    "add_action_suggestion", "update_call_log",
  ]),
  action_label: z.string().min(1).max(200),
  proposed_changes: z.record(z.unknown()),
  rationale: z.string().max(2000),
  transcript_excerpt: z.string().max(2000).nullable().optional(),
  confidence: z.coerce.number().min(0).max(1).default(0.5),
}).strict();

export const CallProposalsArraySchema = z.object({
  proposals: z.array(CallProposalSchema).max(20).default([]),
}).strict();
