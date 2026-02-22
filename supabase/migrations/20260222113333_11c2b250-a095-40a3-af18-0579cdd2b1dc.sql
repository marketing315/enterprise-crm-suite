
-- Enum for action proposal types
CREATE TYPE public.call_action_type AS ENUM (
  'update_contact',
  'update_kanban_stage',
  'create_or_update_ticket',
  'create_or_update_appointment',
  'create_lead_event',
  'update_deal',
  'add_action_suggestion',
  'update_call_log'
);

-- Enum for proposal decision status
CREATE TYPE public.call_action_decision_status AS ENUM (
  'pending_approval',
  'approved',
  'rejected',
  'edited_then_approved'
);

-- Enum for execution status
CREATE TYPE public.call_action_execution_status AS ENUM (
  'pending',
  'running',
  'success',
  'failed',
  'skipped'
);

-- ========================================
-- 1. AI Call Action Proposals
-- ========================================
CREATE TABLE public.ai_call_action_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id),
  call_log_id UUID NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  transcript_id UUID REFERENCES public.call_transcripts(id),
  contact_id UUID REFERENCES public.contacts(id),
  deal_id UUID REFERENCES public.deals(id),

  -- AI generation metadata
  ai_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  ai_prompt_version TEXT NOT NULL DEFAULT 'v1',
  ai_confidence NUMERIC(3,2) CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  ai_rationale TEXT,
  transcript_excerpt TEXT, -- relevant snippet from transcript

  -- Action details
  action_type public.call_action_type NOT NULL,
  action_label TEXT NOT NULL, -- human-readable label e.g. "Aggiorna telefono contatto"
  proposed_changes JSONB NOT NULL DEFAULT '{}', -- {field: value} or structured payload
  current_snapshot JSONB DEFAULT '{}', -- snapshot of current state for diff

  -- Status
  decision_status public.call_action_decision_status NOT NULL DEFAULT 'pending_approval',
  
  -- Ordering
  display_order SMALLINT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposals_call_log ON public.ai_call_action_proposals(call_log_id);
CREATE INDEX idx_proposals_brand_status ON public.ai_call_action_proposals(brand_id, decision_status);

-- ========================================
-- 2. AI Call Action Decisions (audit trail)
-- ========================================
CREATE TABLE public.ai_call_action_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.ai_call_action_proposals(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id),
  decided_by UUID NOT NULL REFERENCES public.users(id),
  decision public.call_action_decision_status NOT NULL,
  edited_changes JSONB, -- if edited_then_approved, the modified payload
  rejection_reason TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_decisions_proposal ON public.ai_call_action_decisions(proposal_id);

-- ========================================
-- 3. AI Call Action Executions
-- ========================================
CREATE TABLE public.ai_call_action_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.ai_call_action_proposals(id) ON DELETE CASCADE,
  decision_id UUID NOT NULL REFERENCES public.ai_call_action_decisions(id),
  brand_id UUID NOT NULL REFERENCES public.brands(id),

  -- Execution
  status public.call_action_execution_status NOT NULL DEFAULT 'pending',
  executed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_message TEXT,
  result_snapshot JSONB, -- state after apply
  idempotency_key TEXT NOT NULL, -- to prevent double-apply

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_executions_idempotency ON public.ai_call_action_executions(idempotency_key);
CREATE INDEX idx_executions_proposal ON public.ai_call_action_executions(proposal_id);

-- ========================================
-- RLS
-- ========================================
ALTER TABLE public.ai_call_action_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_call_action_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_call_action_executions ENABLE ROW LEVEL SECURITY;

-- Proposals: brand-scoped read/write
CREATE POLICY "Users can view proposals for their brands"
  ON public.ai_call_action_proposals FOR SELECT
  USING (public.user_belongs_to_brand(auth.uid(), brand_id));

CREATE POLICY "Users can insert proposals for their brands"
  ON public.ai_call_action_proposals FOR INSERT
  WITH CHECK (public.user_belongs_to_brand(auth.uid(), brand_id));

CREATE POLICY "Users can update proposals for their brands"
  ON public.ai_call_action_proposals FOR UPDATE
  USING (public.user_belongs_to_brand(auth.uid(), brand_id));

-- Decisions: brand-scoped
CREATE POLICY "Users can view decisions for their brands"
  ON public.ai_call_action_decisions FOR SELECT
  USING (public.user_belongs_to_brand(auth.uid(), brand_id));

CREATE POLICY "Users can insert decisions for their brands"
  ON public.ai_call_action_decisions FOR INSERT
  WITH CHECK (public.user_belongs_to_brand(auth.uid(), brand_id));

-- Executions: brand-scoped read
CREATE POLICY "Users can view executions for their brands"
  ON public.ai_call_action_executions FOR SELECT
  USING (public.user_belongs_to_brand(auth.uid(), brand_id));

CREATE POLICY "Users can insert executions for their brands"
  ON public.ai_call_action_executions FOR INSERT
  WITH CHECK (public.user_belongs_to_brand(auth.uid(), brand_id));

CREATE POLICY "Users can update executions for their brands"
  ON public.ai_call_action_executions FOR UPDATE
  USING (public.user_belongs_to_brand(auth.uid(), brand_id));

-- ========================================
-- Trigger: updated_at
-- ========================================
CREATE TRIGGER update_proposals_updated_at
  BEFORE UPDATE ON public.ai_call_action_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ========================================
-- Enable realtime for proposals (live status updates)
-- ========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_call_action_proposals;
