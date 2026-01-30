-- =====================================================
-- Pipeline CRUD: RPCs for admin stage management
-- =====================================================

-- Unique constraint on active stage names per brand
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_stages_unique_name 
ON public.pipeline_stages (brand_id, lower(name)) 
WHERE is_active = true;

-- RPC: Create new pipeline stage
CREATE OR REPLACE FUNCTION public.create_pipeline_stage(
  p_brand_id uuid,
  p_name text,
  p_color text DEFAULT '#6366f1',
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_max_order int;
  v_new_id uuid;
BEGIN
  -- Get user ID
  v_user_id := get_user_id(auth.uid());
  
  -- Check admin permission
  IF NOT has_role_for_brand(v_user_id, p_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;
  
  -- Validate name
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Stage name cannot be empty';
  END IF;
  
  -- Get max order_index
  SELECT COALESCE(MAX(order_index), -1) INTO v_max_order
  FROM pipeline_stages
  WHERE brand_id = p_brand_id AND is_active = true;
  
  -- Insert new stage
  INSERT INTO pipeline_stages (brand_id, name, color, description, order_index, is_active)
  VALUES (p_brand_id, trim(p_name), p_color, p_description, v_max_order + 1, true)
  RETURNING id INTO v_new_id;
  
  -- Audit log
  INSERT INTO audit_log (brand_id, actor_user_id, entity_type, entity_id, action, new_value)
  VALUES (p_brand_id, v_user_id, 'pipeline_stage', v_new_id, 'created', 
          jsonb_build_object('name', trim(p_name), 'color', p_color));
  
  RETURN v_new_id;
END;
$$;

-- RPC: Update pipeline stage (rename, change color)
CREATE OR REPLACE FUNCTION public.update_pipeline_stage(
  p_stage_id uuid,
  p_name text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
  v_old_data jsonb;
BEGIN
  -- Get user ID
  v_user_id := get_user_id(auth.uid());
  
  -- Get stage and check exists
  SELECT brand_id, jsonb_build_object('name', name, 'color', color, 'description', description)
  INTO v_brand_id, v_old_data
  FROM pipeline_stages
  WHERE id = p_stage_id;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Stage not found';
  END IF;
  
  -- Check admin permission
  IF NOT has_role_for_brand(v_user_id, v_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;
  
  -- Update stage
  UPDATE pipeline_stages
  SET 
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    color = COALESCE(p_color, color),
    description = COALESCE(p_description, description),
    updated_at = now()
  WHERE id = p_stage_id;
  
  -- Audit log
  INSERT INTO audit_log (brand_id, actor_user_id, entity_type, entity_id, action, old_value, new_value)
  VALUES (v_brand_id, v_user_id, 'pipeline_stage', p_stage_id, 'updated', v_old_data,
          jsonb_build_object('name', p_name, 'color', p_color, 'description', p_description));
END;
$$;

-- RPC: Reorder pipeline stages
CREATE OR REPLACE FUNCTION public.reorder_pipeline_stages(
  p_stage_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
  v_idx int;
BEGIN
  -- Get user ID
  v_user_id := get_user_id(auth.uid());
  
  -- Get brand from first stage
  SELECT brand_id INTO v_brand_id
  FROM pipeline_stages
  WHERE id = p_stage_ids[1];
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'No stages found';
  END IF;
  
  -- Check admin permission
  IF NOT has_role_for_brand(v_user_id, v_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;
  
  -- Update order for each stage
  FOR v_idx IN 1..array_length(p_stage_ids, 1) LOOP
    UPDATE pipeline_stages
    SET order_index = v_idx - 1, updated_at = now()
    WHERE id = p_stage_ids[v_idx] AND brand_id = v_brand_id;
  END LOOP;
  
  -- Audit log
  INSERT INTO audit_log (brand_id, actor_user_id, entity_type, entity_id, action, new_value)
  VALUES (v_brand_id, v_user_id, 'pipeline_stages', v_brand_id, 'reordered',
          jsonb_build_object('order', p_stage_ids));
END;
$$;

-- RPC: Deactivate pipeline stage with fallback
CREATE OR REPLACE FUNCTION public.deactivate_pipeline_stage(
  p_stage_id uuid,
  p_fallback_stage_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
  v_stage_name text;
  v_fallback_name text;
  v_deals_moved int;
BEGIN
  -- Get user ID
  v_user_id := get_user_id(auth.uid());
  
  -- Get stage info
  SELECT brand_id, name INTO v_brand_id, v_stage_name
  FROM pipeline_stages
  WHERE id = p_stage_id AND is_active = true;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Stage not found or already inactive';
  END IF;
  
  -- Check admin permission
  IF NOT has_role_for_brand(v_user_id, v_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;
  
  -- Validate fallback stage
  SELECT name INTO v_fallback_name
  FROM pipeline_stages
  WHERE id = p_fallback_stage_id AND brand_id = v_brand_id AND is_active = true;
  
  IF v_fallback_name IS NULL THEN
    RAISE EXCEPTION 'Fallback stage not found or inactive';
  END IF;
  
  IF p_stage_id = p_fallback_stage_id THEN
    RAISE EXCEPTION 'Cannot use the same stage as fallback';
  END IF;
  
  -- Move deals to fallback stage
  WITH moved AS (
    UPDATE deals
    SET current_stage_id = p_fallback_stage_id, updated_at = now()
    WHERE current_stage_id = p_stage_id AND brand_id = v_brand_id
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deals_moved FROM moved;
  
  -- Deactivate stage (soft delete)
  UPDATE pipeline_stages
  SET is_active = false, updated_at = now()
  WHERE id = p_stage_id;
  
  -- Audit log
  INSERT INTO audit_log (brand_id, actor_user_id, entity_type, entity_id, action, old_value, new_value, metadata)
  VALUES (v_brand_id, v_user_id, 'pipeline_stage', p_stage_id, 'deactivated',
          jsonb_build_object('name', v_stage_name),
          jsonb_build_object('fallback_stage_id', p_fallback_stage_id, 'fallback_name', v_fallback_name),
          jsonb_build_object('deals_moved', v_deals_moved));
  
  RETURN jsonb_build_object(
    'success', true,
    'stage_name', v_stage_name,
    'fallback_name', v_fallback_name,
    'deals_moved', v_deals_moved
  );
END;
$$;

-- =====================================================
-- Notifications system
-- =====================================================

-- Notification types enum
CREATE TYPE notification_type AS ENUM (
  'lead_event_created',
  'pipeline_stage_changed',
  'ticket_created',
  'ticket_assigned',
  'ticket_status_changed',
  'appointment_created',
  'appointment_updated',
  'appointment_reminder',
  'tag_updated',
  'ai_decision_ready',
  'chat_message'
);

-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, brand_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_created ON notifications(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their notifications"
ON notifications FOR SELECT
USING (user_id = get_user_id(auth.uid()));

CREATE POLICY "Users can update their notifications (mark read)"
ON notifications FOR UPDATE
USING (user_id = get_user_id(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Notification preferences table
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, brand_id, notification_type)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their notification preferences"
ON notification_preferences FOR ALL
USING (user_id = get_user_id(auth.uid()))
WITH CHECK (user_id = get_user_id(auth.uid()));

-- RPC: Mark notifications as read
CREATE OR REPLACE FUNCTION public.mark_notifications_read(
  p_notification_ids uuid[]
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count int;
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  WITH updated AS (
    UPDATE notifications
    SET read_at = now()
    WHERE id = ANY(p_notification_ids) 
      AND user_id = v_user_id 
      AND read_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  
  RETURN v_count;
END;
$$;

-- RPC: Get unread notification count
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(
  p_brand_id uuid DEFAULT NULL
)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM notifications
  WHERE user_id = get_user_id(auth.uid())
    AND read_at IS NULL
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);
$$;

-- =====================================================
-- Chat system (thread-based)
-- =====================================================

-- Thread type enum
CREATE TYPE chat_thread_type AS ENUM ('direct', 'group', 'entity');

-- Chat threads table
CREATE TABLE public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type chat_thread_type NOT NULL,
  entity_type text,
  entity_id uuid,
  title text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_chat_threads_brand ON chat_threads(brand_id);
CREATE INDEX idx_chat_threads_entity ON chat_threads(entity_type, entity_id) WHERE entity_type IS NOT NULL;
CREATE UNIQUE INDEX idx_chat_threads_entity_unique ON chat_threads(brand_id, entity_type, entity_id) WHERE type = 'entity';

-- Enable RLS
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;

-- Thread members table
CREATE TABLE public.chat_thread_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE(thread_id, user_id)
);

CREATE INDEX idx_chat_thread_members_user ON chat_thread_members(user_id) WHERE left_at IS NULL;
CREATE INDEX idx_chat_thread_members_thread ON chat_thread_members(thread_id) WHERE left_at IS NULL;

ALTER TABLE chat_thread_members ENABLE ROW LEVEL SECURITY;

-- Sender type enum
CREATE TYPE chat_sender_type AS ENUM ('user', 'ai', 'system');

-- Chat messages table
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id),
  sender_type chat_sender_type NOT NULL DEFAULT 'user',
  message_text text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  ai_context jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_id, created_at DESC);
CREATE INDEX idx_chat_messages_brand ON chat_messages(brand_id);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- Message read receipts
CREATE TABLE public.chat_message_reads (
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

ALTER TABLE chat_message_reads ENABLE ROW LEVEL SECURITY;

-- Enable realtime for read receipts
ALTER PUBLICATION supabase_realtime ADD TABLE chat_message_reads;

-- Helper function: check if user is thread member
CREATE OR REPLACE FUNCTION public.is_thread_member(p_user_id uuid, p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_thread_members
    WHERE user_id = p_user_id 
      AND thread_id = p_thread_id 
      AND left_at IS NULL
  );
$$;

-- RLS policies for chat_threads
CREATE POLICY "Users can view threads they are members of"
ON chat_threads FOR SELECT
USING (
  is_thread_member(get_user_id(auth.uid()), id)
  OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin')
  OR has_role(get_user_id(auth.uid()), 'ceo')
);

CREATE POLICY "Users can create threads in their brands"
ON chat_threads FOR INSERT
WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- RLS policies for chat_thread_members
CREATE POLICY "Thread members can view membership"
ON chat_thread_members FOR SELECT
USING (
  is_thread_member(get_user_id(auth.uid()), thread_id)
  OR EXISTS (
    SELECT 1 FROM chat_threads t
    WHERE t.id = thread_id
    AND (has_role_for_brand(get_user_id(auth.uid()), t.brand_id, 'admin')
         OR has_role(get_user_id(auth.uid()), 'ceo'))
  )
);

CREATE POLICY "Thread admins can manage membership"
ON chat_thread_members FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM chat_thread_members m
    WHERE m.thread_id = chat_thread_members.thread_id
      AND m.user_id = get_user_id(auth.uid())
      AND m.role = 'admin'
      AND m.left_at IS NULL
  )
);

-- RLS policies for chat_messages
CREATE POLICY "Thread members can view messages"
ON chat_messages FOR SELECT
USING (
  is_thread_member(get_user_id(auth.uid()), thread_id)
  OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin')
  OR has_role(get_user_id(auth.uid()), 'ceo')
);

CREATE POLICY "Thread members can send messages"
ON chat_messages FOR INSERT
WITH CHECK (
  is_thread_member(get_user_id(auth.uid()), thread_id)
  AND user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
);

CREATE POLICY "Users can edit their own messages"
ON chat_messages FOR UPDATE
USING (sender_user_id = get_user_id(auth.uid()));

-- RLS policies for chat_message_reads
CREATE POLICY "Users can view their read receipts"
ON chat_message_reads FOR SELECT
USING (user_id = get_user_id(auth.uid()));

CREATE POLICY "Users can mark messages as read"
ON chat_message_reads FOR INSERT
WITH CHECK (user_id = get_user_id(auth.uid()));

-- =====================================================
-- Deal stage lock for AI override protection
-- =====================================================
ALTER TABLE deals ADD COLUMN IF NOT EXISTS stage_locked_by_user boolean NOT NULL DEFAULT false;

-- RPC: Get or create entity thread
CREATE OR REPLACE FUNCTION public.get_or_create_entity_thread(
  p_brand_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    
    -- Add creator as member
    INSERT INTO chat_thread_members (thread_id, user_id, role)
    VALUES (v_thread_id, v_user_id, 'admin');
  END IF;
  
  -- Ensure current user is member
  INSERT INTO chat_thread_members (thread_id, user_id)
  VALUES (v_thread_id, v_user_id)
  ON CONFLICT (thread_id, user_id) DO NOTHING;
  
  RETURN v_thread_id;
END;
$$;

-- RPC: Send chat message
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_thread_id uuid,
  p_message_text text,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
  v_message_id uuid;
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  -- Get thread and check membership
  SELECT brand_id INTO v_brand_id
  FROM chat_threads
  WHERE id = p_thread_id;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Thread not found';
  END IF;
  
  IF NOT is_thread_member(v_user_id, p_thread_id) THEN
    RAISE EXCEPTION 'Not a member of this thread';
  END IF;
  
  -- Insert message
  INSERT INTO chat_messages (thread_id, brand_id, sender_user_id, sender_type, message_text, attachments)
  VALUES (p_thread_id, v_brand_id, v_user_id, 'user', p_message_text, p_attachments)
  RETURNING id INTO v_message_id;
  
  -- Update thread timestamp
  UPDATE chat_threads SET updated_at = now() WHERE id = p_thread_id;
  
  -- Auto-mark as read by sender
  INSERT INTO chat_message_reads (message_id, user_id)
  VALUES (v_message_id, v_user_id);
  
  RETURN v_message_id;
END;
$$;