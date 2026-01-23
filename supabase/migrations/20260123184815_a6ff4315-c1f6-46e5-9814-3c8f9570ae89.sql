
-- Fix: crea indice solo se non esiste
CREATE INDEX IF NOT EXISTS idx_lead_events_deal ON public.lead_events(deal_id) WHERE deal_id IS NOT NULL;
