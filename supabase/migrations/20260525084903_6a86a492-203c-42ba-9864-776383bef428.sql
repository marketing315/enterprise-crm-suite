-- =====================================================
-- F5.7 — DPIA / Data Retention
-- =====================================================

-- 1) Per-brand retention config
CREATE TABLE IF NOT EXISTS public.brand_data_retention_config (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  call_audio_retention_days int,        -- NULL = no limit; anonymizes recording_url
  call_transcript_retention_days int,   -- NULL = no limit; deletes call_transcripts rows
  alert_events_retention_days int DEFAULT 180,
  sheets_export_logs_retention_days int DEFAULT 30,
  dpia_acknowledged_at timestamptz,
  dpia_acknowledged_by uuid,
  dpia_version text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_audio_days_pos CHECK (call_audio_retention_days IS NULL OR call_audio_retention_days > 0),
  CONSTRAINT chk_transcript_days_pos CHECK (call_transcript_retention_days IS NULL OR call_transcript_retention_days > 0),
  CONSTRAINT chk_alert_days_pos CHECK (alert_events_retention_days IS NULL OR alert_events_retention_days > 0),
  CONSTRAINT chk_sheets_days_pos CHECK (sheets_export_logs_retention_days IS NULL OR sheets_export_logs_retention_days > 0)
);

ALTER TABLE public.brand_data_retention_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retention_config_select"
  ON public.brand_data_retention_config FOR SELECT TO authenticated
  USING (
    public.has_role(public.get_user_id(auth.uid()), 'admin')
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo')
    OR public.has_role(public.get_user_id(auth.uid()), 'amministrazione')
  );

CREATE POLICY "retention_config_modify"
  ON public.brand_data_retention_config FOR ALL TO authenticated
  USING (
    public.has_role(public.get_user_id(auth.uid()), 'admin')
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo')
  )
  WITH CHECK (
    public.has_role(public.get_user_id(auth.uid()), 'admin')
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo')
  );

CREATE TRIGGER trg_brand_retention_config_updated_at
  BEFORE UPDATE ON public.brand_data_retention_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Append-only run log (retention 90 days)
