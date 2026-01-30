-- Fix foreign key: meta_lead_events.source_id should reference meta_apps, not meta_lead_sources
ALTER TABLE public.meta_lead_events 
DROP CONSTRAINT IF EXISTS meta_lead_events_source_id_fkey;

ALTER TABLE public.meta_lead_events 
ADD CONSTRAINT meta_lead_events_source_id_fkey 
FOREIGN KEY (source_id) REFERENCES public.meta_apps(id) ON DELETE CASCADE;