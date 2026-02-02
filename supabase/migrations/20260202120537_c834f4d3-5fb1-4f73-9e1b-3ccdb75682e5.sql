-- MK-SEC-1: Funzione has_marketing_access (CORRETTA)
-- Accesso: admin, ceo, amministrazione, responsabili (lettura)
CREATE OR REPLACE FUNCTION has_marketing_access(p_user_id uuid, p_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Ruoli globali (admin/ceo vedono tutto)
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = p_user_id
        AND is_active = true
        AND role::text IN ('admin', 'ceo')
    )
    OR
    -- Ruoli per brand specifico
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = p_user_id
        AND brand_id = p_brand_id
        AND is_active = true
        AND role::text IN (
          'admin', 'ceo', 'amministrazione',
          'responsabile_venditori', 'responsabile_callcenter'
        )
    );
$$;

-- MK-SEC-2: Funzione has_marketing_write_access
-- Scrittura campagne/canali: solo admin, ceo
CREATE OR REPLACE FUNCTION has_marketing_write_access(p_user_id uuid, p_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = p_user_id
        AND is_active = true
        AND role::text IN ('admin', 'ceo')
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = p_user_id
        AND brand_id = p_brand_id
        AND is_active = true
        AND role::text IN ('admin', 'ceo')
    );
$$;

-- RLS Policies: marketing_channels
CREATE POLICY "Marketing roles can view channels"
  ON marketing_channels FOR SELECT
  USING (has_marketing_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admin/CEO can insert channels"
  ON marketing_channels FOR INSERT
  WITH CHECK (has_marketing_write_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admin/CEO can update channels"
  ON marketing_channels FOR UPDATE
  USING (has_marketing_write_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admin/CEO can delete channels"
  ON marketing_channels FOR DELETE
  USING (has_marketing_write_access(get_user_id(auth.uid()), brand_id));

-- RLS Policies: marketing_campaigns
CREATE POLICY "Marketing roles can view campaigns"
  ON marketing_campaigns FOR SELECT
  USING (has_marketing_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admin/CEO can insert campaigns"
  ON marketing_campaigns FOR INSERT
  WITH CHECK (has_marketing_write_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admin/CEO can update campaigns"
  ON marketing_campaigns FOR UPDATE
  USING (has_marketing_write_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admin/CEO can delete campaigns"
  ON marketing_campaigns FOR DELETE
  USING (has_marketing_write_access(get_user_id(auth.uid()), brand_id));

-- RLS Policies: marketing_costs
-- Riuso has_finance_access esistente (già include amministrazione)
CREATE POLICY "Finance roles can view marketing costs"
  ON marketing_costs FOR SELECT
  USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can insert marketing costs"
  ON marketing_costs FOR INSERT
  WITH CHECK (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can update marketing costs"
  ON marketing_costs FOR UPDATE
  USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Finance roles can delete marketing costs"
  ON marketing_costs FOR DELETE
  USING (has_finance_access(get_user_id(auth.uid()), brand_id));