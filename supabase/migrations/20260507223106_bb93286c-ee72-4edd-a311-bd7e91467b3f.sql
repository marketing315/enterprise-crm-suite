-- Step C+B: Riduzione I/O senza impatto funzionale
-- 1) has_role: PARALLEL SAFE per consentire memoization del planner
ALTER FUNCTION public.has_role(uuid, app_role) PARALLEL SAFE;

-- 2) Indice mirato user_roles (user_id, role) per ottimizzare has_role()
-- (l'unique esistente è su (user_id, brand_id, role): non ottimale per has_role che filtra solo user_id+role)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role
  ON public.user_roles (user_id, role)
  WHERE is_active = true;

-- Nota: meta_capi_event_queue ha già idx_capi_queue_status_created (status, created_at) — nessuna azione.
-- Nota: email_send_state è una tabella singleton — indice non aiuta.