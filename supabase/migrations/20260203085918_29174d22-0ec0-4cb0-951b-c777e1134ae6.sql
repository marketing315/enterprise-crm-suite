-- Create RPC to create a group chat with members
CREATE OR REPLACE FUNCTION public.create_group_chat(
  p_brand_id uuid,
  p_title text,
  p_member_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id uuid;
  v_user_id uuid;
  v_member_id uuid;
BEGIN
  -- Get current user
  v_user_id := get_user_id(auth.uid());
  
  -- Verify user belongs to brand
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'User does not belong to this brand';
  END IF;
  
  -- Create the thread
  INSERT INTO chat_threads (brand_id, type, title, created_by)
  VALUES (p_brand_id, 'group', p_title, v_user_id)
  RETURNING id INTO v_thread_id;
  
  -- Add creator as admin member
  INSERT INTO chat_thread_members (thread_id, user_id, role)
  VALUES (v_thread_id, v_user_id, 'admin');
  
  -- Add other members
  FOREACH v_member_id IN ARRAY p_member_ids
  LOOP
    -- Only add if member belongs to brand and is not creator
    IF v_member_id != v_user_id AND user_belongs_to_brand(v_member_id, p_brand_id) THEN
      INSERT INTO chat_thread_members (thread_id, user_id, role)
      VALUES (v_thread_id, v_member_id, 'member')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  
  RETURN v_thread_id;
END;
$$;