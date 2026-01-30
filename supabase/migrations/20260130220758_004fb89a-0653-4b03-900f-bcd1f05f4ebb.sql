-- AI Tag Deal Jobs Queue
CREATE TABLE IF NOT EXISTS public.ai_tag_deal_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  trigger_reason TEXT NOT NULL CHECK (trigger_reason IN ('deal_created', 'stage_changed', 'manual')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(deal_id, status) -- Prevent duplicate pending jobs for same deal
);

-- Partial index for efficient pending job queries
CREATE INDEX IF NOT EXISTS idx_ai_tag_deal_jobs_pending 
  ON ai_tag_deal_jobs(brand_id, created_at) 
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.ai_tag_deal_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view jobs for their brands
CREATE POLICY "Admins can view ai tag deal jobs" ON ai_tag_deal_jobs
  FOR SELECT USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role));

-- Trigger function to queue tagging jobs
CREATE OR REPLACE FUNCTION trigger_ai_tag_deal()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if AI mode is not 'off' for this brand
  IF EXISTS (
    SELECT 1 FROM ai_configs 
    WHERE brand_id = NEW.brand_id 
    AND mode != 'off'
  ) THEN
    -- Insert job, ignore if duplicate pending exists
    INSERT INTO ai_tag_deal_jobs (brand_id, deal_id, trigger_reason)
    VALUES (
      NEW.brand_id, 
      NEW.id, 
      CASE 
        WHEN TG_OP = 'INSERT' THEN 'deal_created'
        WHEN OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id THEN 'stage_changed'
        ELSE 'manual'
      END
    )
    ON CONFLICT (deal_id, status) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on deals table
DROP TRIGGER IF EXISTS trg_ai_tag_deal ON deals;
CREATE TRIGGER trg_ai_tag_deal
  AFTER INSERT OR UPDATE OF current_stage_id ON deals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_ai_tag_deal();

-- RPC to apply AI-suggested tags to a deal
CREATE OR REPLACE FUNCTION apply_ai_deal_tags(
  p_deal_id UUID,
  p_tag_ids UUID[],
  p_confidence FLOAT DEFAULT 0.8
)
RETURNS INTEGER AS $$
DECLARE
  v_brand_id UUID;
  v_tag_id UUID;
  v_count INTEGER := 0;
BEGIN
  -- Get deal's brand
  SELECT brand_id INTO v_brand_id FROM deals WHERE id = p_deal_id;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Deal not found: %', p_deal_id;
  END IF;
  
  -- Insert each tag assignment
  FOREACH v_tag_id IN ARRAY p_tag_ids LOOP
    INSERT INTO tag_assignments (brand_id, tag_id, deal_id, assigned_by, confidence)
    VALUES (v_brand_id, v_tag_id, p_deal_id, 'ai', p_confidence)
    ON CONFLICT (tag_id, deal_id) WHERE deal_id IS NOT NULL DO NOTHING;
    
    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC to get pending AI tag jobs for processing
CREATE OR REPLACE FUNCTION get_pending_ai_tag_jobs(p_limit INT DEFAULT 10)
RETURNS TABLE (
  job_id UUID,
  brand_id UUID,
  deal_id UUID,
  trigger_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  UPDATE ai_tag_deal_jobs
  SET status = 'processing', 
      started_at = now(), 
      attempts = attempts + 1
  WHERE id IN (
    SELECT j.id FROM ai_tag_deal_jobs j
    WHERE j.status = 'pending'
    ORDER BY j.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING ai_tag_deal_jobs.id, ai_tag_deal_jobs.brand_id, ai_tag_deal_jobs.deal_id, ai_tag_deal_jobs.trigger_reason;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC to mark job as completed
CREATE OR REPLACE FUNCTION complete_ai_tag_job(p_job_id UUID, p_error TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF p_error IS NULL THEN
    UPDATE ai_tag_deal_jobs 
    SET status = 'completed', completed_at = now()
    WHERE id = p_job_id;
  ELSE
    UPDATE ai_tag_deal_jobs 
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
        last_error = p_error,
        started_at = NULL
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;