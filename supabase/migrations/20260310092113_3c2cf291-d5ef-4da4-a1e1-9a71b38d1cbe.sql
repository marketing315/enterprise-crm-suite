
-- Security reviews tracking
CREATE TABLE public.security_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  quarter text NOT NULL,          -- e.g. 'Q1-2026'
  review_type text NOT NULL DEFAULT 'quarterly',  -- 'quarterly' | 'ad_hoc'
  status text NOT NULL DEFAULT 'planned', -- 'planned' | 'in_progress' | 'completed' | 'signed_off'
  started_at timestamptz,
  completed_at timestamptz,
  signed_off_at timestamptz,
  signed_off_by uuid REFERENCES public.users(id),
  lead_user_id uuid REFERENCES public.users(id),
  summary text,
  total_findings int DEFAULT 0,
  critical_findings int DEFAULT 0,
  high_findings int DEFAULT 0,
  medium_findings int DEFAULT 0,
  low_findings int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view security reviews for their brand"
  ON public.security_reviews FOR SELECT TO authenticated
  USING (public.user_belongs_to_brand(auth.uid(), brand_id));

CREATE POLICY "Admins can manage security reviews"
  ON public.security_reviews FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Security findings
CREATE TABLE public.security_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.security_reviews(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'medium',  -- 'critical' | 'high' | 'medium' | 'low'
  area text NOT NULL,               -- e.g. 'RLS', 'RBAC', 'Edge Auth', etc.
  checklist_ref text,               -- e.g. 'R1', 'R5'
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',  -- 'open' | 'in_progress' | 'remediated' | 'accepted_risk'
  owner_user_id uuid REFERENCES public.users(id),
  remediation_pr text,
  remediated_at timestamptz,
  sla_deadline timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view findings for their brand"
  ON public.security_findings FOR SELECT TO authenticated
  USING (public.user_belongs_to_brand(auth.uid(), brand_id));

CREATE POLICY "Admins can manage findings"
  ON public.security_findings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Incident drills
CREATE TABLE public.incident_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  quarter text NOT NULL,
  scenario_id text NOT NULL,        -- e.g. 'D1', 'D2'
  scenario_name text NOT NULL,
  drill_type text NOT NULL DEFAULT 'reliability',  -- 'security' | 'reliability'
  status text NOT NULL DEFAULT 'planned',  -- 'planned' | 'in_progress' | 'completed'
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  facilitator_user_id uuid REFERENCES public.users(id),
  ttd_minutes int,                  -- time to detect
  ttm_minutes int,                  -- time to mitigate
  escalation_correct boolean,
  runbook_compliance_pct int,       -- 0-100
  debrief_notes text,
  action_items jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incident_drills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view drills for their brand"
  ON public.incident_drills FOR SELECT TO authenticated
  USING (public.user_belongs_to_brand(auth.uid(), brand_id));

CREATE POLICY "Admins can manage drills"
  ON public.incident_drills FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_security_reviews_brand_quarter ON public.security_reviews(brand_id, quarter);
CREATE INDEX idx_security_findings_review ON public.security_findings(review_id);
CREATE INDEX idx_security_findings_status ON public.security_findings(status);
CREATE INDEX idx_incident_drills_brand_quarter ON public.incident_drills(brand_id, quarter);
