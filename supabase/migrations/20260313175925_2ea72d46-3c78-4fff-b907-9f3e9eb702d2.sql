
-- =============================================
-- SPRINT 1: Security RLS Fix Migration
-- =============================================

-- BATCH 1: Fix auth.uid() → get_user_id(auth.uid()) on 7 tables

-- ai_call_action_decisions
DROP POLICY IF EXISTS "Users can insert decisions for their brands" ON public.ai_call_action_decisions;
DROP POLICY IF EXISTS "Users can view decisions for their brands" ON public.ai_call_action_decisions;
CREATE POLICY "Users can insert decisions for their brands" ON public.ai_call_action_decisions FOR INSERT WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));
CREATE POLICY "Users can view decisions for their brands" ON public.ai_call_action_decisions FOR SELECT USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- ai_call_action_executions
DROP POLICY IF EXISTS "Users can insert executions for their brands" ON public.ai_call_action_executions;
DROP POLICY IF EXISTS "Users can update executions for their brands" ON public.ai_call_action_executions;
DROP POLICY IF EXISTS "Users can view executions for their brands" ON public.ai_call_action_executions;
CREATE POLICY "Users can insert executions for their brands" ON public.ai_call_action_executions FOR INSERT WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));
CREATE POLICY "Users can update executions for their brands" ON public.ai_call_action_executions FOR UPDATE USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));
CREATE POLICY "Users can view executions for their brands" ON public.ai_call_action_executions FOR SELECT USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- ai_call_action_proposals
DROP POLICY IF EXISTS "Users can insert proposals for their brands" ON public.ai_call_action_proposals;
DROP POLICY IF EXISTS "Users can update proposals for their brands" ON public.ai_call_action_proposals;
DROP POLICY IF EXISTS "Users can view proposals for their brands" ON public.ai_call_action_proposals;
CREATE POLICY "Users can insert proposals for their brands" ON public.ai_call_action_proposals FOR INSERT WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));
CREATE POLICY "Users can update proposals for their brands" ON public.ai_call_action_proposals FOR UPDATE USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));
CREATE POLICY "Users can view proposals for their brands" ON public.ai_call_action_proposals FOR SELECT USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- incident_drills
DROP POLICY IF EXISTS "Admins can manage drills" ON public.incident_drills;
DROP POLICY IF EXISTS "Users can view drills for their brand" ON public.incident_drills;
CREATE POLICY "Admins can manage drills" ON public.incident_drills FOR ALL TO authenticated USING (has_role(get_user_id(auth.uid()), 'admin'::app_role)) WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));
CREATE POLICY "Users can view drills for their brand" ON public.incident_drills FOR SELECT TO authenticated USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- security_findings
DROP POLICY IF EXISTS "Admins can manage findings" ON public.security_findings;
DROP POLICY IF EXISTS "Users can view findings for their brand" ON public.security_findings;
CREATE POLICY "Admins can manage findings" ON public.security_findings FOR ALL TO authenticated USING (has_role(get_user_id(auth.uid()), 'admin'::app_role)) WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));
CREATE POLICY "Users can view findings for their brand" ON public.security_findings FOR SELECT TO authenticated USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- security_reviews
DROP POLICY IF EXISTS "Admins can manage security reviews" ON public.security_reviews;
DROP POLICY IF EXISTS "Users can view security reviews for their brand" ON public.security_reviews;
CREATE POLICY "Admins can manage security reviews" ON public.security_reviews FOR ALL TO authenticated USING (has_role(get_user_id(auth.uid()), 'admin'::app_role)) WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));
CREATE POLICY "Users can view security reviews for their brand" ON public.security_reviews FOR SELECT TO authenticated USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- webhook_inbound_events
DROP POLICY IF EXISTS "Users can view inbound events for their brands" ON public.webhook_inbound_events;
CREATE POLICY "Users can view inbound events for their brands" ON public.webhook_inbound_events FOR SELECT USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- BATCH 2: Fix cross-brand leakage on feature_flags and pipeline_stages

-- feature_flags: restrict SELECT to brand members
DROP POLICY IF EXISTS "Authenticated users can read feature flags" ON public.feature_flags;
CREATE POLICY "Users can read feature flags for their brands" ON public.feature_flags FOR SELECT USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- pipeline_stages: restrict SELECT to brand members
DROP POLICY IF EXISTS "Authenticated users can view pipeline stages" ON public.pipeline_stages;
CREATE POLICY "Users can view pipeline stages for their brands" ON public.pipeline_stages FOR SELECT USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- BATCH 3: Protect sensitive credentials in meta_lead_sources
-- Restrict SELECT to admin/ceo only (tokens, secrets visible)
DROP POLICY IF EXISTS "Users can view meta lead sources in their brands" ON public.meta_lead_sources;
CREATE POLICY "Admins and CEOs can view meta lead sources" ON public.meta_lead_sources FOR SELECT USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role) 
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);
