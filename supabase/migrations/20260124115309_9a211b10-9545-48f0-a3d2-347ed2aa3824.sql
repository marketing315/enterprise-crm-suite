-- ================================================
-- M4: AI DECISION SERVICE - Database Structure
-- ================================================

-- Add lead_type enum
CREATE TYPE lead_type AS ENUM ('trial', 'info', 'support', 'generic');

-- Add AI fields to lead_events
ALTER TABLE public.lead_events
ADD COLUMN IF NOT EXISTS lead_type lead_type DEFAULT 'generic',
ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(3, 2),
ADD COLUMN IF NOT EXISTS ai_rationale TEXT,
ADD COLUMN IF NOT EXISTS ai_processed BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS should_create_ticket BOOLEAN DEFAULT false;

-- Create ai_jobs table for async processing
CREATE TABLE public.ai_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  lead_event_id UUID NOT NULL REFERENCES public.lead_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT unique_pending_job UNIQUE (lead_event_id)
);

-- Enable RLS
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

-- RLS: Only admins can view jobs
CREATE POLICY "Admins can view ai jobs"
  ON public.ai_jobs FOR SELECT
  USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'));

-- Function to enqueue AI classification job
CREATE OR REPLACE FUNCTION public.enqueue_ai_classification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create a job for AI classification
  INSERT INTO public.ai_jobs (brand_id, lead_event_id)
  VALUES (NEW.brand_id, NEW.id)
  ON CONFLICT (lead_event_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger: Auto-enqueue on new lead_event
CREATE TRIGGER enqueue_ai_on_lead_event
  AFTER INSERT ON public.lead_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_ai_classification();

-- Function to apply AI fallback (deterministic)
CREATE OR REPLACE FUNCTION public.apply_ai_fallback(p_lead_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id UUID;
  v_fallback_tag_id UUID;
BEGIN
  -- Get brand_id
  SELECT brand_id INTO v_brand_id FROM lead_events WHERE id = p_lead_event_id;
  
  -- Update lead_event with fallback values
  UPDATE lead_events SET
    lead_type = 'generic',
    ai_priority = 3,
    ai_confidence = 0.0,
    ai_rationale = 'Fallback: AI processing not available',
    ai_processed = true,
    ai_processed_at = now()
  WHERE id = p_lead_event_id;
  
  -- Try to find or create a "Da Verificare" tag for fallback
  SELECT id INTO v_fallback_tag_id 
  FROM tags 
  WHERE brand_id = v_brand_id AND name = 'Da Verificare' AND parent_id IS NULL
  LIMIT 1;
  
  IF v_fallback_tag_id IS NULL THEN
    INSERT INTO tags (brand_id, name, color, scope, description)
    VALUES (v_brand_id, 'Da Verificare', '#f59e0b', 'mixed', 'Tag automatico per lead non classificati')
    RETURNING id INTO v_fallback_tag_id;
  END IF;
  
  -- Assign fallback tag
  INSERT INTO tag_assignments (brand_id, tag_id, lead_event_id, assigned_by, confidence)
  VALUES (v_brand_id, v_fallback_tag_id, p_lead_event_id, 'ai', 0.0)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Performance indexes
CREATE INDEX idx_ai_jobs_status ON public.ai_jobs(status);
CREATE INDEX idx_ai_jobs_brand ON public.ai_jobs(brand_id);
CREATE INDEX idx_lead_events_ai_processed ON public.lead_events(ai_processed) WHERE NOT ai_processed;