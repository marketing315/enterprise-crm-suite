-- Audit retention & archiving infrastructure

-- 1) Per-brand retention configuration
CREATE TABLE IF NOT EXISTS public.audit_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  retention_months integer NOT NULL DEFAULT 24 CHECK (retention_months >= 1 AND retention_months <= 120),
  archive_enabled boolean NOT NULL DEFAULT true,
  last_purge_at timestamptz,
  last_archived_count integer DEFAULT 0,
  last_purged_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id)
);

ALTER TABLE public.audit_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit admins can view retention policies"
ON public.audit_retention_policies FOR SELECT
TO authenticated
USING (public.is_audit_admin(auth.uid()));

CREATE POLICY "audit admins can manage retention policies"
ON public.audit_retention_policies FOR ALL
TO authenticated
USING (public.is_audit_admin(auth.uid()))
WITH CHECK (public.is_audit_admin(auth.uid()));

CREATE TRIGGER trg_audit_retention_policies_updated_at
BEFORE UPDATE ON public.audit_retention_policies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Archive table (cold storage) - same shape as audit_events plus archive metadata
CREATE TABLE IF NOT EXISTS public.audit_events_archive (
  id uuid PRIMARY KEY,
  brand_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_user_id uuid,
  actor_type text NOT NULL,
  actor_display_name text,
  source text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  changed_fields text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_archive_brand_occurred
  ON public.audit_events_archive (brand_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_archive_entity
  ON public.audit_events_archive (entity_type, entity_id);

ALTER TABLE public.audit_events_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit admins can view archive"
ON public.audit_events_archive FOR SELECT
TO authenticated
USING (public.is_audit_admin(auth.uid()));

-- 3) RPC for manual / cron-driven retention enforcement
CREATE OR REPLACE FUNCTION public.run_audit_retention(
  p_brand_id uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy record;
  v_cutoff timestamptz;
  v_archived integer;
  v_purged integer;
  v_results jsonb := '[]'::jsonb;
  v_brand_result jsonb;
BEGIN
  -- Only audit admins can invoke manually; cron uses service role bypass
  IF auth.uid() IS NOT NULL AND NOT public.is_audit_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access denied: requires audit admin role';
  END IF;

  FOR v_policy IN
    SELECT * FROM public.audit_retention_policies
    WHERE (p_brand_id IS NULL OR brand_id = p_brand_id)
  LOOP
    v_cutoff := now() - (v_policy.retention_months || ' months')::interval;
    v_archived := 0;
    v_purged := 0;

    IF v_policy.archive_enabled AND NOT p_dry_run THEN
      WITH moved AS (
        INSERT INTO public.audit_events_archive (
          id, brand_id, entity_type, entity_id, action, actor_user_id,
          actor_type, actor_display_name, source, old_value, new_value,
          changed_fields, metadata, correlation_id, occurred_at, created_at
        )
        SELECT id, brand_id, entity_type, entity_id, action, actor_user_id,
               actor_type, actor_display_name, source, old_value, new_value,
               changed_fields, metadata, correlation_id, occurred_at, created_at
        FROM public.audit_events
        WHERE brand_id = v_policy.brand_id
          AND occurred_at < v_cutoff
        ON CONFLICT (id) DO NOTHING
        RETURNING 1
      )
      SELECT count(*) INTO v_archived FROM moved;
    ELSIF v_policy.archive_enabled AND p_dry_run THEN
      SELECT count(*) INTO v_archived
      FROM public.audit_events
      WHERE brand_id = v_policy.brand_id AND occurred_at < v_cutoff;
    END IF;

    IF NOT p_dry_run THEN
      WITH deleted AS (
        DELETE FROM public.audit_events
        WHERE brand_id = v_policy.brand_id
          AND occurred_at < v_cutoff
        RETURNING 1
      )
      SELECT count(*) INTO v_purged FROM deleted;

      UPDATE public.audit_retention_policies
      SET last_purge_at = now(),
          last_archived_count = v_archived,
          last_purged_count = v_purged
      WHERE id = v_policy.id;
    ELSE
      SELECT count(*) INTO v_purged
      FROM public.audit_events
      WHERE brand_id = v_policy.brand_id AND occurred_at < v_cutoff;
    END IF;

    v_brand_result := jsonb_build_object(
      'brand_id', v_policy.brand_id,
      'retention_months', v_policy.retention_months,
      'cutoff', v_cutoff,
      'archive_enabled', v_policy.archive_enabled,
      'archived', v_archived,
      'purged', v_purged,
      'dry_run', p_dry_run
    );
    v_results := v_results || v_brand_result;
  END LOOP;

  RETURN jsonb_build_object('executed_at', now(), 'results', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.run_audit_retention(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_audit_retention(uuid, boolean) TO authenticated;

-- 4) RPC to upsert / delete a brand's retention policy from the UI
CREATE OR REPLACE FUNCTION public.upsert_audit_retention_policy(
  p_brand_id uuid,
  p_retention_months integer,
  p_archive_enabled boolean
)
RETURNS public.audit_retention_policies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.audit_retention_policies;
BEGIN
  IF NOT public.is_audit_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  INSERT INTO public.audit_retention_policies (brand_id, retention_months, archive_enabled)
  VALUES (p_brand_id, p_retention_months, p_archive_enabled)
  ON CONFLICT (brand_id) DO UPDATE
    SET retention_months = EXCLUDED.retention_months,
        archive_enabled = EXCLUDED.archive_enabled,
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_audit_retention_policy(uuid, integer, boolean) TO authenticated;
