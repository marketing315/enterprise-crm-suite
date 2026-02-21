
-- Step 1: Extend call_logs with response_time and idempotency
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS provider_call_id text,
  ADD COLUMN IF NOT EXISTS event_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS response_time_seconds integer,
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN ('answered','missed','failed','busy','no_answer'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_call_logs_provider_dedup
  ON public.call_logs (provider_call_id, event_version)
  WHERE provider_call_id IS NOT NULL;

-- Step 2: call_transcripts table
CREATE TABLE public.call_transcripts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_log_id uuid NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  full_text text,
  summary text,
  ai_model text,
  ai_status text NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending','processing','completed','failed')),
  ai_error text,
  tokens_used integer,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_transcripts_call_log ON public.call_transcripts(call_log_id);
CREATE INDEX idx_call_transcripts_contact ON public.call_transcripts(contact_id);
CREATE INDEX idx_call_transcripts_brand ON public.call_transcripts(brand_id);

ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transcripts for their brand"
  ON public.call_transcripts FOR SELECT
  USING (
    brand_id = ANY(public.get_user_brand_ids(public.get_user_id(auth.uid())))
  );

CREATE POLICY "Users can insert transcripts for their brand"
  ON public.call_transcripts FOR INSERT
  WITH CHECK (
    brand_id = ANY(public.get_user_brand_ids(public.get_user_id(auth.uid())))
  );

CREATE POLICY "Users can update transcripts for their brand"
  ON public.call_transcripts FOR UPDATE
  USING (
    brand_id = ANY(public.get_user_brand_ids(public.get_user_id(auth.uid())))
  );

CREATE TRIGGER update_call_transcripts_updated_at
  BEFORE UPDATE ON public.call_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Step 3: RPC for call center telephony KPIs
CREATE OR REPLACE FUNCTION public.get_call_center_telephony_kpis(
  p_brand_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_calls', COUNT(*),
    'answered_calls', COUNT(*) FILTER (WHERE status = 'completed' OR status = 'answered'),
    'missed_calls', COUNT(*) FILTER (WHERE status = 'no_answer' OR outcome = 'missed'),
    'failed_calls', COUNT(*) FILTER (WHERE status = 'failed'),
    'busy_calls', COUNT(*) FILTER (WHERE status = 'busy'),
    'answered_rate', CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE status = 'completed' OR status = 'answered'))::numeric / COUNT(*)::numeric * 100, 1)
      ELSE 0 END,
    'avg_duration_seconds', ROUND(AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL AND duration_seconds > 0)),
    'p90_duration_seconds', PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL AND duration_seconds > 0),
    'avg_response_time_seconds', ROUND(AVG(response_time_seconds) FILTER (WHERE response_time_seconds IS NOT NULL AND response_time_seconds > 0)),
    'p90_response_time_seconds', PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY response_time_seconds) FILTER (WHERE response_time_seconds IS NOT NULL AND response_time_seconds > 0),
    'by_operator', (
      SELECT COALESCE(json_agg(op_row), '[]'::json)
      FROM (
        SELECT
          cl2.user_id,
          u.full_name,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE cl2.status = 'completed' OR cl2.status = 'answered') as answered,
          ROUND(AVG(cl2.duration_seconds) FILTER (WHERE cl2.duration_seconds IS NOT NULL AND cl2.duration_seconds > 0)) as avg_duration,
          ROUND(AVG(cl2.response_time_seconds) FILTER (WHERE cl2.response_time_seconds IS NOT NULL AND cl2.response_time_seconds > 0)) as avg_response_time
        FROM call_logs cl2
        JOIN users u ON u.id = cl2.user_id
        WHERE cl2.brand_id = p_brand_id
          AND cl2.started_at >= p_from
          AND cl2.started_at <= p_to
        GROUP BY cl2.user_id, u.full_name
        ORDER BY total DESC
      ) op_row
    ),
    'daily_trend', (
      SELECT COALESCE(json_agg(dt_row ORDER BY dt_row.call_date), '[]'::json)
      FROM (
        SELECT
          DATE(cl3.started_at) as call_date,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE cl3.status = 'completed' OR cl3.status = 'answered') as answered,
          COUNT(*) FILTER (WHERE cl3.status = 'no_answer' OR cl3.outcome = 'missed') as missed
        FROM call_logs cl3
        WHERE cl3.brand_id = p_brand_id
          AND cl3.started_at >= p_from
          AND cl3.started_at <= p_to
        GROUP BY DATE(cl3.started_at)
      ) dt_row
    )
  ) INTO result
  FROM call_logs cl
  WHERE cl.brand_id = p_brand_id
    AND cl.started_at >= p_from
    AND cl.started_at <= p_to;

  RETURN result;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.call_transcripts;
