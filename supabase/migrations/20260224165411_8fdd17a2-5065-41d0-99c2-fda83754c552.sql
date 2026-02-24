-- Fix: get_or_create_entity_thread uses role 'admin' but check constraint only allows owner/moderator/member
CREATE OR REPLACE FUNCTION public.get_or_create_entity_thread(p_brand_id uuid, p_entity_type text, p_entity_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_thread_id uuid;
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  -- Check brand access
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied to this brand';
  END IF;
  
  -- Try to find existing thread
  SELECT id INTO v_thread_id
  FROM chat_threads
  WHERE brand_id = p_brand_id 
    AND entity_type = p_entity_type 
    AND entity_id = p_entity_id
    AND type = 'entity';
  
  -- Create if not exists
  IF v_thread_id IS NULL THEN
    INSERT INTO chat_threads (brand_id, type, entity_type, entity_id, created_by)
    VALUES (p_brand_id, 'entity', p_entity_type, p_entity_id, v_user_id)
    RETURNING id INTO v_thread_id;
    
    -- Add creator as member (use 'owner' instead of invalid 'admin')
    INSERT INTO chat_thread_members (thread_id, user_id, role)
    VALUES (v_thread_id, v_user_id, 'owner');
  END IF;
  
  -- Ensure current user is member
  INSERT INTO chat_thread_members (thread_id, user_id)
  VALUES (v_thread_id, v_user_id)
  ON CONFLICT (thread_id, user_id) DO NOTHING;
  
  RETURN v_thread_id;
END;
$function$