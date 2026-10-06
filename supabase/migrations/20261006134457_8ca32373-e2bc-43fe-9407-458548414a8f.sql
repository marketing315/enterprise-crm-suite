CREATE TABLE public.meta_form_brand_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_app_id uuid NOT NULL REFERENCES public.meta_apps(id) ON DELETE CASCADE,
  form_id text NOT NULL,
  form_name text,
  target_brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meta_app_id, form_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_form_brand_routes TO authenticated;
GRANT ALL ON public.meta_form_brand_routes TO service_role;
ALTER TABLE public.meta_form_brand_routes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_brand_admin_or_ceo(_brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_for_brand(public.get_user_id(auth.uid()), _brand_id, 'admin')
      OR public.has_role_for_brand(public.get_user_id(auth.uid()), _brand_id, 'ceo')
$$;
REVOKE EXECUTE ON FUNCTION public.is_brand_admin_or_ceo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_brand_admin_or_ceo(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.meta_app_brand(_meta_app_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT brand_id FROM public.meta_apps WHERE id = _meta_app_id
$$;
REVOKE EXECUTE ON FUNCTION public.meta_app_brand(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meta_app_brand(uuid) TO authenticated;

CREATE POLICY mfbr_select ON public.meta_form_brand_routes FOR SELECT TO authenticated
  USING (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)));
CREATE POLICY mfbr_insert ON public.meta_form_brand_routes FOR INSERT TO authenticated
  WITH CHECK (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)) AND public.is_brand_admin_or_ceo(target_brand_id));
CREATE POLICY mfbr_update ON public.meta_form_brand_routes FOR UPDATE TO authenticated
  USING (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)))
  WITH CHECK (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)) AND public.is_brand_admin_or_ceo(target_brand_id));
CREATE POLICY mfbr_delete ON public.meta_form_brand_routes FOR DELETE TO authenticated
  USING (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)));

CREATE TRIGGER trg_mfbr_updated_at BEFORE UPDATE ON public.meta_form_brand_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();