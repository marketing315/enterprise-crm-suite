
-- Drop existing overloads if any
DO $$ BEGIN
  PERFORM pg_catalog.pg_proc.oid
  FROM pg_catalog.pg_proc
  JOIN pg_catalog.pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
  WHERE pg_namespace.nspname = 'public'
    AND pg_proc.proname = 'get_ceo_operational_kpis';
  IF FOUND THEN
    DROP FUNCTION IF EXISTS public.get_ceo_operational_kpis CASCADE;
  END IF;
END $$;

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
  v_result JSON;
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
  -- Resolve current user
  v_user_id := current_app_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate brand access
  IF p_brand_ids IS NOT NULL THEN
    -- Multi-brand: validate all brands are accessible
    IF NOT (p_brand_ids <@ (SELECT ARRAY_AGG(ur.brand_id) FROM user_roles ur WHERE ur.user_id = v_user_id)) THEN
      RAISE EXCEPTION 'Unauthorized brand access';
    END IF;
  ELSE
    -- Single brand
    IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
      RAISE EXCEPTION 'Unauthorized brand access';
    END IF;
  END IF;

  -- Total contacts
  SELECT COUNT(*) INTO v_total_contacts
  FROM contacts
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END;

  -- New contacts in period
  SELECT COUNT(*) INTO v_new_contacts
  FROM contacts
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND created_at::date BETWEEN p_from AND p_to;

  -- Open tickets
  SELECT COUNT(*) INTO v_open_tickets
  FROM tickets
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND status::text IN ('open', 'in_progress', 'reopened_for_support');

  -- Tickets created in period
  SELECT COUNT(*) INTO v_tickets_created
  FROM tickets
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND created_at::date BETWEEN p_from AND p_to;

  -- Appointments in period (only valid statuses)
  SELECT COUNT(*) INTO v_appointments_period
  FROM appointments
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND status::text IN ('scheduled', 'confirmed', 'visited')
    AND scheduled_at::date BETWEEN p_from AND p_to;

  -- Deals by stage (open deals)
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
    GROUP BY ps.id, ps.name, ps.order_index
    ORDER BY ps.order_index
  ) stage_data;

  -- Total open deals
  SELECT COUNT(*), COALESCE(SUM(value), 0)
  INTO v_total_open_deals, v_total_open_value
  FROM deals
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND status::text = 'open';

  -- Won deals in period
  SELECT COUNT(*), COALESCE(SUM(value), 0)
  INTO v_won_deals, v_won_revenue
  FROM deals
  WHERE CASE WHEN p_brand_ids IS NOT NULL THEN brand_id = ANY(p_brand_ids) ELSE brand_id = p_brand_id END
    AND status::text = 'won'
    AND closed_at::date BETWEEN p_from AND p_to;

  -- Build result
  v_result := json_build_object(
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

  RETURN v_result;
END;
$$;
