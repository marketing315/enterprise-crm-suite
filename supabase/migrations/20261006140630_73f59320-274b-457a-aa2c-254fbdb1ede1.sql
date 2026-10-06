CREATE TABLE public.meta_form_email_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_app_id uuid NOT NULL REFERENCES public.meta_apps(id) ON DELETE CASCADE,
  form_id text NOT NULL,
  form_name text,
  recipient_email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meta_app_id, form_id, recipient_email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_form_email_recipients TO authenticated;
GRANT ALL ON public.meta_form_email_recipients TO service_role;
ALTER TABLE public.meta_form_email_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY mfer_select ON public.meta_form_email_recipients FOR SELECT TO authenticated USING (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)));
CREATE POLICY mfer_insert ON public.meta_form_email_recipients FOR INSERT TO authenticated WITH CHECK (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)));
CREATE POLICY mfer_update ON public.meta_form_email_recipients FOR UPDATE TO authenticated USING (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id))) WITH CHECK (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)));
CREATE POLICY mfer_delete ON public.meta_form_email_recipients FOR DELETE TO authenticated USING (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)));
CREATE OR REPLACE FUNCTION public.mfer_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); NEW.recipient_email = lower(trim(NEW.recipient_email)); RETURN NEW; END $$;
CREATE TRIGGER mfer_touch BEFORE INSERT OR UPDATE ON public.meta_form_email_recipients FOR EACH ROW EXECUTE FUNCTION public.mfer_touch();