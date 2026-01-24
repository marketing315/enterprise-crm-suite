-- Drop and recreate assign_ticket_round_robin with auto_assign check
DROP FUNCTION IF EXISTS public.assign_ticket_round_robin(uuid, uuid);

CREATE FUNCTION public.assign_ticket_round_robin(
  p_ticket_id uuid,
  p_brand_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_user_id uuid;
  v_last_assigned_user_id uuid;
  v_auto_assign_enabled boolean;
BEGIN
  -- Check if auto-assign is enabled for this brand
  SELECT auto_assign_enabled INTO v_auto_assign_enabled
  FROM brands
  WHERE id = p_brand_id;
  
  -- If auto-assign is disabled, return null (no assignment)
  IF v_auto_assign_enabled IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- Get last assigned user for this brand
  SELECT last_assigned_user_id INTO v_last_assigned_user_id
  FROM brand_assignment_state
  WHERE brand_id = p_brand_id;

  -- Get next operator in round-robin order
  SELECT ur.user_id INTO v_next_user_id
  FROM user_roles ur
  WHERE ur.brand_id = p_brand_id
    AND ur.role IN ('callcenter', 'admin')
    AND (v_last_assigned_user_id IS NULL OR ur.user_id > v_last_assigned_user_id)
  ORDER BY ur.user_id
  LIMIT 1;

  -- If no user found after last assigned, wrap around to first
  IF v_next_user_id IS NULL THEN
    SELECT ur.user_id INTO v_next_user_id
    FROM user_roles ur
    WHERE ur.brand_id = p_brand_id
      AND ur.role IN ('callcenter', 'admin')
    ORDER BY ur.user_id
    LIMIT 1;
  END IF;

  -- If still no user found, return null
  IF v_next_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Update ticket assignment
  UPDATE tickets
  SET 
    assigned_to_user_id = v_next_user_id,
    assigned_at = now(),
    assigned_by_user_id = NULL  -- NULL indicates auto-assignment
  WHERE id = p_ticket_id;

  -- Update or insert brand assignment state
  INSERT INTO brand_assignment_state (brand_id, last_assigned_user_id, updated_at)
  VALUES (p_brand_id, v_next_user_id, now())
  ON CONFLICT (brand_id)
  DO UPDATE SET 
    last_assigned_user_id = v_next_user_id,
    updated_at = now();

  RETURN v_next_user_id;
END;
$$;

-- Drop and recreate assign_unassigned_support_tickets with auto_assign check
DROP FUNCTION IF EXISTS public.assign_unassigned_support_tickets(uuid);

CREATE FUNCTION public.assign_unassigned_support_tickets(p_brand_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket RECORD;
  v_assigned_count integer := 0;
  v_auto_assign_enabled boolean;
BEGIN
  -- Check if auto-assign is enabled for this brand
  SELECT auto_assign_enabled INTO v_auto_assign_enabled
  FROM brands
  WHERE id = p_brand_id;
  
  -- If auto-assign is disabled, return 0 (no assignments)
  IF v_auto_assign_enabled IS NOT TRUE THEN
    RETURN 0;
  END IF;

  -- Find unassigned support tickets (created by AI with should_create_ticket flag)
  FOR v_ticket IN
    SELECT t.id
    FROM tickets t
    JOIN lead_events le ON le.id = t.source_event_id
    WHERE t.brand_id = p_brand_id
      AND t.assigned_to_user_id IS NULL
      AND t.status IN ('open', 'reopened')
      AND le.should_create_ticket = true
    ORDER BY t.created_at ASC
  LOOP
    -- Assign using round-robin
    IF assign_ticket_round_robin(v_ticket.id, p_brand_id) IS NOT NULL THEN
      v_assigned_count := v_assigned_count + 1;
    END IF;
  END LOOP;

  RETURN v_assigned_count;
END;
$$;