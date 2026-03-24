
-- Table ga4_stats
CREATE TABLE public.ga4_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  stat_date date NOT NULL,
  sessions integer NOT NULL DEFAULT 0,
  pageviews integer NOT NULL DEFAULT 0,
  users integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  bounce_rate numeric NOT NULL DEFAULT 0,
  avg_session_duration numeric NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  conversion_events jsonb DEFAULT '[]'::jsonb,
  top_pages jsonb DEFAULT '[]'::jsonb,
  top_sources jsonb DEFAULT '[]'::jsonb,
  top_campaigns jsonb DEFAULT '[]'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, stat_date)
);

ALTER TABLE public.ga4_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ga4_stats for their brands"
  ON public.ga4_stats FOR SELECT TO authenticated
  USING (public.user_belongs_to_brand(auth.uid(), brand_id));

CREATE POLICY "Service role can manage ga4_stats"
  ON public.ga4_stats FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_ga4_stats_brand_date ON public.ga4_stats (brand_id, stat_date);
