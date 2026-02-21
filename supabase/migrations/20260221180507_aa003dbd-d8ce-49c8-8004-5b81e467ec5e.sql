
-- =============================================
-- deal_stage_transitions: audit table for Kanban stage changes
-- =============================================
CREATE TABLE public.deal_stage_transitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  from_stage_label TEXT,
  to_stage_label TEXT NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_display_name TEXT,
  idempotency_key TEXT NOT NULL,
  chat_message_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for idempotency
CREATE UNIQUE INDEX uq_deal_stage_transitions_idempotency ON public.deal_stage_transitions (idempotency_key);

-- Index for querying by deal
CREATE INDEX idx_deal_stage_transitions_deal ON public.deal_stage_transitions (deal_id, occurred_at DESC);

-- Enable RLS
ALTER TABLE public.deal_stage_transitions ENABLE ROW LEVEL SECURITY;

-- RLS: users can read transitions for brands they belong to
CREATE POLICY "Users can view transitions for their brands"
ON public.deal_stage_transitions
FOR SELECT
USING (public.user_belongs_to_brand(auth.uid(), brand_id));

-- RLS: users can insert transitions for their brands
CREATE POLICY "Users can insert transitions for their brands"
ON public.deal_stage_transitions
FOR INSERT
WITH CHECK (public.user_belongs_to_brand(auth.uid(), brand_id));

-- Add realtime support
ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_stage_transitions;
