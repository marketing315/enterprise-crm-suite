-- ================================================
-- M2: DEALS & DEAL STAGE HISTORY TABLES
-- ================================================

-- Create deal_status enum
CREATE TYPE deal_status AS ENUM ('open', 'won', 'lost', 'closed', 'reopened_for_support');

-- Create deals table
CREATE TABLE public.deals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  current_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  status deal_status NOT NULL DEFAULT 'open',
  value NUMERIC(12, 2),
  notes TEXT,
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create deal_stage_history table (append-only audit)
CREATE TABLE public.deal_stage_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_stage_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for deals
CREATE POLICY "Users can view deals in their brands"
  ON public.deals FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can insert deals in their brands"
  ON public.deals FOR INSERT
  WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can update deals in their brands"
  ON public.deals FOR UPDATE
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- RLS Policies for deal_stage_history (read-only for users)
CREATE POLICY "Users can view stage history in their brands"
  ON public.deal_stage_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
      AND user_belongs_to_brand(get_user_id(auth.uid()), d.brand_id)
    )
  );

CREATE POLICY "Users can insert stage history"
  ON public.deal_stage_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
      AND user_belongs_to_brand(get_user_id(auth.uid()), d.brand_id)
    )
  );

-- Add updated_at trigger to deals
CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to auto-record stage changes
CREATE OR REPLACE FUNCTION public.track_deal_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only insert if stage actually changed
  IF (OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id) THEN
    INSERT INTO public.deal_stage_history (deal_id, from_stage_id, to_stage_id, notes)
    VALUES (NEW.id, OLD.current_stage_id, NEW.current_stage_id, 'Stage changed');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER deal_stage_change_trigger
  AFTER UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.track_deal_stage_change();

-- Add deal_id FK to lead_events if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lead_events' 
    AND column_name = 'deal_id'
  ) THEN
    ALTER TABLE public.lead_events 
    ADD COLUMN deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Performance indexes
CREATE INDEX idx_deals_brand_id ON public.deals(brand_id);
CREATE INDEX idx_deals_contact_id ON public.deals(contact_id);
CREATE INDEX idx_deals_status ON public.deals(brand_id, status);
CREATE INDEX idx_deals_current_stage ON public.deals(current_stage_id);
CREATE INDEX idx_deal_stage_history_deal_id ON public.deal_stage_history(deal_id);