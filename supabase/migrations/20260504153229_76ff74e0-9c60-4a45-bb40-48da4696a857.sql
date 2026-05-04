ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_name        text,
  ADD COLUMN IF NOT EXISTS primary_role_hint     text,
  ADD COLUMN IF NOT EXISTS preferred_brand_id    uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS welcome_completed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS tour_completed_at     timestamptz;

CREATE OR REPLACE FUNCTION public.complete_welcome(
  p_preferred_name text,
  p_primary_role_hint text,
  p_preferred_brand_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := public.get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_primary_role_hint IS NOT NULL
     AND p_primary_role_hint NOT IN ('sales','callcenter','admin','marketing','ceo','other') THEN
    RAISE EXCEPTION 'invalid_primary_role_hint';
  END IF;

  UPDATE public.users
     SET preferred_name       = NULLIF(trim(p_preferred_name), ''),
         primary_role_hint    = p_primary_role_hint,
         preferred_brand_id   = p_preferred_brand_id,
         welcome_completed_at = COALESCE(welcome_completed_at, now()),
         updated_at           = now()
   WHERE id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_tour()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := public.get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.users
     SET tour_completed_at = COALESCE(tour_completed_at, now()),
         updated_at        = now()
   WHERE id = v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_welcome(text, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.complete_tour() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.complete_welcome(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_tour() TO authenticated;