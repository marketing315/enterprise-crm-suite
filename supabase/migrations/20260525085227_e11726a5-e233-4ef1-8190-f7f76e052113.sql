ALTER TABLE public.call_transcripts
  ADD COLUMN IF NOT EXISTS speaker_turns jsonb,
  ADD COLUMN IF NOT EXISTS sentiment_customer text,
  ADD COLUMN IF NOT EXISTS sentiment_customer_score numeric,
  ADD COLUMN IF NOT EXISTS sentiment_operator text,
  ADD COLUMN IF NOT EXISTS sentiment_operator_score numeric,
  ADD COLUMN IF NOT EXISTS diarization_status text DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_call_transcripts_sentiment_customer
  ON public.call_transcripts(brand_id, sentiment_customer)
  WHERE sentiment_customer IS NOT NULL;