
-- F3: Extend call_transcripts with sentiment/analysis + consent + RPC

ALTER TABLE public.call_transcripts
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS consent_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS sentiment text,
  ADD COLUMN IF NOT EXISTS sentiment_score numeric,
  ADD COLUMN IF NOT EXISTS call_outcome text,
  ADD COLUMN IF NOT EXISTS client_intent text,
  ADD COLUMN IF NOT EXISTS decision_status text,
  ADD COLUMN IF NOT EXISTS objection_type text,
  ADD COLUMN IF NOT EXISTS clinical_interest text,
  ADD COLUMN IF NOT EXISTS call_quality text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS keywords text[],
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS stt_provider text,
  ADD COLUMN IF NOT EXISTS stt_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS stt_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stt_error text,
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_call_transcripts_brand_created ON public.call_transcripts(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_sentiment ON public.call_transcripts(brand_id, sentiment) WHERE sentiment IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_transcripts_outcome ON public.call_transcripts(brand_id, call_outcome) WHERE call_outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_transcripts_stt_status ON public.call_transcripts(stt_status) WHERE stt_status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_call_transcripts_fulltext ON public.call_transcripts USING gin (to_tsvector('italian', coalesce(full_text,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(notes,'')));

-- RPC: list transcripts with filters (brand-scoped, role-aware)
CREATE OR REPLACE FUNCTION public.list_call_transcripts(
  p_brand_id uuid,
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to timestamptz DEFAULT now(),
  p_user_id uuid DEFAULT NULL,
  p_sentiment text DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  call_log_id uuid,
  contact_id uuid,
  brand_id uuid,
  created_at timestamptz,
  analyzed_at timestamptz,
  summary text,
  full_text text,
  sentiment text,
  sentiment_score numeric,
  call_outcome text,
  client_intent text,
  decision_status text,
  objection_type text,
  clinical_interest text,
  call_quality text,
  notes text,
  keywords text[],
  consent_status text,
  ai_status text,
  stt_status text,
  channel text,
  call_started_at timestamptz,
  call_duration_seconds integer,
  call_phone_number text,
  call_user_id uuid,
  user_full_name text,
  contact_first_name text,
  contact_last_name text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := get_user_id(auth.uid());
  v_is_admin boolean := has_role(v_uid, 'admin') OR has_role(v_uid, 'ceo');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  -- Brand membership
  IF NOT (v_is_admin OR EXISTS (SELECT 1 FROM user_roles WHERE user_id=v_uid AND brand_id=p_brand_id)) THEN
    RAISE EXCEPTION 'forbidden: brand access';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT t.*, cl.started_at AS _call_started_at, cl.duration_seconds AS _call_duration_seconds,
           cl.phone_number AS _call_phone_number, cl.user_id AS _call_user_id,
           u.full_name AS _user_full_name, c.first_name AS _c_first, c.last_name AS _c_last
    FROM call_transcripts t
    LEFT JOIN call_logs cl ON cl.id = t.call_log_id
    LEFT JOIN users u ON u.id = cl.user_id
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.brand_id = p_brand_id
      AND t.created_at BETWEEN p_from AND p_to
      AND (p_user_id IS NULL OR cl.user_id = p_user_id)
      AND (p_sentiment IS NULL OR t.sentiment = p_sentiment)
      AND (p_outcome IS NULL OR t.call_outcome = p_outcome)
      AND (
        p_search IS NULL OR p_search = '' OR
        to_tsvector('italian', coalesce(t.full_text,'') || ' ' || coalesce(t.summary,'') || ' ' || coalesce(t.notes,''))
          @@ plainto_tsquery('italian', p_search)
      )
  ), counted AS (
    SELECT count(*) AS c FROM base
  )
  SELECT b.id, b.call_log_id, b.contact_id, b.brand_id, b.created_at, b.analyzed_at,
         b.summary, b.full_text, b.sentiment, b.sentiment_score, b.call_outcome,
         b.client_intent, b.decision_status, b.objection_type, b.clinical_interest,
         b.call_quality, b.notes, b.keywords, b.consent_status, b.ai_status, b.stt_status, b.channel,
         b._call_started_at, b._call_duration_seconds, b._call_phone_number, b._call_user_id,
         b._user_full_name, b._c_first, b._c_last,
         (SELECT c FROM counted)
  FROM base b
  ORDER BY b.created_at DESC
  LIMIT LEAST(p_limit, 500) OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_call_transcripts(uuid,timestamptz,timestamptz,uuid,text,text,text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_call_transcripts(uuid,timestamptz,timestamptz,uuid,text,text,text,int,int) TO authenticated;

-- RPC: enqueue pending transcript (idempotent per call_log)
CREATE OR REPLACE FUNCTION public.enqueue_call_transcript(p_call_log_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cl record;
  v_id uuid;
BEGIN
  SELECT id, brand_id, contact_id, recording_url INTO v_cl
  FROM call_logs WHERE id = p_call_log_id;
  IF v_cl.id IS NULL THEN RAISE EXCEPTION 'call_log not found'; END IF;
  IF v_cl.recording_url IS NULL OR v_cl.recording_url = '' THEN RETURN NULL; END IF;
  IF v_cl.contact_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_id FROM call_transcripts WHERE call_log_id = p_call_log_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO call_transcripts (call_log_id, brand_id, contact_id, recording_url, stt_status, ai_status, consent_status)
  VALUES (p_call_log_id, v_cl.brand_id, v_cl.contact_id, v_cl.recording_url, 'pending', 'pending',
          COALESCE((SELECT consent_status FROM contacts WHERE id = v_cl.contact_id), 'unknown'))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_call_transcript(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_call_transcript(uuid) TO authenticated, service_role;
