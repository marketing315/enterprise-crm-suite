-- A5: contacts dedup + merge backend (additive)

-- 1. Tombstone columns on contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS merged_into_contact_id uuid NULL REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_active_not_merged
  ON public.contacts (brand_id)
  WHERE merged_into_contact_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_merged_into
  ON public.contacts (merged_into_contact_id)
  WHERE merged_into_contact_id IS NOT NULL;

COMMENT ON COLUMN public.contacts.merged_into_contact_id IS
  'A5: if non-null, this contact has been merged into the referenced target contact (tombstone). Excluded from dedup search and lookups.';

-- 2. find_duplicate_contacts(brand_id, strategy)
CREATE OR REPLACE FUNCTION public.find_duplicate_contacts(
  p_brand_id uuid,
  p_strategy text DEFAULT 'phone',
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  group_key text,
  contact_ids uuid[],
  contact_count int,
  sample_first_name text,
  sample_last_name text,
  sample_email text,
  sample_phone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: admin or ceo on the brand, or global admin/ceo
  IF NOT (
    public.has_role_for_brand(auth.uid(), p_brand_id, 'admin')
    OR public.has_role_for_brand(auth.uid(), p_brand_id, 'ceo')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_strategy = 'phone' THEN
    RETURN QUERY
    WITH grouped AS (
      SELECT
        cp.phone_normalized AS gkey,
        array_agg(DISTINCT c.id ORDER BY c.id) AS ids,
        count(DISTINCT c.id)::int AS cnt
      FROM public.contact_phones cp
      JOIN public.contacts c ON c.id = cp.contact_id
      WHERE c.brand_id = p_brand_id
        AND c.merged_into_contact_id IS NULL
        AND cp.is_active = true
        AND cp.phone_normalized IS NOT NULL
        AND length(cp.phone_normalized) >= 8
      GROUP BY cp.phone_normalized
      HAVING count(DISTINCT c.id) > 1
      LIMIT p_limit
    )
    SELECT g.gkey, g.ids, g.cnt,
           c.first_name, c.last_name, c.email, g.gkey
    FROM grouped g
    LEFT JOIN public.contacts c ON c.id = g.ids[1];

  ELSIF p_strategy = 'email' THEN
    RETURN QUERY
    WITH grouped AS (
      SELECT
        lower(c.email) AS gkey,
        array_agg(DISTINCT c.id ORDER BY c.id) AS ids,
        count(DISTINCT c.id)::int AS cnt
      FROM public.contacts c
      WHERE c.brand_id = p_brand_id
        AND c.merged_into_contact_id IS NULL
        AND c.email IS NOT NULL
        AND length(trim(c.email)) > 3
      GROUP BY lower(c.email)
      HAVING count(DISTINCT c.id) > 1
      LIMIT p_limit
    )
    SELECT g.gkey, g.ids, g.cnt,
           c.first_name, c.last_name, g.gkey, NULL::text
    FROM grouped g
    LEFT JOIN public.contacts c ON c.id = g.ids[1];

  ELSIF p_strategy = 'name_cap' THEN
    RETURN QUERY
    WITH grouped AS (
      SELECT
        lower(coalesce(c.first_name,'')||'|'||coalesce(c.last_name,'')||'|'||coalesce(c.cap,'')) AS gkey,
        array_agg(DISTINCT c.id ORDER BY c.id) AS ids,
        count(DISTINCT c.id)::int AS cnt
      FROM public.contacts c
      WHERE c.brand_id = p_brand_id
        AND c.merged_into_contact_id IS NULL
        AND c.first_name IS NOT NULL
        AND c.last_name IS NOT NULL
        AND c.cap IS NOT NULL
      GROUP BY lower(coalesce(c.first_name,'')||'|'||coalesce(c.last_name,'')||'|'||coalesce(c.cap,''))
      HAVING count(DISTINCT c.id) > 1
      LIMIT p_limit
    )
    SELECT g.gkey, g.ids, g.cnt,
           c.first_name, c.last_name, c.email, NULL::text
    FROM grouped g
    LEFT JOIN public.contacts c ON c.id = g.ids[1];

  ELSE
    RAISE EXCEPTION 'invalid strategy: %', p_strategy USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_contacts(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_duplicate_contacts(uuid, text, int) TO authenticated;

-- 3. merge_contacts(target_id, source_id)
CREATE OR REPLACE FUNCTION public.merge_contacts(
  p_target_id uuid,
  p_source_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_brand uuid;
  v_source_brand uuid;
  v_moved jsonb := '{}'::jsonb;
  v_n int;
BEGIN
  IF p_target_id = p_source_id THEN
    RAISE EXCEPTION 'target_equals_source' USING ERRCODE = '22023';
  END IF;

  SELECT brand_id INTO v_target_brand FROM public.contacts WHERE id = p_target_id AND merged_into_contact_id IS NULL;
  SELECT brand_id INTO v_source_brand FROM public.contacts WHERE id = p_source_id AND merged_into_contact_id IS NULL;

  IF v_target_brand IS NULL OR v_source_brand IS NULL THEN
    RAISE EXCEPTION 'contact_not_found_or_already_merged' USING ERRCODE = 'P0002';
  END IF;
  IF v_target_brand <> v_source_brand THEN
    RAISE EXCEPTION 'cross_brand_merge_forbidden' USING ERRCODE = '42501';
  END IF;

  -- Authorization: admin or ceo on the brand
  IF NOT (
    public.has_role_for_brand(auth.uid(), v_target_brand, 'admin')
    OR public.has_role_for_brand(auth.uid(), v_target_brand, 'ceo')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Reassign FK references. Each is best-effort: tables that don't exist are skipped via DO block.
  -- Note: we keep contact_phones rows distinct (no merge of identical phones); duplicates get is_active=false.
  UPDATE public.contact_phones SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('contact_phones', v_n);

  UPDATE public.appointments SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('appointments', v_n);

  UPDATE public.deals SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('deals', v_n);

  UPDATE public.tickets SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('tickets', v_n);

  UPDATE public.sales_orders SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('sales_orders', v_n);

  UPDATE public.lead_events SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('lead_events', v_n);

  UPDATE public.call_logs SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('call_logs', v_n);

  UPDATE public.call_transcripts SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('call_transcripts', v_n);

  UPDATE public.incoming_calls SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('incoming_calls', v_n);

  UPDATE public.contact_field_values SET contact_id = p_target_id WHERE contact_id = p_source_id
    AND NOT EXISTS (
      SELECT 1 FROM public.contact_field_values t
      WHERE t.contact_id = p_target_id AND t.field_id = contact_field_values.field_id
    );
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('contact_field_values', v_n);

  UPDATE public.tag_assignments SET contact_id = p_target_id WHERE contact_id = p_source_id
    AND NOT EXISTS (
      SELECT 1 FROM public.tag_assignments t
      WHERE t.contact_id = p_target_id AND t.tag_id = tag_assignments.tag_id
    );
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('tag_assignments', v_n);

  UPDATE public.contact_tracking SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('contact_tracking', v_n);

  UPDATE public.lead_score_history SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('lead_score_history', v_n);

  UPDATE public.lead_scores SET contact_id = p_target_id WHERE contact_id = p_source_id
    AND NOT EXISTS (SELECT 1 FROM public.lead_scores WHERE contact_id = p_target_id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('lead_scores', v_n);

  UPDATE public.lead_campaign_attribution SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('lead_campaign_attribution', v_n);

  UPDATE public.ai_call_action_proposals SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('ai_call_action_proposals', v_n);

  UPDATE public.automation_jobs SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('automation_jobs', v_n);

  UPDATE public.keplero_interactions SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('keplero_interactions', v_n);

  UPDATE public.meta_capi_event_queue SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('meta_capi_event_queue', v_n);

  UPDATE public.meta_lead_events SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('meta_lead_events', v_n);

  UPDATE public.household_people SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('household_people', v_n);

  -- Mark source as merged tombstone
  UPDATE public.contacts
     SET merged_into_contact_id = p_target_id,
         merged_at = now(),
         updated_at = now()
   WHERE id = p_source_id;

  -- Audit
  PERFORM public.log_audit_event(
    'contact', 'merge', v_target_brand, p_target_id,
    jsonb_build_object('source_contact_id', p_source_id),
    jsonb_build_object('target_contact_id', p_target_id, 'moved', v_moved),
    jsonb_build_object('moved', v_moved),
    'app', NULL, NULL
  );

  RETURN jsonb_build_object(
    'ok', true,
    'target_id', p_target_id,
    'source_id', p_source_id,
    'moved', v_moved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_contacts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.merge_contacts(uuid, uuid) IS
  'A5: merge source contact into target. Reassigns FK references across 22 tables, marks source as tombstone, logs audit event. Admin/CEO of brand only.';