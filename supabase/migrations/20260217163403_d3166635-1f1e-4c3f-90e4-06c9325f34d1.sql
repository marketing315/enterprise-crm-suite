
-- Add source_context column to tickets table
-- Tracks where the ticket was created from (UI origin)
ALTER TABLE public.tickets
ADD COLUMN source_context text CHECK (source_context IN ('contact_sheet', 'deal_sheet', 'pipeline', 'ticket_list', 'automation', 'api'));

-- Create index for filtering by source_context
CREATE INDEX idx_tickets_source_context ON public.tickets (source_context) WHERE source_context IS NOT NULL;

-- Add audit trigger for ticket creation with source tracking
CREATE OR REPLACE FUNCTION public.audit_ticket_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_log (
    brand_id,
    entity_type,
    entity_id,
    action,
    new_value,
    metadata
  ) VALUES (
    NEW.brand_id,
    'ticket',
    NEW.id,
    'ticket_created_from_entity',
    jsonb_build_object(
      'title', NEW.title,
      'contact_id', NEW.contact_id,
      'deal_id', NEW.deal_id,
      'priority', NEW.priority,
      'source_context', NEW.source_context
    ),
    jsonb_build_object('source_context', NEW.source_context)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger (drop first if exists to be idempotent)
DROP TRIGGER IF EXISTS trg_audit_ticket_created ON public.tickets;
CREATE TRIGGER trg_audit_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_ticket_created();
