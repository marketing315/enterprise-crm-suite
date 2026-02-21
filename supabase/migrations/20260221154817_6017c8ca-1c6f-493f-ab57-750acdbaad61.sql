
-- =====================================================
-- Campaign Groups (rule-based attribution)
-- =====================================================
CREATE TABLE public.marketing_campaign_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  match_rules JSONB NOT NULL DEFAULT '{}',
  campaign_ids UUID[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.marketing_campaign_groups IS 'Groups of campaigns with rule-based lead matching';
COMMENT ON COLUMN public.marketing_campaign_groups.match_rules IS 'JSON: { source_names: string[], channel_ids: uuid[], tags: string[] }';
COMMENT ON COLUMN public.marketing_campaign_groups.priority IS 'Higher = checked first in resolver';

CREATE INDEX idx_mcg_brand ON public.marketing_campaign_groups(brand_id);
CREATE INDEX idx_mcg_active ON public.marketing_campaign_groups(brand_id, is_active) WHERE is_active = true;

ALTER TABLE public.marketing_campaign_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketing roles can view campaign groups"
  ON public.marketing_campaign_groups FOR SELECT
  USING (has_marketing_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admin/CEO can manage campaign groups"
  ON public.marketing_campaign_groups FOR INSERT
  WITH CHECK (has_marketing_write_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admin/CEO can update campaign groups"
  ON public.marketing_campaign_groups FOR UPDATE
  USING (has_marketing_write_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admin/CEO can delete campaign groups"
  ON public.marketing_campaign_groups FOR DELETE
  USING (has_marketing_write_access(get_user_id(auth.uid()), brand_id));

-- =====================================================
-- Lead → Campaign Attribution
-- =====================================================
CREATE TABLE public.lead_campaign_attribution (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  lead_event_id UUID NOT NULL REFERENCES public.lead_events(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  group_id UUID REFERENCES public.marketing_campaign_groups(id) ON DELETE SET NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'group', 'unmapped')),
  matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_campaign_attribution IS 'Links each lead event to its attributed campaign/group for CPL';

CREATE UNIQUE INDEX idx_lca_lead_event ON public.lead_campaign_attribution(lead_event_id);
CREATE INDEX idx_lca_brand_campaign ON public.lead_campaign_attribution(brand_id, campaign_id);
CREATE INDEX idx_lca_brand_group ON public.lead_campaign_attribution(brand_id, group_id);
CREATE INDEX idx_lca_match_type ON public.lead_campaign_attribution(brand_id, match_type);
CREATE INDEX idx_lca_matched_at ON public.lead_campaign_attribution(brand_id, matched_at);

ALTER TABLE public.lead_campaign_attribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand members can view attribution"
  ON public.lead_campaign_attribution FOR SELECT
  USING (has_marketing_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "System/admin can insert attribution"
  ON public.lead_campaign_attribution FOR INSERT
  WITH CHECK (has_marketing_write_access(get_user_id(auth.uid()), brand_id));

-- =====================================================
-- Resolver RPC — deterministic priority: exact > group > unmapped
-- =====================================================
CREATE OR REPLACE FUNCTION public.resolve_lead_campaign_attribution(
  p_lead_event_id UUID,
  p_brand_id UUID,
  p_source_name TEXT DEFAULT NULL,
  p_campaign_id UUID DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS TABLE(
  match_type TEXT,
  campaign_id UUID,
  group_id UUID
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group RECORD;
  v_rules JSONB;
  v_source_match BOOLEAN;
  v_tag_match BOOLEAN;
BEGIN
  -- Priority 1: Exact match via campaign_id
  IF p_campaign_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM marketing_campaigns mc
      WHERE mc.id = p_campaign_id AND mc.brand_id = p_brand_id
    ) THEN
      RETURN QUERY SELECT 'exact'::TEXT, p_campaign_id, NULL::UUID;
      RETURN;
    END IF;
  END IF;

  -- Priority 2: Group rules, ordered by priority DESC
  FOR v_group IN
    SELECT mcg.id AS gid, mcg.match_rules, mcg.campaign_ids
    FROM marketing_campaign_groups mcg
    WHERE mcg.brand_id = p_brand_id AND mcg.is_active = true
    ORDER BY mcg.priority DESC, mcg.created_at ASC
  LOOP
    v_rules := v_group.match_rules;
    v_source_match := FALSE;
    v_tag_match := FALSE;

    IF v_rules ? 'source_names' AND jsonb_array_length(v_rules->'source_names') > 0 THEN
      IF p_source_name IS NOT NULL AND p_source_name = ANY(
        SELECT jsonb_array_elements_text(v_rules->'source_names')
      ) THEN
        v_source_match := TRUE;
      END IF;
    ELSE
      v_source_match := TRUE;
    END IF;

    IF v_rules ? 'tags' AND jsonb_array_length(v_rules->'tags') > 0 THEN
      IF p_tags IS NOT NULL AND array_length(p_tags, 1) > 0 THEN
        IF p_tags && ARRAY(SELECT jsonb_array_elements_text(v_rules->'tags')) THEN
          v_tag_match := TRUE;
        END IF;
      END IF;
    ELSE
      v_tag_match := TRUE;
    END IF;

    IF v_source_match AND v_tag_match THEN
      RETURN QUERY SELECT
        'group'::TEXT,
        CASE WHEN array_length(v_group.campaign_ids, 1) > 0
             THEN v_group.campaign_ids[1]
             ELSE NULL::UUID
        END,
        v_group.gid;
      RETURN;
    END IF;
  END LOOP;

  -- Priority 3: Unmapped
  RETURN QUERY SELECT 'unmapped'::TEXT, NULL::UUID, NULL::UUID;
  RETURN;
END;
$$;

-- =====================================================
-- CPL Analytics RPC
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_cpl_analytics(
  p_brand_id UUID,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_group_by TEXT DEFAULT 'campaign'
)
RETURNS TABLE(
  entity_id UUID,
  entity_name TEXT,
  match_type TEXT,
  leads_count BIGINT,
  total_spend NUMERIC,
  cpl NUMERIC
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_group_by = 'group' THEN
    RETURN QUERY
    SELECT
      lca.group_id AS entity_id,
      COALESCE(mcg.name, 'Unmapped') AS entity_name,
      lca.match_type,
      COUNT(DISTINCT lca.lead_event_id) AS leads_count,
      COALESCE(SUM(mc_agg.spend), 0) AS total_spend,
      CASE WHEN COUNT(DISTINCT lca.lead_event_id) > 0
           THEN ROUND(COALESCE(SUM(mc_agg.spend), 0) / COUNT(DISTINCT lca.lead_event_id), 2)
           ELSE 0
      END AS cpl
    FROM lead_campaign_attribution lca
    LEFT JOIN marketing_campaign_groups mcg ON mcg.id = lca.group_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(mco.amount), 0) AS spend
      FROM marketing_costs mco
      WHERE mco.campaign_id = lca.campaign_id
        AND (p_from IS NULL OR mco.cost_date >= p_from::date)
        AND (p_to IS NULL OR mco.cost_date <= p_to::date)
    ) mc_agg ON true
    WHERE lca.brand_id = p_brand_id
      AND (p_from IS NULL OR lca.matched_at >= p_from)
      AND (p_to IS NULL OR lca.matched_at <= p_to)
    GROUP BY lca.group_id, mcg.name, lca.match_type
    ORDER BY leads_count DESC;
  ELSE
    RETURN QUERY
    SELECT
      lca.campaign_id AS entity_id,
      COALESCE(mcamp.name, 'Unmapped') AS entity_name,
      lca.match_type,
      COUNT(DISTINCT lca.lead_event_id) AS leads_count,
      COALESCE(mc_agg.spend, 0) AS total_spend,
      CASE WHEN COUNT(DISTINCT lca.lead_event_id) > 0
           THEN ROUND(COALESCE(mc_agg.spend, 0) / COUNT(DISTINCT lca.lead_event_id), 2)
           ELSE 0
      END AS cpl
    FROM lead_campaign_attribution lca
    LEFT JOIN marketing_campaigns mcamp ON mcamp.id = lca.campaign_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(mco.amount), 0) AS spend
      FROM marketing_costs mco
      WHERE mco.campaign_id = lca.campaign_id
        AND (p_from IS NULL OR mco.cost_date >= p_from::date)
        AND (p_to IS NULL OR mco.cost_date <= p_to::date)
    ) mc_agg ON true
    WHERE lca.brand_id = p_brand_id
      AND (p_from IS NULL OR lca.matched_at >= p_from)
      AND (p_to IS NULL OR lca.matched_at <= p_to)
    GROUP BY lca.campaign_id, mcamp.name, lca.match_type, mc_agg.spend
    ORDER BY leads_count DESC;
  END IF;
END;
$$;

-- =====================================================
-- Attribution Summary RPC
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_attribution_summary(
  p_brand_id UUID,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  total_leads BIGINT,
  exact_count BIGINT,
  group_count BIGINT,
  unmapped_count BIGINT,
  match_rate NUMERIC,
  overall_cpl NUMERIC
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_leads,
    COUNT(*) FILTER (WHERE lca.match_type = 'exact')::BIGINT,
    COUNT(*) FILTER (WHERE lca.match_type = 'group')::BIGINT,
    COUNT(*) FILTER (WHERE lca.match_type = 'unmapped')::BIGINT,
    CASE WHEN COUNT(*) > 0
         THEN ROUND(100.0 * COUNT(*) FILTER (WHERE lca.match_type != 'unmapped') / COUNT(*), 1)
         ELSE 0
    END,
    CASE WHEN COUNT(*) FILTER (WHERE lca.match_type != 'unmapped') > 0
         THEN ROUND(
           COALESCE((
             SELECT SUM(mco.amount)
             FROM marketing_costs mco
             WHERE mco.brand_id = p_brand_id
               AND (p_from IS NULL OR mco.cost_date >= p_from::date)
               AND (p_to IS NULL OR mco.cost_date <= p_to::date)
           ), 0) / COUNT(*) FILTER (WHERE lca.match_type != 'unmapped'), 2)
         ELSE 0
    END
  FROM lead_campaign_attribution lca
  WHERE lca.brand_id = p_brand_id
    AND (p_from IS NULL OR lca.matched_at >= p_from)
    AND (p_to IS NULL OR lca.matched_at <= p_to);
END;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_mcg_updated_at
  BEFORE UPDATE ON public.marketing_campaign_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