-- retention: 90 giorni
CREATE TABLE IF NOT EXISTS public.data_retention_runs (
  id bigserial PRIMARY KEY,
  brand_id uuid,
  dry_run boolean NOT NULL,
  triggered_by uuid,
  triggered_via text NOT NULL DEFAULT 'manual', -- 'manual' | 'cron'
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_affected int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_retention_runs_created_at
  ON public.data_retention_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_retention_runs_brand
  ON public.data_retention_runs(brand_id, created_at DESC);

ALTER TABLE public.data_retention_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retention_runs_select"
  ON public.data_retention_runs FOR SELECT TO authenticated
  USING (
    public.has_role(public.get_user_id(auth.uid()), 'admin')
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo')
    OR public.has_role(public.get_user_id(auth.uid()), 'amministrazione')
  );

-- 3) Upsert RPC
CREATE OR REPLACE FUNCTION public.upsert_brand_retention_config(
  p_brand_id uuid,
  p_call_audio_retention_days int,
  p_call_transcript_retention_days int,
  p_alert_events_retention_days int,
  p_sheets_export_logs_retention_days int,
  p_dpia_acknowledge boolean DEFAULT false,
  p_dpia_version text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS public.brand_data_retention_config
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public.get_user_id(auth.uid());
  v_row public.brand_data_retention_config;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'ceo')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.brand_data_retention_config AS c (
    brand_id, call_audio_retention_days, call_transcript_retention_days,
    alert_events_retention_days, sheets_export_logs_retention_days,
    dpia_acknowledged_at, dpia_acknowledged_by, dpia_version, notes
  ) VALUES (
    p_brand_id, p_call_audio_retention_days, p_call_transcript_retention_days,
    COALESCE(p_alert_events_retention_days, 180),
    COALESCE(p_sheets_export_logs_retention_days, 30),
    CASE WHEN p_dpia_acknowledge THEN now() ELSE NULL END,
    CASE WHEN p_dpia_acknowledge THEN v_uid ELSE NULL END,
    p_dpia_version, p_notes
  )
  ON CONFLICT (brand_id) DO UPDATE SET
    call_audio_retention_days = EXCLUDED.call_audio_retention_days,
    call_transcript_retention_days = EXCLUDED.call_transcript_retention_days,
    alert_events_retention_days = EXCLUDED.alert_events_retention_days,
    sheets_export_logs_retention_days = EXCLUDED.sheets_export_logs_retention_days,
    dpia_acknowledged_at = CASE WHEN p_dpia_acknowledge THEN now() ELSE c.dpia_acknowledged_at END,
    dpia_acknowledged_by = CASE WHEN p_dpia_acknowledge THEN v_uid ELSE c.dpia_acknowledged_by END,
    dpia_version = COALESCE(EXCLUDED.dpia_version, c.dpia_version),
    notes = COALESCE(EXCLUDED.notes, c.notes),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_brand_retention_config(uuid,int,int,int,int,boolean,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_brand_retention_config(uuid,int,int,int,int,boolean,text,text) TO authenticated;

-- 4) Cleanup RPC
CREATE OR REPLACE FUNCTION public.run_data_retention_cleanup(
  p_brand_id uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT true,
  p_triggered_via text DEFAULT 'manual'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public.get_user_id(auth.uid());
  v_cfg record;
  v_results jsonb := '[]'::jsonb;
  v_brand_result jsonb;
  v_audio_count int;
  v_transcript_count int;
  v_alert_count int;
  v_sheets_count int;
  v_total int := 0;
  v_cutoff timestamptz;
BEGIN
  -- Auth: cron uses SECURITY DEFINER without user; manual requires admin/ceo
  IF p_triggered_via = 'manual' THEN
    IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'ceo')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR v_cfg IN
    SELECT * FROM public.brand_data_retention_config
    WHERE (p_brand_id IS NULL OR brand_id = p_brand_id)
  LOOP
    v_audio_count := 0; v_transcript_count := 0; v_alert_count := 0; v_sheets_count := 0;

    -- Audio (anonymize recording_url on call_logs + call_transcripts)
    IF v_cfg.call_audio_retention_days IS NOT NULL THEN
      v_cutoff := now() - make_interval(days => v_cfg.call_audio_retention_days);
      IF p_dry_run THEN
        SELECT count(*) INTO v_audio_count FROM public.call_logs
          WHERE brand_id = v_cfg.brand_id AND recording_url IS NOT NULL AND started_at < v_cutoff;
      ELSE
        WITH upd AS (
          UPDATE public.call_logs SET recording_url = NULL
          WHERE brand_id = v_cfg.brand_id AND recording_url IS NOT NULL AND started_at < v_cutoff
          RETURNING 1
        ) SELECT count(*) INTO v_audio_count FROM upd;
        UPDATE public.call_transcripts SET recording_url = NULL
          WHERE brand_id = v_cfg.brand_id AND recording_url IS NOT NULL AND created_at < v_cutoff;
      END IF;
    END IF;

    -- Transcripts (delete rows)
    IF v_cfg.call_transcript_retention_days IS NOT NULL THEN
      v_cutoff := now() - make_interval(days => v_cfg.call_transcript_retention_days);
      IF p_dry_run THEN
        SELECT count(*) INTO v_transcript_count FROM public.call_transcripts
          WHERE brand_id = v_cfg.brand_id AND created_at < v_cutoff;
      ELSE
        WITH del AS (
          DELETE FROM public.call_transcripts
          WHERE brand_id = v_cfg.brand_id AND created_at < v_cutoff
          RETURNING 1
        ) SELECT count(*) INTO v_transcript_count FROM del;
      END IF;
    END IF;

    -- Alert events (only acknowledged ones older than cutoff)
    IF v_cfg.alert_events_retention_days IS NOT NULL THEN
      v_cutoff := now() - make_interval(days => v_cfg.alert_events_retention_days);
      IF p_dry_run THEN
        SELECT count(*) INTO v_alert_count FROM public.performance_alert_events
          WHERE brand_id = v_cfg.brand_id AND fired_at < v_cutoff;
      ELSE
        WITH del AS (
          DELETE FROM public.performance_alert_events
          WHERE brand_id = v_cfg.brand_id AND fired_at < v_cutoff
          RETURNING 1
        ) SELECT count(*) INTO v_alert_count FROM del;
      END IF;
    END IF;

    -- Sheets export logs (only completed/dead-letter)
    IF v_cfg.sheets_export_logs_retention_days IS NOT NULL THEN
      v_cutoff := now() - make_interval(days => v_cfg.sheets_export_logs_retention_days);
      IF p_dry_run THEN
        SELECT count(*) INTO v_sheets_count FROM public.sheets_export_logs
          WHERE brand_id = v_cfg.brand_id AND created_at < v_cutoff
            AND (status IN ('success','sent','completed') OR dead_letter = true);
      ELSE
        WITH del AS (
          DELETE FROM public.sheets_export_logs
          WHERE brand_id = v_cfg.brand_id AND created_at < v_cutoff
            AND (status IN ('success','sent','completed') OR dead_letter = true)
          RETURNING 1
        ) SELECT count(*) INTO v_sheets_count FROM del;
      END IF;
    END IF;

    v_brand_result := jsonb_build_object(
      'brand_id', v_cfg.brand_id,
      'audio_anonymized', v_audio_count,
      'transcripts_deleted', v_transcript_count,
      'alert_events_deleted', v_alert_count,
      'sheets_logs_deleted', v_sheets_count
    );
    v_results := v_results || v_brand_result;
    v_total := v_total + v_audio_count + v_transcript_count + v_alert_count + v_sheets_count;
  END LOOP;

  -- Log run
  INSERT INTO public.data_retention_runs(brand_id, dry_run, triggered_by, triggered_via, results, total_affected)
  VALUES (p_brand_id, p_dry_run, v_uid, p_triggered_via, v_results, v_total);

  -- Cleanup own log: retention 90d (idempotent)
  DELETE FROM public.data_retention_runs WHERE created_at < now() - interval '90 days';

  RETURN jsonb_build_object('dry_run', p_dry_run, 'total_affected', v_total, 'results', v_results);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_data_retention_cleanup(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_data_retention_cleanup(uuid,boolean,text) TO authenticated;