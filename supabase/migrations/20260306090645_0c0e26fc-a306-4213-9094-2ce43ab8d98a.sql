
-- 1) Add 'executive' to chat_thread_type enum
ALTER TYPE public.chat_thread_type ADD VALUE IF NOT EXISTS 'executive';

-- 2) Add delivery_status and tool trace columns to chat_messages
ALTER TABLE public.chat_messages 
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS tool_trace_id uuid;

-- 3) Create ai_chat_runs table for observability
CREATE TABLE IF NOT EXISTS public.ai_chat_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  user_message_id uuid REFERENCES public.chat_messages(id),
  assistant_message_id uuid REFERENCES public.chat_messages(id),
  status text NOT NULL DEFAULT 'pending',
  error_code text,
  error_message text,
  latency_ms integer,
  tools_json jsonb DEFAULT '[]'::jsonb,
  model text,
  tokens_used integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.ai_chat_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brand runs"
  ON public.ai_chat_runs FOR SELECT TO authenticated
  USING (brand_id IN (
    SELECT ur.brand_id FROM public.user_roles ur 
    JOIN public.users u ON u.id = ur.user_id 
    WHERE u.supabase_auth_id = auth.uid()
  ));

-- 4) RPC: get or create executive thread for a user+brand
CREATE OR REPLACE FUNCTION public.get_or_create_executive_thread(
  p_brand_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id uuid;
  v_crm_user_id uuid;
BEGIN
  -- Get CRM user id
  SELECT id INTO v_crm_user_id FROM public.users WHERE supabase_auth_id = p_user_id;
  IF v_crm_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Find existing executive thread for this user+brand
  SELECT ct.id INTO v_thread_id
  FROM public.chat_threads ct
  JOIN public.chat_thread_members ctm ON ctm.thread_id = ct.id
  WHERE ct.brand_id = p_brand_id
    AND ct.type = 'executive'
    AND ctm.user_id = v_crm_user_id
    AND ctm.left_at IS NULL
  LIMIT 1;

  IF v_thread_id IS NOT NULL THEN
    RETURN v_thread_id;
  END IF;

  -- Create new executive thread
  INSERT INTO public.chat_threads (brand_id, type, title, created_by)
  VALUES (p_brand_id, 'executive', 'Agente Executive', v_crm_user_id)
  RETURNING id INTO v_thread_id;

  -- Add user as owner
  INSERT INTO public.chat_thread_members (thread_id, user_id, role)
  VALUES (v_thread_id, v_crm_user_id, 'owner');

  RETURN v_thread_id;
END;
$$;
