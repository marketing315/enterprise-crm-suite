-- =============================================
-- VOIspeed v4 Integration Schema
-- =============================================

-- 1. Add voispeed_ext to users table (internal extension number)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS voispeed_ext TEXT;

-- 2. Create VOIspeed configuration table per brand
CREATE TABLE public.voispeed_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL, -- SERI endpoint URL
  token TEXT NOT NULL, -- Integration module token (encrypted at rest)
  domain TEXT, -- Optional: VOIspeed domain/license
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id),
  CONSTRAINT voispeed_configs_brand_unique UNIQUE(brand_id)
);

-- 3. Add provider fields to call_logs for VOIspeed tracking
ALTER TABLE public.call_logs
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'tel',
ADD COLUMN IF NOT EXISTS provider_call_id TEXT, -- usercallid from VOIspeed
ADD COLUMN IF NOT EXISTS provider_ext_id TEXT, -- extid we send/receive
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- 4. Create index for fast lookup by provider_call_id
CREATE INDEX IF NOT EXISTS idx_call_logs_provider_call_id 
ON public.call_logs(provider_call_id) 
WHERE provider_call_id IS NOT NULL;

-- 5. Create index for fast lookup by provider_ext_id
CREATE INDEX IF NOT EXISTS idx_call_logs_provider_ext_id 
ON public.call_logs(provider_ext_id) 
WHERE provider_ext_id IS NOT NULL;

-- 6. Enable RLS on voispeed_configs
ALTER TABLE public.voispeed_configs ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies: Only admins can manage VOIspeed configs
CREATE POLICY "Admins can view voispeed configs"
ON public.voispeed_configs
FOR SELECT
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

CREATE POLICY "Admins can insert voispeed configs"
ON public.voispeed_configs
FOR INSERT
WITH CHECK (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

CREATE POLICY "Admins can update voispeed configs"
ON public.voispeed_configs
FOR UPDATE
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

CREATE POLICY "Admins can delete voispeed configs"
ON public.voispeed_configs
FOR DELETE
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- 8. Trigger to update updated_at
CREATE TRIGGER update_voispeed_configs_updated_at
BEFORE UPDATE ON public.voispeed_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Create incoming_calls table for screen-pop notifications
CREATE TABLE public.incoming_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id), -- The user receiving the call (by ext)
  contact_id UUID REFERENCES public.contacts(id),
  deal_id UUID REFERENCES public.deals(id),
  call_log_id UUID REFERENCES public.call_logs(id),
  phone_number TEXT NOT NULL,
  voispeed_ext TEXT, -- The extension receiving the call
  provider_call_id TEXT, -- usercallid
  status TEXT NOT NULL DEFAULT 'ringing', -- ringing, answered, dismissed, missed
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMP WITH TIME ZONE
);

-- 10. Enable RLS on incoming_calls
ALTER TABLE public.incoming_calls ENABLE ROW LEVEL SECURITY;

-- 11. RLS: Users can see their own incoming calls
CREATE POLICY "Users can view their incoming calls"
ON public.incoming_calls
FOR SELECT
USING (
  user_id = get_user_id(auth.uid())
  OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
);

CREATE POLICY "Users can update their incoming calls"
ON public.incoming_calls
FOR UPDATE
USING (user_id = get_user_id(auth.uid()));

-- 12. Enable realtime for incoming_calls (screen-pop)
ALTER PUBLICATION supabase_realtime ADD TABLE public.incoming_calls;

-- 13. Index for cleanup and queries
CREATE INDEX idx_incoming_calls_user_status 
ON public.incoming_calls(user_id, status) 
WHERE status = 'ringing';

CREATE INDEX idx_incoming_calls_created_at 
ON public.incoming_calls(created_at);