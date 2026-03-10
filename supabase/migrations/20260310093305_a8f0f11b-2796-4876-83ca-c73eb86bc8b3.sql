
CREATE OR REPLACE FUNCTION public.get_board_slo_metrics(
  p_brand_id uuid DEFAULT NULL,
  p_month_start timestamptz DEFAULT date_trunc('month', now())
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_end timestamptz := p_month_start + interval '1 month';
  v_result jsonb;
  v_ingest_total bigint;
  v_ingest_success bigint;
  v_ingest_availability numeric;
  v_tickets_total bigint;
  v_tickets_within_sla bigint;
  v_sla_compliance numeric;
  v_mttr_avg_hours numeric;
  v_ai_total bigint;
  v_ai_completed bigint;
  v_ai_success_rate numeric;
  v_ai_override_count bigint;
  v_ai_total_decisions bigint;
  v_ai_override_rate numeric;
  v_wh_total bigint;
  v_wh_success bigint;
  v_wh_delivery_rate numeric;
  v_wh_dlq bigint;
  v_wh_dlq_rate numeric;
  v_deal_avg_days numeric;
  v_deal_median_days numeric;
  v_deals_closed bigint;
  v_total_leads bigint;
  v_total_deals bigint;
  v_conversion_rate numeric;
BEGIN
  -- 1. Ingest Availability (exclude rejected/duplicates — intentional behavior)
  SELECT
    COUNT(*) FILTER (WHERE status != 'rejected'),
    COUNT(*) FILTER (WHERE status = 'success')
  INTO v_ingest_total, v_ingest_success
  FROM incoming_requests
  WHERE created_at >= p_month_start AND created_at < v_month_end
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  v_ingest_availability := CASE WHEN v_ingest_total > 0
    THEN ROUND(v_ingest_success::numeric / v_ingest_total * 100, 2)
    ELSE 100 END;

  -- 2. Ticket SLA Compliance
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE sla_breached_at IS NULL OR resolved_at < sla_breached_at)
  INTO v_tickets_total, v_tickets_within_sla
  FROM tickets
  WHERE created_at >= p_month_start AND created_at < v_month_end
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  v_sla_compliance := CASE WHEN v_tickets_total > 0
    THEN ROUND(v_tickets_within_sla::numeric / v_tickets_total * 100, 1)
    ELSE 100 END;

  SELECT
    ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 1)
  INTO v_mttr_avg_hours
  FROM tickets
  WHERE resolved_at IS NOT NULL
    AND created_at >= p_month_start AND created_at < v_month_end
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  -- 3. AI Success Rate
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_ai_total, v_ai_completed
  FROM ai_jobs
  WHERE created_at >= p_month_start AND created_at < v_month_end
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  v_ai_success_rate := CASE WHEN v_ai_total > 0
    THEN ROUND(v_ai_completed::numeric / v_ai_total * 100, 1)
    ELSE 100 END;

  SELECT
    COUNT(*) FILTER (WHERE was_overridden = true),
    COUNT(*)
  INTO v_ai_override_count, v_ai_total_decisions
  FROM ai_decision_logs
  WHERE created_at >= p_month_start AND created_at < v_month_end
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  v_ai_override_rate := CASE WHEN v_ai_total_decisions > 0
    THEN ROUND(v_ai_override_count::numeric / v_ai_total_decisions * 100, 1)
    ELSE 0 END;

  -- 4. Webhook Delivery Rate
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE dead_at IS NOT NULL)
  INTO v_wh_total, v_wh_success, v_wh_dlq
  FROM outbound_webhook_deliveries
  WHERE created_at >= p_month_start AND created_at < v_month_end
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  v_wh_delivery_rate := CASE WHEN v_wh_total > 0
    THEN ROUND(v_wh_success::numeric / v_wh_total * 100, 1)
    ELSE 100 END;

  v_wh_dlq_rate := CASE WHEN v_wh_total > 0
    THEN ROUND(v_wh_dlq::numeric / v_wh_total * 100, 1)
    ELSE 0 END;

  -- 5. Deal Velocity
  SELECT
    COUNT(*),
    ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400)::numeric, 1),
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400
    )::numeric, 1)
  INTO v_deals_closed, v_deal_avg_days, v_deal_median_days
  FROM deals
  WHERE closed_at IS NOT NULL AND status = 'won'
    AND created_at >= p_month_start AND created_at < v_month_end
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  -- 6. Lead → Deal Conversion
  SELECT COUNT(DISTINCT id) INTO v_total_leads
  FROM contacts
  WHERE created_at >= p_month_start AND created_at < v_month_end
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  SELECT COUNT(DISTINCT d.contact_id) INTO v_total_deals
  FROM deals d
  JOIN contacts c ON d.contact_id = c.id
  WHERE c.created_at >= p_month_start AND c.created_at < v_month_end
    AND d.status NOT IN ('lost')
    AND (p_brand_id IS NULL OR d.brand_id = p_brand_id);

  v_conversion_rate := CASE WHEN v_total_leads > 0
    THEN ROUND(v_total_deals::numeric / v_total_leads * 100, 1)
    ELSE 0 END;

  v_result := jsonb_build_object(
    'period', jsonb_build_object('start', p_month_start, 'end', v_month_end),
    'engineering', jsonb_build_object(
      'ingest_availability', jsonb_build_object(
        'value', v_ingest_availability, 'target', 99.5, 'unit', '%',
        'total', v_ingest_total, 'success', v_ingest_success
      ),
      'ai_success_rate', jsonb_build_object(
        'value', v_ai_success_rate, 'target', 95, 'unit', '%',
        'total', v_ai_total, 'completed', v_ai_completed
      ),
      'webhook_delivery_rate', jsonb_build_object(
        'value', v_wh_delivery_rate, 'target', 95, 'unit', '%',
        'total', v_wh_total, 'success', v_wh_success, 'dlq', v_wh_dlq,
        'dlq_rate', v_wh_dlq_rate
      )
    ),
    'cx_ops', jsonb_build_object(
      'sla_compliance', jsonb_build_object(
        'value', v_sla_compliance, 'target', 90, 'unit', '%',
        'total', v_tickets_total, 'within_sla', v_tickets_within_sla
      ),
      'mttr_hours', jsonb_build_object(
        'value', COALESCE(v_mttr_avg_hours, 0), 'target', 4, 'unit', 'h',
        'direction', 'lower_is_better'
      ),
      'ai_override_rate', jsonb_build_object(
        'value', v_ai_override_rate, 'target', 15, 'unit', '%',
        'direction', 'lower_is_better',
        'overrides', v_ai_override_count, 'total', v_ai_total_decisions
      )
    ),
    'sales_ops', jsonb_build_object(
      'lead_conversion', jsonb_build_object(
        'value', v_conversion_rate, 'target', 15, 'unit', '%',
        'total_leads', v_total_leads, 'converted', v_total_deals
      ),
      'deal_velocity', jsonb_build_object(
        'value', COALESCE(v_deal_avg_days, 0), 'target', 30, 'unit', 'gg',
        'direction', 'lower_is_better',
        'median', COALESCE(v_deal_median_days, 0), 'closed', v_deals_closed
      )
    )
  );

  RETURN v_result;
END;
$$;
