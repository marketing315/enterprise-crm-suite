
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS dnis text,
  ADD COLUMN IF NOT EXISTS tracking_number_id uuid REFERENCES public.tracking_numbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_call_logs_tracking_number
  ON public.call_logs(tracking_number_id) WHERE tracking_number_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_call_logs_brand_started
  ON public.call_logs(brand_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.get_operator_kpis(
  p_brand_id uuid, p_from timestamptz, p_to timestamptz
)
RETURNS TABLE (
  user_id uuid, full_name text,
  calls_total bigint, calls_inbound bigint, calls_outbound bigint,
  calls_answered bigint, calls_missed bigint,
  talk_time_seconds bigint, avg_talk_seconds numeric, avg_response_seconds numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    u.id, COALESCE(u.full_name, u.email),
    COUNT(cl.id)::bigint,
    COUNT(cl.id) FILTER (WHERE cl.call_type = 'inbound')::bigint,
    COUNT(cl.id) FILTER (WHERE cl.call_type = 'outbound')::bigint,
    COUNT(cl.id) FILTER (WHERE cl.status IN ('answered','completed') AND (cl.outcome IS NULL OR cl.outcome <> 'missed'))::bigint,
    COUNT(cl.id) FILTER (WHERE cl.status IN ('no_answer','failed','busy') OR cl.outcome = 'missed')::bigint,
    COALESCE(SUM(cl.duration_seconds), 0)::bigint,
    ROUND(AVG(cl.duration_seconds) FILTER (WHERE cl.duration_seconds IS NOT NULL), 1),
    ROUND(AVG(cl.response_time_seconds) FILTER (WHERE cl.response_time_seconds IS NOT NULL), 1)
  FROM public.users u
  LEFT JOIN public.call_logs cl
    ON cl.user_id = u.id AND cl.brand_id = p_brand_id
   AND cl.started_at >= p_from AND cl.started_at < p_to
  WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.brand_id = p_brand_id)
    AND user_belongs_to_brand(get_user_id(auth.uid()), p_brand_id)
  GROUP BY u.id, u.full_name, u.email
  HAVING COUNT(cl.id) > 0
  ORDER BY 3 DESC
  LIMIT 500;
$$;

REVOKE EXECUTE ON FUNCTION public.get_operator_kpis(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_operator_kpis(uuid, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tracking_number_performance(
  p_brand_id uuid, p_from date, p_to date
)
RETURNS TABLE (
  tracking_number_id uuid, label text, phone_e164 text, broadcaster text,
  channel_name text, campaign_name text,
  calls_in bigint, calls_answered bigint, unique_contacts bigint, talk_time_seconds bigint,
  spend numeric, est_cpl numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH calls AS (
    SELECT
      cl.tracking_number_id,
      COUNT(*) FILTER (WHERE cl.call_type = 'inbound')::bigint AS calls_in,
      COUNT(*) FILTER (WHERE cl.call_type = 'inbound' AND cl.status IN ('answered','completed') AND (cl.outcome IS NULL OR cl.outcome <> 'missed'))::bigint AS calls_answered,
      COUNT(DISTINCT cl.contact_id) FILTER (WHERE cl.contact_id IS NOT NULL)::bigint AS unique_contacts,
      COALESCE(SUM(cl.duration_seconds) FILTER (WHERE cl.duration_seconds IS NOT NULL), 0)::bigint AS talk_time_seconds
    FROM public.call_logs cl
    WHERE cl.brand_id = p_brand_id
      AND cl.tracking_number_id IS NOT NULL
      AND cl.started_at >= p_from::timestamptz
      AND cl.started_at <  (p_to + INTERVAL '1 day')::timestamptz
    GROUP BY cl.tracking_number_id
  ),
  costs AS (
    SELECT mc.tracking_number_id, COALESCE(SUM(mc.amount), 0) AS spend
    FROM public.marketing_costs mc
    WHERE mc.brand_id = p_brand_id
      AND mc.tracking_number_id IS NOT NULL
      AND mc.cost_date BETWEEN p_from AND p_to
    GROUP BY mc.tracking_number_id
  )
  SELECT
    tn.id, tn.label, tn.phone_e164, tn.broadcaster,
    mc2.name, mcp.name,
    COALESCE(c.calls_in, 0), COALESCE(c.calls_answered, 0),
    COALESCE(c.unique_contacts, 0), COALESCE(c.talk_time_seconds, 0),
    CASE WHEN public.has_finance_access(get_user_id(auth.uid()), p_brand_id)
         THEN COALESCE(costs.spend, 0) ELSE NULL END,
    CASE WHEN public.has_finance_access(get_user_id(auth.uid()), p_brand_id)
              AND COALESCE(c.unique_contacts, 0) > 0
         THEN ROUND(COALESCE(costs.spend, 0) / c.unique_contacts, 2) ELSE NULL END
  FROM public.tracking_numbers tn
  LEFT JOIN calls c ON c.tracking_number_id = tn.id
  LEFT JOIN costs   ON costs.tracking_number_id = tn.id
  LEFT JOIN public.marketing_channels  mc2 ON mc2.id = tn.channel_id
  LEFT JOIN public.marketing_campaigns mcp ON mcp.id = tn.campaign_id
  WHERE tn.brand_id = p_brand_id
    AND tn.is_active = true
    AND user_belongs_to_brand(get_user_id(auth.uid()), p_brand_id)
  ORDER BY 7 DESC NULLS LAST, tn.label
  LIMIT 500;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tracking_number_performance(uuid, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_tracking_number_performance(uuid, date, date) TO authenticated;
