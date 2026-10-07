CREATE TABLE public.meta_form_sheet_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_app_id uuid NOT NULL REFERENCES public.meta_apps(id) ON DELETE CASCADE,
  form_id text NOT NULL,
  form_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meta_app_id, form_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_form_sheet_exclusions TO authenticated;
GRANT ALL ON public.meta_form_sheet_exclusions TO service_role;
ALTER TABLE public.meta_form_sheet_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY mfse_select ON public.meta_form_sheet_exclusions FOR SELECT TO authenticated USING (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)));
CREATE POLICY mfse_insert ON public.meta_form_sheet_exclusions FOR INSERT TO authenticated WITH CHECK (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)));
CREATE POLICY mfse_update ON public.meta_form_sheet_exclusions FOR UPDATE TO authenticated USING (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id))) WITH CHECK (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)));
CREATE POLICY mfse_delete ON public.meta_form_sheet_exclusions FOR DELETE TO authenticated USING (public.is_brand_admin_or_ceo(public.meta_app_brand(meta_app_id)));
CREATE INDEX idx_mfse_form ON public.meta_form_sheet_exclusions(form_id) WHERE is_active;
CREATE OR REPLACE FUNCTION public.mfse_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER mfse_touch BEFORE UPDATE ON public.meta_form_sheet_exclusions FOR EACH ROW EXECUTE FUNCTION public.mfse_touch();

-- Excluded Meta forms get a 'skipped' log row (never exported, never re-enqueued by backfill). Fail-open: on any error, enqueue normally.
CREATE OR REPLACE FUNCTION public.enqueue_sheets_export_for_lead()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_status text := 'pending';
  v_form text;
BEGIN
  IF COALESCE(NEW.archived, false) THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_form := NEW.raw_payload->>'meta_form_id';
    IF v_form IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.meta_form_sheet_exclusions x
      WHERE x.form_id = v_form AND x.is_active
    ) THEN
      v_status := 'skipped';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'pending';
  END;

  INSERT INTO public.sheets_export_logs (lead_event_id, brand_id, status, next_attempt_at, attempts)
  VALUES (NEW.id, NEW.brand_id, v_status, now(), 0)
  ON CONFLICT (lead_event_id) DO NOTHING;
  RETURN NEW;
END;
$function$;