
-- Tabella per token OAuth (Google Ads, Meta Ads, etc.)
CREATE TABLE public.oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id, provider, account_id)
);

ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view OAuth tokens"
ON public.oauth_tokens FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = auth.uid()
      AND ur.brand_id = oauth_tokens.brand_id
      AND ur.role IN ('admin', 'ceo')
      AND ur.is_active = true
  )
);

CREATE POLICY "Admins can insert OAuth tokens"
ON public.oauth_tokens FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = auth.uid()
      AND ur.brand_id = oauth_tokens.brand_id
      AND ur.role IN ('admin', 'ceo')
      AND ur.is_active = true
  )
);

CREATE POLICY "Admins can update OAuth tokens"
ON public.oauth_tokens FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = auth.uid()
      AND ur.brand_id = oauth_tokens.brand_id
      AND ur.role IN ('admin', 'ceo')
      AND ur.is_active = true
  )
);

CREATE POLICY "Admins can delete OAuth tokens"
ON public.oauth_tokens FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = auth.uid()
      AND ur.brand_id = oauth_tokens.brand_id
      AND ur.role IN ('admin', 'ceo')
      AND ur.is_active = true
  )
);

CREATE POLICY "Service role full access on oauth_tokens"
ON public.oauth_tokens FOR ALL
USING (auth.role() = 'service_role');

CREATE TRIGGER update_oauth_tokens_updated_at
BEFORE UPDATE ON public.oauth_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
