-- M5: Ticketing System

-- 1. Ticket status enum
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'reopened');

-- 2. Ticket creator enum
CREATE TYPE public.ticket_creator AS ENUM ('ai', 'user', 'rule');

-- 3. Tickets table
CREATE TABLE public.tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  title TEXT NOT NULL,
  description TEXT,
  category_tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by public.ticket_creator NOT NULL DEFAULT 'user',
  source_event_id UUID REFERENCES public.lead_events(id) ON DELETE SET NULL,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Ticket events (link multiple lead_events to ticket)
CREATE TABLE public.ticket_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  lead_event_id UUID REFERENCES public.lead_events(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Ticket comments (internal notes)
CREATE TABLE public.ticket_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Indexes
CREATE INDEX idx_tickets_brand_status ON public.tickets(brand_id, status, created_at DESC);
CREATE INDEX idx_tickets_brand_contact ON public.tickets(brand_id, contact_id);
CREATE INDEX idx_tickets_assigned ON public.tickets(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX idx_ticket_events_ticket ON public.ticket_events(ticket_id, created_at DESC);
CREATE INDEX idx_ticket_comments_ticket ON public.ticket_comments(ticket_id, created_at DESC);

-- 7. Trigger for updated_at
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Enable RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies for tickets
CREATE POLICY "Users can view tickets in their brands"
  ON public.tickets FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can insert tickets in their brands"
  ON public.tickets FOR INSERT
  WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can update tickets in their brands"
  ON public.tickets FOR UPDATE
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- 10. RLS Policies for ticket_events
CREATE POLICY "Users can view ticket events in their brands"
  ON public.ticket_events FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can insert ticket events in their brands"
  ON public.ticket_events FOR INSERT
  WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- 11. RLS Policies for ticket_comments
CREATE POLICY "Users can view comments in their brands"
  ON public.ticket_comments FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can insert comments in their brands"
  ON public.ticket_comments FOR INSERT
  WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can update their own comments"
  ON public.ticket_comments FOR UPDATE
  USING (author_user_id = get_user_id(auth.uid()));

CREATE POLICY "Users can delete their own comments"
  ON public.ticket_comments FOR DELETE
  USING (author_user_id = get_user_id(auth.uid()));

-- 12. Function to find or create ticket (anti-duplicate logic)
CREATE OR REPLACE FUNCTION public.find_or_create_ticket(
  p_brand_id UUID,
  p_contact_id UUID,
  p_deal_id UUID,
  p_lead_event_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_priority INTEGER,
  p_category_tag_id UUID DEFAULT NULL
)
RETURNS TABLE(ticket_id UUID, is_new BOOLEAN, ticket_event_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id UUID;
  v_is_new BOOLEAN := false;
  v_ticket_event_id UUID;
  v_reopen_threshold INTERVAL := '30 days';
BEGIN
  -- 1. Look for existing open/in_progress/reopened ticket for same contact+category
  SELECT t.id INTO v_ticket_id
  FROM tickets t
  WHERE t.brand_id = p_brand_id
    AND t.contact_id = p_contact_id
    AND t.status IN ('open', 'in_progress', 'reopened')
    AND (
      (p_category_tag_id IS NULL AND t.category_tag_id IS NULL)
      OR t.category_tag_id = p_category_tag_id
    )
  ORDER BY t.created_at DESC
  LIMIT 1;

  -- 2. If not found, check for recently closed ticket to reopen
  IF v_ticket_id IS NULL THEN
    SELECT t.id INTO v_ticket_id
    FROM tickets t
    WHERE t.brand_id = p_brand_id
      AND t.contact_id = p_contact_id
      AND t.status IN ('resolved', 'closed')
      AND t.closed_at > (now() - v_reopen_threshold)
      AND (
        (p_category_tag_id IS NULL AND t.category_tag_id IS NULL)
        OR t.category_tag_id = p_category_tag_id
      )
    ORDER BY t.closed_at DESC
    LIMIT 1;

    -- Reopen the ticket
    IF v_ticket_id IS NOT NULL THEN
      UPDATE tickets
      SET status = 'reopened',
          resolved_at = NULL,
          closed_at = NULL,
          updated_at = now()
      WHERE id = v_ticket_id;
    END IF;
  END IF;

  -- 3. If still not found, create new ticket
  IF v_ticket_id IS NULL THEN
    INSERT INTO tickets (
      brand_id, contact_id, deal_id, title, description,
      priority, category_tag_id, created_by, source_event_id
    )
    VALUES (
      p_brand_id, p_contact_id, p_deal_id, p_title, p_description,
      COALESCE(p_priority, 3), p_category_tag_id, 'ai', p_lead_event_id
    )
    RETURNING id INTO v_ticket_id;
    
    v_is_new := true;
  END IF;

  -- 4. Always create ticket_event to link lead_event
  INSERT INTO ticket_events (brand_id, ticket_id, lead_event_id, note)
  VALUES (
    p_brand_id, 
    v_ticket_id, 
    p_lead_event_id,
    CASE WHEN v_is_new THEN 'Ticket creato automaticamente' ELSE 'Nuova richiesta collegata' END
  )
  RETURNING id INTO v_ticket_event_id;

  RETURN QUERY SELECT v_ticket_id, v_is_new, v_ticket_event_id;
END;
$$;