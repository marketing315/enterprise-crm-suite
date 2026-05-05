CREATE OR REPLACE FUNCTION public.get_ceo_operational_kpis(
  p_brand_id UUID,
  p_brand_ids UUID[] DEFAULT NULL,
  p_from DATE DEFAULT CURRENT_DATE,
  p_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_accessible UUID[];
  v_system_brand CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
  v_total_contacts BIGINT;
  v_new_contacts BIGINT;
  v_open_tickets BIGINT;
  v_tickets_created BIGINT;
  v_appointments_period BIGINT;
  v_deals_by_stage JSON;
  v_total_open_deals BIGINT;
  v_total_open_value NUMERIC;
  v_won_deals BIGINT;
  v_won_revenue NUMERIC;
BEGIN
  v_user_id := current_app_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Admin / CEO bypass
  v_is_admin := has_role(v_user_id, 'admin'::app_role)
             OR has_role(v_user_id, 'ceo'::app_role);

  IF NOT v_is_admin THEN
    v_accessible := COALESCE(get_accessible_brand_ids(v_user_id), ARRAY[]::UUID[]);

    IF p_brand_ids IS NOT NULL THEN
      -- Filter requested brands to only those accessible (instead of failing hard)
      IF NOT (p_brand_ids <@ v_accessible) THEN
        -- Allow if at least one brand is accessible by trimming silently
        IF NOT EXISTS (SELECT 1 FROM unnest(p_brand_ids) b WHERE b = ANY(v_accessible)) THEN
          RAISE EXCEPTION 'Unauthorized brand access';
        END IF;
        p_brand_ids := ARRAY(SELECT b FROM unnest(p_brand_ids) b WHERE b = ANY(v_accessible));
      END IF;
    ELSE
      IF p_brand_id <> v_system_brand
         AND NOT (p_brand_id = ANY(v_accessible)) THEN
        RAISE EXCEPTION 'Unauthorized brand access';
      END IF;
    END IF;
  END IF;

  -- If single brand is the System Brand, treat as "all brands" for admin/CEO
  IF p_brand_ids IS NULL AND p_brand_id = v_system_brand THEN
    IF v_is_admin THEN
      p_brand_ids := ARRAY(SELECT id FROM brands WHERE id <> v_system_brand);
    ELSE
      p_brand_ids := COALESCE(get_accessible_brand_ids(v_user_id), ARRAY[]::UUID[]);
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_total_contacts
  FROM contacts
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END;

  SELECT COUNT(*) INTO v_new_contacts
  FROM contacts
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND created_at::date BETWEEN p_from AND p_to;

  SELECT COUNT(*) INTO v_open_tickets
  FROM tickets
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND status::text IN ('open', 'in_progress', 'reopened_for_support');

  SELECT COUNT(*) INTO v_tickets_created
  FROM tickets
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND created_at::date BETWEEN p_from AND p_to;

  SELECT COUNT(*) INTO v_appointments_period
  FROM appointments
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND status::text IN ('scheduled', 'confirmed', 'visited')
    AND scheduled_at::date BETWEEN p_from AND p_to;

  SELECT COALESCE(json_agg(row_to_json(stage_data) ORDER BY stage_data.stage_order), '[]'::json)
  INTO v_deals_by_stage
  FROM (
    SELECT
      ps.name AS stage_name,
      ps.order_index AS stage_order,
      COUNT(d.id) AS count,
      COALESCE(SUM(d.value), 0) AS total_value
    FROM pipeline_stages ps
    LEFT JOIN deals d ON d.current_stage_id = ps.id
      AND d.status::text = 'open'
      AND CASE WHEN p_brand_ids IS NOT NULL THEN d.brand_id = ANY(p_brand_ids) ELSE d.brand_id = p_brand_id END
    WHERE ps.is_active = true
    GROUP BY ps.id, ps.name, ps.order_index
  ) stage_data;

  SELECT COUNT(*), COALESCE(SUM(value), 0) INTO v_total_open_deals, v_total_open_value
  FROM deals
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND status::text = 'open';

  SELECT COUNT(*), COALESCE(SUM(value), 0) INTO v_won_deals, v_won_revenue
  FROM deals
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND status::text = 'won'
    AND COALESCE(closed_at, updated_at)::date BETWEEN p_from AND p_to;

  RETURN json_build_object(
    'total_contacts', v_total_contacts,
    'new_contacts_period', v_new_contacts,
    'open_tickets', v_open_tickets,
    'tickets_created', v_tickets_created,
    'appointments_period', v_appointments_period,
    'deals_by_stage', v_deals_by_stage,
    'total_open_deals', v_total_open_deals,
    'total_open_value', v_total_open_value,
    'won_deals_period', v_won_deals,
    'won_deals_revenue', v_won_revenue
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ceo_operational_kpis(uuid, uuid[], date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ceo_operational_kpis(uuid, uuid[], date, date) TO authenticated;