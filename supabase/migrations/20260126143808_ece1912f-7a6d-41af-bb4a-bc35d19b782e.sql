-- Add sla_breached_at column to tickets table
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS sla_breached_at timestamp with time zone DEFAULT NULL;

-- Create index for efficient SLA breach queries
CREATE INDEX IF NOT EXISTS idx_tickets_sla_breach 
ON public.tickets (brand_id, status, sla_breached_at) 
WHERE status IN ('open', 'in_progress', 'reopened');

-- Add sla_breach action type to audit enum
ALTER TYPE public.ticket_audit_action ADD VALUE IF NOT EXISTS 'sla_breach';

-- Create function to check and mark SLA breaches
CREATE OR REPLACE FUNCTION public.check_and_mark_sla_breaches(p_brand_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sla_thresholds jsonb;
  v_breached_count integer := 0;
  v_ticket RECORD;
BEGIN
  -- Get SLA thresholds for this brand
  SELECT sla_thresholds_minutes INTO v_sla_thresholds
  FROM brands
  WHERE id = p_brand_id;
  
  IF v_sla_thresholds IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Find and mark tickets that have breached SLA but not yet marked
  FOR v_ticket IN
    SELECT t.id, t.priority, t.opened_at
    FROM tickets t
    WHERE t.brand_id = p_brand_id
      AND t.status IN ('open', 'in_progress', 'reopened')
      AND t.sla_breached_at IS NULL
      AND (
        EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 > 
        COALESCE((v_sla_thresholds->>t.priority::text)::numeric, 1440)
      )
  LOOP
    -- Mark the ticket as breached
    UPDATE tickets
    SET sla_breached_at = now()
    WHERE id = v_ticket.id;
    
    -- Log to audit trail
    INSERT INTO ticket_audit_logs (brand_id, ticket_id, action_type, new_value, metadata)
    VALUES (
      p_brand_id,
      v_ticket.id,
      'sla_breach',
      jsonb_build_object('priority', v_ticket.priority, 'age_minutes', 
        ROUND(EXTRACT(EPOCH FROM (now() - v_ticket.opened_at)) / 60)),
      jsonb_build_object(
        'threshold_minutes', (v_sla_thresholds->>v_ticket.priority::text)::integer,
        'detected_at', now()
      )
    );
    
    v_breached_count := v_breached_count + 1;
  END LOOP;
  
  RETURN v_breached_count;
END;
$$;

-- Create function to check all brands (for cron job)
CREATE OR REPLACE FUNCTION public.check_all_brands_sla_breaches()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand RECORD;
  v_total_breached integer := 0;
  v_brand_results jsonb := '[]'::jsonb;
  v_count integer;
BEGIN
  FOR v_brand IN SELECT id, name FROM brands
  LOOP
    SELECT check_and_mark_sla_breaches(v_brand.id) INTO v_count;
    
    IF v_count > 0 THEN
      v_total_breached := v_total_breached + v_count;
      v_brand_results := v_brand_results || jsonb_build_object(
        'brand_id', v_brand.id,
        'brand_name', v_brand.name,
        'breached_count', v_count
      );
    END IF;
  END LOOP;
  
  RETURN json_build_object(
    'total_breached', v_total_breached,
    'brands', v_brand_results,
    'checked_at', now()
  );
END;
$$;