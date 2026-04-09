
-- 1. Enum heat_class
DO $$ BEGIN
  CREATE TYPE public.heat_class AS ENUM ('freddo', 'tiepido', 'caldo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. lead_scores table
CREATE TABLE IF NOT EXISTS public.lead_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  score smallint NOT NULL DEFAULT 0,
  heat_class public.heat_class NOT NULL DEFAULT 'freddo',
  positive_drivers text[] NOT NULL DEFAULT '{}',
  negative_drivers text[] NOT NULL DEFAULT '{}',
  next_best_action text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_scores_brand_score ON public.lead_scores(brand_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_scores_heat ON public.lead_scores(brand_id, heat_class);

ALTER TABLE public.lead_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read lead_scores of their brand"
  ON public.lead_scores FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can manage lead_scores of their brand"
  ON public.lead_scores FOR ALL TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- 3. lead_score_history table
CREATE TABLE IF NOT EXISTS public.lead_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  score smallint NOT NULL,
  heat_class public.heat_class NOT NULL,
  trigger_event text,
  positive_drivers text[] NOT NULL DEFAULT '{}',
  negative_drivers text[] NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_score_history_contact ON public.lead_score_history(contact_id, computed_at DESC);

ALTER TABLE public.lead_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read lead_score_history of their brand"
  ON public.lead_score_history FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can insert lead_score_history of their brand"
  ON public.lead_score_history FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- 4. Cache columns on contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lead_score smallint,
  ADD COLUMN IF NOT EXISTS lead_heat_class public.heat_class,
  ADD COLUMN IF NOT EXISTS lead_score_updated_at timestamptz;

-- 5. calculate_lead_score RPC
CREATE OR REPLACE FUNCTION public.calculate_lead_score(
  p_contact_id uuid,
  p_trigger_event text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_score int := 30;
  v_drivers_pos text[] := '{}';
  v_drivers_neg text[] := '{}';
  v_next_action text;
  v_heat public.heat_class;
  v_contact record;
  v_appt_counts record;
  v_deal_counts record;
  v_call_counts record;
  v_event_count int;
  v_last_activity timestamptz;
  v_days_inactive int;
  v_has_positive_sentiment boolean;
  v_has_negative_sentiment boolean;
BEGIN
  SELECT c.brand_id, c.* INTO v_contact
  FROM contacts c WHERE c.id = p_contact_id;
  
  IF v_contact IS NULL THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;
  
  v_brand_id := v_contact.brand_id;

  -- A. FORM DATA
  IF v_contact.phone IS NOT NULL AND v_contact.phone != '' THEN
    v_score := v_score + 5;
    v_drivers_pos := array_append(v_drivers_pos, 'Telefono presente');
  ELSE
    v_drivers_neg := array_append(v_drivers_neg, 'Telefono mancante');
  END IF;

  IF v_contact.email IS NOT NULL AND v_contact.email != '' THEN
    v_score := v_score + 3;
    v_drivers_pos := array_append(v_drivers_pos, 'Email presente');
  END IF;

  IF v_contact.quiz_answers IS NOT NULL AND v_contact.quiz_answers::text != '{}' AND v_contact.quiz_answers::text != 'null' THEN
    v_score := v_score + 8;
    v_drivers_pos := array_append(v_drivers_pos, 'Quiz compilato');
  END IF;

  IF v_contact.lead_message IS NOT NULL AND length(trim(v_contact.lead_message)) > 10 THEN
    v_score := v_score + 5;
    v_drivers_pos := array_append(v_drivers_pos, 'Richiesta dettagliata');
  END IF;

  -- B. RECENCY
  IF v_contact.created_at > now() - interval '1 day' THEN
    v_score := v_score + 10;
    v_drivers_pos := array_append(v_drivers_pos, 'Lead recentissimo (oggi)');
  ELSIF v_contact.created_at > now() - interval '3 days' THEN
    v_score := v_score + 5;
    v_drivers_pos := array_append(v_drivers_pos, 'Lead recente (<3 giorni)');
  END IF;

  -- C. APPOINTMENTS
  SELECT
    count(*) FILTER (WHERE a.status = 'scheduled') AS scheduled,
    count(*) FILTER (WHERE a.status = 'confirmed') AS confirmed,
    count(*) FILTER (WHERE a.status = 'visited') AS visited,
    count(*) FILTER (WHERE a.status = 'no_show') AS no_show,
    count(*) FILTER (WHERE a.status = 'cancelled') AS cancelled
  INTO v_appt_counts
  FROM appointments a
  WHERE a.contact_id = p_contact_id AND a.brand_id = v_brand_id;

  IF v_appt_counts.confirmed > 0 THEN
    v_score := v_score + 25;
    v_drivers_pos := array_append(v_drivers_pos, 'Appuntamento confermato');
  ELSIF v_appt_counts.visited > 0 THEN
    v_score := v_score + 20;
    v_drivers_pos := array_append(v_drivers_pos, 'Visita effettuata');
  ELSIF v_appt_counts.scheduled > 0 THEN
    v_score := v_score + 15;
    v_drivers_pos := array_append(v_drivers_pos, 'Appuntamento fissato');
  END IF;

  IF v_appt_counts.no_show > 0 THEN
    v_score := v_score - (v_appt_counts.no_show * 15);
    v_drivers_neg := array_append(v_drivers_neg, v_appt_counts.no_show || ' no-show');
  END IF;

  IF v_appt_counts.cancelled > 0 THEN
    v_score := v_score - (v_appt_counts.cancelled * 10);
    v_drivers_neg := array_append(v_drivers_neg, v_appt_counts.cancelled || ' cancellazione/i');
  END IF;

  -- D. DEALS
  SELECT
    count(*) FILTER (WHERE d.status = 'open') AS open_deals,
    count(*) FILTER (WHERE d.status = 'won') AS won,
    count(*) FILTER (WHERE d.status = 'lost') AS lost
  INTO v_deal_counts
  FROM deals d
  WHERE d.contact_id = p_contact_id AND d.brand_id = v_brand_id;

  IF v_deal_counts.won > 0 THEN
    v_score := v_score + 15;
    v_drivers_pos := array_append(v_drivers_pos, 'Deal vinto in passato');
  ELSIF v_deal_counts.open_deals > 0 THEN
    v_score := v_score + 10;
    v_drivers_pos := array_append(v_drivers_pos, 'Deal attivo in pipeline');
  END IF;

  IF v_deal_counts.lost > 0 THEN
    v_score := v_score - 10;
    v_drivers_neg := array_append(v_drivers_neg, 'Deal perso in passato');
  END IF;

  -- E. CALLS
  SELECT
    count(*) AS total_calls,
    count(*) FILTER (WHERE cl.status = 'completed' AND cl.duration_seconds > 120) AS quality_calls
  INTO v_call_counts
  FROM call_logs cl
  WHERE cl.contact_id = p_contact_id AND cl.brand_id = v_brand_id;

  IF v_call_counts.total_calls > 0 THEN
    v_score := v_score + 8;
    v_drivers_pos := array_append(v_drivers_pos, 'Chiamata effettuata');
  END IF;

  IF v_call_counts.quality_calls > 0 THEN
    v_score := v_score + 5;
    v_drivers_pos := array_append(v_drivers_pos, 'Chiamata di qualità (>2 min)');
  END IF;

  -- F. LEAD EVENTS & SENTIMENT
  SELECT count(*) INTO v_event_count
  FROM lead_events le
  WHERE le.contact_id = p_contact_id AND le.brand_id = v_brand_id;

  IF v_event_count > 1 THEN
    v_score := v_score + LEAST(v_event_count * 3, 15);
    v_drivers_pos := array_append(v_drivers_pos, v_event_count || ' interazioni registrate');
  END IF;

  SELECT
    bool_or(le.customer_sentiment = 'positivo') AS has_pos,
    bool_or(le.customer_sentiment = 'negativo') AS has_neg
  INTO v_has_positive_sentiment, v_has_negative_sentiment
  FROM lead_events le
  WHERE le.contact_id = p_contact_id AND le.brand_id = v_brand_id
    AND le.customer_sentiment IS NOT NULL;

  IF v_has_positive_sentiment THEN
    v_score := v_score + 10;
    v_drivers_pos := array_append(v_drivers_pos, 'Sentiment positivo');
  END IF;

  IF v_has_negative_sentiment THEN
    v_score := v_score - 10;
    v_drivers_neg := array_append(v_drivers_neg, 'Sentiment negativo');
  END IF;

  -- G. INACTIVITY
  SELECT GREATEST(
    max(a.scheduled_at),
    max(cl.started_at),
    max(le.occurred_at),
    v_contact.updated_at
  ) INTO v_last_activity
  FROM contacts c
  LEFT JOIN appointments a ON a.contact_id = c.id
  LEFT JOIN call_logs cl ON cl.contact_id = c.id
  LEFT JOIN lead_events le ON le.contact_id = c.id
  WHERE c.id = p_contact_id;

  v_days_inactive := EXTRACT(DAY FROM now() - COALESCE(v_last_activity, v_contact.created_at));

  IF v_days_inactive >= 14 THEN
    v_score := v_score - 25;
    v_drivers_neg := array_append(v_drivers_neg, 'Inattivo da ' || v_days_inactive || ' giorni');
  ELSIF v_days_inactive >= 7 THEN
    v_score := v_score - 15;
    v_drivers_neg := array_append(v_drivers_neg, 'Inattivo da ' || v_days_inactive || ' giorni');
  END IF;

  -- CLAMP & CLASSIFY
  v_score := GREATEST(0, LEAST(100, v_score));

  IF v_score >= 70 THEN
    v_heat := 'caldo';
    v_next_action := 'Contattare entro 30 minuti con proposta commerciale';
  ELSIF v_score >= 40 THEN
    v_heat := 'tiepido';
    v_next_action := 'Programmare follow-up entro 24 ore';
  ELSE
    v_heat := 'freddo';
    v_next_action := 'Inserire in sequenza nurturing automatica';
  END IF;

  v_drivers_pos := v_drivers_pos[1:3];
  v_drivers_neg := v_drivers_neg[1:3];

  -- PERSIST
  INSERT INTO lead_scores (contact_id, brand_id, score, heat_class, positive_drivers, negative_drivers, next_best_action, computed_at)
  VALUES (p_contact_id, v_brand_id, v_score, v_heat, v_drivers_pos, v_drivers_neg, v_next_action, now())
  ON CONFLICT (contact_id) DO UPDATE SET
    score = EXCLUDED.score,
    heat_class = EXCLUDED.heat_class,
    positive_drivers = EXCLUDED.positive_drivers,
    negative_drivers = EXCLUDED.negative_drivers,
    next_best_action = EXCLUDED.next_best_action,
    computed_at = EXCLUDED.computed_at,
    updated_at = now();

  INSERT INTO lead_score_history (contact_id, brand_id, score, heat_class, trigger_event, positive_drivers, negative_drivers)
  VALUES (p_contact_id, v_brand_id, v_score, v_heat, p_trigger_event, v_drivers_pos, v_drivers_neg);

  UPDATE contacts SET
    lead_score = v_score,
    lead_heat_class = v_heat,
    lead_score_updated_at = now()
  WHERE id = p_contact_id;

  RETURN jsonb_build_object(
    'contact_id', p_contact_id,
    'score', v_score,
    'heat_class', v_heat::text,
    'positive_drivers', to_jsonb(v_drivers_pos),
    'negative_drivers', to_jsonb(v_drivers_neg),
    'next_best_action', v_next_action,
    'computed_at', now()
  );
END;
$$;
