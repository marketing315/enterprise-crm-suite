
-- 1) Revoke SELECT on sensitive columns from authenticated role
REVOKE SELECT (access_token, app_secret, verify_token) ON public.meta_apps FROM authenticated;
REVOKE SELECT (token) ON public.voispeed_configs FROM authenticated;
REVOKE SELECT (hmac_secret) ON public.notification_webhook_destinations FROM authenticated;
REVOKE SELECT (hmac_secret) ON public.siem_destinations FROM authenticated;
REVOKE SELECT (client_ip) ON public.contact_tracking FROM authenticated;
REVOKE SELECT (ip_address, raw_body) ON public.incoming_requests FROM authenticated;

-- 2) Fix privilege escalation on user_module_access: limit write to admin/CEO
DROP POLICY IF EXISTS "Admins can manage user module access" ON public.user_module_access;

CREATE POLICY "Admins can manage user module access"
ON public.user_module_access
FOR ALL
TO authenticated
USING (
  public.has_role_for_brand(public.get_user_id(auth.uid()), brand_id, 'admin'::public.app_role)
  OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::public.app_role)
)
WITH CHECK (
  public.has_role_for_brand(public.get_user_id(auth.uid()), brand_id, 'admin'::public.app_role)
  OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::public.app_role)
);

-- 3) appointment_outcomes: add explicit brand membership check
DROP POLICY IF EXISTS "appointment_outcomes_select_brand" ON public.appointment_outcomes;
CREATE POLICY "appointment_outcomes_select_brand"
ON public.appointment_outcomes
FOR SELECT
TO authenticated
USING (
  public.user_belongs_to_brand(public.get_user_id(auth.uid()), brand_id)
  AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_outcomes.appointment_id
      AND a.brand_id = appointment_outcomes.brand_id
  )
);

DROP POLICY IF EXISTS "appointment_outcomes_insert_brand" ON public.appointment_outcomes;
CREATE POLICY "appointment_outcomes_insert_brand"
ON public.appointment_outcomes
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_belongs_to_brand(public.get_user_id(auth.uid()), brand_id)
  AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_outcomes.appointment_id
      AND a.brand_id = appointment_outcomes.brand_id
  )
);

-- 4) Force security_invoker on v_sales_orders_taxable
ALTER VIEW public.v_sales_orders_taxable SET (security_invoker = true);
