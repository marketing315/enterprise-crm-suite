-- =========================================================================
-- 1) Sensitive credential columns: revoke column-level SELECT from authenticated.
--    RLS policies stay intact; service_role (edge functions) is unaffected.
-- =========================================================================
revoke select (access_token, app_secret, verify_token, capi_token_key)
  on public.meta_apps from authenticated;

revoke select (token)
  on public.voispeed_configs from authenticated;

revoke select (access_token)
  on public.meta_lead_sources from authenticated;

revoke select (secret)
  on public.outbound_webhooks from authenticated;

revoke select (hmac_secret)
  on public.siem_destinations from authenticated;

revoke select (hmac_secret)
  on public.notification_webhook_destinations from authenticated;

-- =========================================================================
-- 2) incoming_requests: hide raw payload + ip_address from admins (column-level).
--    Edge functions (service_role) still see everything.
-- =========================================================================
revoke select (raw_body, raw_body_text, headers, ip_address)
  on public.incoming_requests from authenticated;

-- =========================================================================
-- 3) contact_tracking: hide client_ip from non-service callers.
-- =========================================================================
revoke select (client_ip)
  on public.contact_tracking from authenticated;

-- =========================================================================
-- 4) user_module_access: fix admin policy to use internal user id.
-- =========================================================================
drop policy if exists "Admins can manage user module access" on public.user_module_access;
create policy "Admins can manage user module access"
  on public.user_module_access
  for all
  to authenticated
  using (user_belongs_to_brand(get_user_id(auth.uid()), brand_id))
  with check (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- =========================================================================
-- 5) appointment_outcomes: remove '00000000-...' bypass branch (no data uses it).
-- =========================================================================
drop policy if exists "appointment_outcomes_select_brand" on public.appointment_outcomes;
create policy "appointment_outcomes_select_brand"
  on public.appointment_outcomes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_outcomes.appointment_id
        and a.brand_id = appointment_outcomes.brand_id
    )
  );

drop policy if exists "appointment_outcomes_insert_brand" on public.appointment_outcomes;
create policy "appointment_outcomes_insert_brand"
  on public.appointment_outcomes
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_outcomes.appointment_id
        and a.brand_id = appointment_outcomes.brand_id
    )
  );

-- =========================================================================
-- 6) action_suggestions: scope user_id IS NULL branch to brand membership.
-- =========================================================================
drop policy if exists "Users see own or global suggestions" on public.action_suggestions;
create policy "Users see own or global suggestions"
  on public.action_suggestions
  for select
  to authenticated
  using (
    user_id = get_user_id(auth.uid())
    or (
      user_id is null
      and user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
    )
    or has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    or has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    or has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori'::app_role)
  );

drop policy if exists "Users can update own suggestions" on public.action_suggestions;
create policy "Users can update own suggestions"
  on public.action_suggestions
  for update
  to authenticated
  using (
    user_id = get_user_id(auth.uid())
    or (
      user_id is null
      and user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
    )
    or has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  );

-- =========================================================================
-- 7) Storage: sale-documents INSERT must enforce ownership folder.
-- =========================================================================
drop policy if exists "Users can upload sale documents" on storage.objects;
create policy "Users can upload sale documents"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'sale-documents'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );