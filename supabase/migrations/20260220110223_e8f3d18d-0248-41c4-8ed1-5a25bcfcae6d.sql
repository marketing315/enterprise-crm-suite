-- Drop obsolete brand-scoped RLS policies on pipeline_stages (stages are now global)
DROP POLICY IF EXISTS "Admins can manage stages" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Users can view stages in their brands" ON public.pipeline_stages;