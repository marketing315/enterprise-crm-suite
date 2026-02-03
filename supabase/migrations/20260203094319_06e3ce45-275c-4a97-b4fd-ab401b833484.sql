-- Create admin_todos table for CEO/Admin task management
CREATE TABLE public.admin_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_todos ENABLE ROW LEVEL SECURITY;

-- Only Admin/CEO can manage todos
CREATE POLICY "Admins and CEOs can manage todos"
ON public.admin_todos FOR ALL
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') 
  OR has_role(get_user_id(auth.uid()), 'ceo')
)
WITH CHECK (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') 
  OR has_role(get_user_id(auth.uid()), 'ceo')
);

-- Add updated_at trigger
CREATE TRIGGER update_admin_todos_updated_at
BEFORE UPDATE ON public.admin_todos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default OAuth reminder
INSERT INTO public.admin_todos (brand_id, created_by, title, display_order)
SELECT 
  b.id,
  (SELECT id FROM users LIMIT 1),
  'Configurare OAuth: richiedere Client ID/Secret per Google Ads e Meta Ads',
  0
FROM brands b
WHERE b.is_system = false
LIMIT 1;