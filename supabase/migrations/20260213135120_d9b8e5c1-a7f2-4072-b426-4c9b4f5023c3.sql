
-- Add marketing campaign association to lead_events
ALTER TABLE public.lead_events
  ADD COLUMN IF NOT EXISTS marketing_campaign_id UUID REFERENCES public.marketing_campaigns(id);

CREATE INDEX IF NOT EXISTS idx_lead_events_marketing_campaign
  ON public.lead_events(marketing_campaign_id);

-- RPC: Leads by campaign with source breakdown for marketing reconciliation
CREATE OR REPLACE FUNCTION public.get_marketing_leads_by_campaign(
  p_brand_ids UUID[],
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE(
  campaign_id UUID,
  campaign_name TEXT,
  channel_name TEXT,
  total_leads BIGINT,
  manual_leads BIGINT,
  meta_leads BIGINT,
  webhook_leads BIGINT,
  meta_matched BIGINT,
  meta_unmatched BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH lead_counts AS (
    SELECT
      le.marketing_campaign_id,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE le.source::text = 'manual') AS manual_ct,
      COUNT(*) FILTER (WHERE le.source::text = 'meta') AS meta_ct,
      COUNT(*) FILTER (WHERE le.source::text = 'webhook') AS webhook_ct
    FROM lead_events le
    WHERE le.brand_id = ANY(p_brand_ids)
      AND le.occurred_at::date BETWEEN p_from_date AND p_to_date
      AND le.archived = false
    GROUP BY le.marketing_campaign_id
  ),
  meta_reconciliation AS (
    SELECT
      mc2.id AS campaign_id,
      COUNT(mle.id) FILTER (WHERE mle.contact_id IS NOT NULL) AS matched,
      COUNT(mle.id) FILTER (WHERE mle.contact_id IS NULL AND mle.status != 'error') AS unmatched
    FROM meta_lead_events mle
    JOIN marketing_campaigns mc2 ON mc2.external_id = 'meta:' || mle.campaign_id
    WHERE mle.brand_id = ANY(p_brand_ids)
      AND mle.received_at::date BETWEEN p_from_date AND p_to_date
    GROUP BY mc2.id
  )
  SELECT
    mc.id AS campaign_id,
    mc.name AS campaign_name,
    COALESCE(ch.name, 'Non assegnato') AS channel_name,
    COALESCE(lc.total, 0) AS total_leads,
    COALESCE(lc.manual_ct, 0) AS manual_leads,
    COALESCE(lc.meta_ct, 0) AS meta_leads,
    COALESCE(lc.webhook_ct, 0) AS webhook_leads,
    COALESCE(mr.matched, 0) AS meta_matched,
    COALESCE(mr.unmatched, 0) AS meta_unmatched
  FROM marketing_campaigns mc
  LEFT JOIN marketing_channels ch ON ch.id = mc.channel_id
  LEFT JOIN lead_counts lc ON lc.marketing_campaign_id = mc.id
  LEFT JOIN meta_reconciliation mr ON mr.campaign_id = mc.id
  WHERE mc.brand_id = ANY(p_brand_ids)
    AND (mc.start_date <= p_to_date AND (mc.end_date IS NULL OR mc.end_date >= p_from_date))
  ORDER BY COALESCE(lc.total, 0) DESC;
$$;

-- RPC: Create manual marketing lead with campaign association
CREATE OR REPLACE FUNCTION public.create_marketing_lead(
  p_brand_id UUID,
  p_contact_id UUID,
  p_marketing_campaign_id UUID DEFAULT NULL,
  p_source_name TEXT DEFAULT 'Lead manuale marketing',
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_event_id UUID;
BEGIN
  v_user_id := current_app_user_id();
  
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Accesso negato al brand';
  END IF;

  INSERT INTO lead_events (
    brand_id, contact_id, source, source_name,
    marketing_campaign_id, occurred_at, received_at,
    raw_payload
  ) VALUES (
    p_brand_id, p_contact_id, 'manual', p_source_name,
    p_marketing_campaign_id, now(), now(),
    jsonb_build_object('notes', p_notes, 'created_by', v_user_id::text)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;
