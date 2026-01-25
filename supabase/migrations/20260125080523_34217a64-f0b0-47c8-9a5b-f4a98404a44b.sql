-- Create enum for audit action types
CREATE TYPE public.ticket_audit_action AS ENUM (
  'created',
  'status_change',
  'assignment_change',
  'priority_change',
  'category_change',
  'comment_added'
);

-- Create ticket audit log table
CREATE TABLE public.ticket_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action_type ticket_audit_action NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_ticket_audit_logs_ticket_id ON public.ticket_audit_logs(ticket_id);
CREATE INDEX idx_ticket_audit_logs_brand_id ON public.ticket_audit_logs(brand_id);
CREATE INDEX idx_ticket_audit_logs_created_at ON public.ticket_audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.ticket_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view audit logs in their brands"
ON public.ticket_audit_logs FOR SELECT
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Trigger function for ticket changes
CREATE OR REPLACE FUNCTION public.log_ticket_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Try to get current user (may be null for system operations)
  SELECT get_user_id(auth.uid()) INTO v_user_id;

  IF TG_OP = 'INSERT' THEN
    -- Log ticket creation
    INSERT INTO ticket_audit_logs (brand_id, ticket_id, user_id, action_type, new_value, metadata)
    VALUES (
      NEW.brand_id,
      NEW.id,
      v_user_id,
      'created',
      jsonb_build_object(
        'status', NEW.status,
        'priority', NEW.priority,
        'category_tag_id', NEW.category_tag_id,
        'assigned_to_user_id', NEW.assigned_to_user_id
      ),
      jsonb_build_object('created_by', NEW.created_by)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Log status change
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO ticket_audit_logs (brand_id, ticket_id, user_id, action_type, old_value, new_value)
      VALUES (
        NEW.brand_id,
        NEW.id,
        v_user_id,
        'status_change',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status)
      );
    END IF;

    -- Log assignment change
    IF OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id THEN
      INSERT INTO ticket_audit_logs (brand_id, ticket_id, user_id, action_type, old_value, new_value, metadata)
      VALUES (
        NEW.brand_id,
        NEW.id,
        v_user_id,
        'assignment_change',
        jsonb_build_object('assigned_to_user_id', OLD.assigned_to_user_id),
        jsonb_build_object('assigned_to_user_id', NEW.assigned_to_user_id),
        jsonb_build_object(
          'assigned_by_user_id', NEW.assigned_by_user_id,
          'is_auto', NEW.assigned_by_user_id IS NULL AND NEW.assigned_to_user_id IS NOT NULL
        )
      );
    END IF;

    -- Log priority change
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
      INSERT INTO ticket_audit_logs (brand_id, ticket_id, user_id, action_type, old_value, new_value)
      VALUES (
        NEW.brand_id,
        NEW.id,
        v_user_id,
        'priority_change',
        jsonb_build_object('priority', OLD.priority),
        jsonb_build_object('priority', NEW.priority)
      );
    END IF;

    -- Log category change
    IF OLD.category_tag_id IS DISTINCT FROM NEW.category_tag_id THEN
      INSERT INTO ticket_audit_logs (brand_id, ticket_id, user_id, action_type, old_value, new_value)
      VALUES (
        NEW.brand_id,
        NEW.id,
        v_user_id,
        'category_change',
        jsonb_build_object('category_tag_id', OLD.category_tag_id),
        jsonb_build_object('category_tag_id', NEW.category_tag_id)
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- Create trigger on tickets table
CREATE TRIGGER ticket_audit_trigger
AFTER INSERT OR UPDATE ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.log_ticket_changes();

-- Trigger function for comment additions
CREATE OR REPLACE FUNCTION public.log_ticket_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO ticket_audit_logs (brand_id, ticket_id, user_id, action_type, new_value)
  VALUES (
    NEW.brand_id,
    NEW.ticket_id,
    NEW.author_user_id,
    'comment_added',
    jsonb_build_object('comment_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

-- Create trigger on ticket_comments table
CREATE TRIGGER ticket_comment_audit_trigger
AFTER INSERT ON public.ticket_comments
FOR EACH ROW
EXECUTE FUNCTION public.log_ticket_comment();