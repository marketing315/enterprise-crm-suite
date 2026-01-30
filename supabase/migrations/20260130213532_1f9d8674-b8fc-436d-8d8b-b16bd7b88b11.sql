-- Create enum for AI mode
CREATE TYPE public.ai_mode AS ENUM ('off', 'suggest', 'auto_apply');

-- Create ai_configs table for per-brand AI configuration
CREATE TABLE public.ai_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE UNIQUE,
  mode ai_mode NOT NULL DEFAULT 'off',
  active_prompt_version TEXT,
  rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_configs ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_configs
CREATE POLICY "Admins and CEOs can view AI configs"
ON public.ai_configs
FOR SELECT
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

CREATE POLICY "Admins and CEOs can update AI configs"
ON public.ai_configs
FOR UPDATE
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

CREATE POLICY "Admins and CEOs can insert AI configs"
ON public.ai_configs
FOR INSERT
WITH CHECK (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- Create ai_prompts table for prompt versioning
CREATE TABLE public.ai_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- 'decision_service' or 'ai_chat'
  version TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(brand_id, name, version)
);

-- Enable RLS
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_prompts
CREATE POLICY "Admins and CEOs can manage AI prompts"
ON public.ai_prompts
FOR ALL
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
)
WITH CHECK (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- Create ai_feedback table for human feedback on AI decisions
CREATE TABLE public.ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_decision_id UUID NOT NULL REFERENCES public.ai_decision_logs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label IN ('correct', 'incorrect')),
  corrected_output_json JSONB,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_feedback
CREATE POLICY "Users can view AI feedback in their brands"
ON public.ai_feedback
FOR SELECT
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can insert AI feedback in their brands"
ON public.ai_feedback
FOR INSERT
WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Create ai_chat_logs table for AI assistant conversations
CREATE TABLE public.ai_chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  entity_type TEXT, -- 'contact', 'deal', 'ticket'
  entity_id UUID,
  tool_name TEXT, -- 'summarize_contact', 'suggest_action', 'generate_script'
  input_text TEXT NOT NULL,
  output_text TEXT,
  prompt_version TEXT,
  latency_ms INTEGER,
  tokens_used INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error TEXT,
  flagged_incorrect BOOLEAN DEFAULT false,
  flagged_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_chat_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_chat_logs
CREATE POLICY "Users can view their own AI chat logs"
ON public.ai_chat_logs
FOR SELECT
USING (
  user_id = get_user_id(auth.uid())
  OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

CREATE POLICY "Users can insert AI chat logs"
ON public.ai_chat_logs
FOR INSERT
WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can flag their own AI chat logs"
ON public.ai_chat_logs
FOR UPDATE
USING (user_id = get_user_id(auth.uid()));

-- Create index for performance
CREATE INDEX idx_ai_configs_brand ON public.ai_configs(brand_id);
CREATE INDEX idx_ai_prompts_brand_name ON public.ai_prompts(brand_id, name);
CREATE INDEX idx_ai_prompts_active ON public.ai_prompts(brand_id, name, is_active) WHERE is_active = true;
CREATE INDEX idx_ai_feedback_decision ON public.ai_feedback(ai_decision_id);
CREATE INDEX idx_ai_chat_logs_brand ON public.ai_chat_logs(brand_id, created_at DESC);
CREATE INDEX idx_ai_chat_logs_user ON public.ai_chat_logs(user_id, created_at DESC);

-- Function to get or create AI config for a brand
CREATE OR REPLACE FUNCTION public.get_or_create_ai_config(p_brand_id UUID)
RETURNS public.ai_configs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.ai_configs;
BEGIN
  SELECT * INTO v_config FROM public.ai_configs WHERE brand_id = p_brand_id;
  
  IF NOT FOUND THEN
    INSERT INTO public.ai_configs (brand_id)
    VALUES (p_brand_id)
    RETURNING * INTO v_config;
  END IF;
  
  RETURN v_config;
END;
$$;

-- Function to activate a prompt version (deactivates others)
CREATE OR REPLACE FUNCTION public.activate_ai_prompt(p_prompt_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prompt public.ai_prompts;
BEGIN
  SELECT * INTO v_prompt FROM public.ai_prompts WHERE id = p_prompt_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Deactivate all prompts with same brand_id and name
  UPDATE public.ai_prompts
  SET is_active = false
  WHERE brand_id = v_prompt.brand_id AND name = v_prompt.name;
  
  -- Activate the target prompt
  UPDATE public.ai_prompts
  SET is_active = true
  WHERE id = p_prompt_id;
  
  -- Update the ai_configs with new active version
  UPDATE public.ai_configs
  SET active_prompt_version = v_prompt.version, updated_at = now()
  WHERE brand_id = v_prompt.brand_id;
  
  RETURN true;
END;
$$;

-- RPC to get AI metrics overview for admin dashboard
CREATE OR REPLACE FUNCTION public.get_ai_quality_metrics(
  p_brand_id UUID,
  p_from TIMESTAMP WITH TIME ZONE,
  p_to TIMESTAMP WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_total_decisions INTEGER;
  v_overridden_count INTEGER;
  v_feedback_correct INTEGER;
  v_feedback_incorrect INTEGER;
BEGIN
  -- Count total decisions
  SELECT COUNT(*) INTO v_total_decisions
  FROM public.ai_decision_logs
  WHERE brand_id = p_brand_id
    AND created_at BETWEEN p_from AND p_to;

  -- Count overrides
  SELECT COUNT(*) INTO v_overridden_count
  FROM public.ai_decision_logs
  WHERE brand_id = p_brand_id
    AND created_at BETWEEN p_from AND p_to
    AND was_overridden = true;

  -- Count feedback
  SELECT 
    COALESCE(SUM(CASE WHEN label = 'correct' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN label = 'incorrect' THEN 1 ELSE 0 END), 0)
  INTO v_feedback_correct, v_feedback_incorrect
  FROM public.ai_feedback
  WHERE brand_id = p_brand_id
    AND created_at BETWEEN p_from AND p_to;

  v_result := jsonb_build_object(
    'total_decisions', v_total_decisions,
    'override_count', v_overridden_count,
    'override_rate', CASE WHEN v_total_decisions > 0 
      THEN ROUND((v_overridden_count::numeric / v_total_decisions) * 100, 2)
      ELSE 0 END,
    'feedback_correct', v_feedback_correct,
    'feedback_incorrect', v_feedback_incorrect,
    'feedback_accuracy', CASE WHEN (v_feedback_correct + v_feedback_incorrect) > 0
      THEN ROUND((v_feedback_correct::numeric / (v_feedback_correct + v_feedback_incorrect)) * 100, 2)
      ELSE NULL END
  );

  RETURN v_result;
END;
$$;