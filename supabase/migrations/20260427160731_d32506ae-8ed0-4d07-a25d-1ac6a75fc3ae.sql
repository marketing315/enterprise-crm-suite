-- PII Redaction policy infrastructure

CREATE TABLE IF NOT EXISTS public.audit_pii_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_pattern text NOT NULL,
  strategy text NOT NULL CHECK (strategy IN ('full', 'partial', 'hash', 'none')),
  exempt_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_pattern)
);

ALTER TABLE public.audit_pii_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit admins can view pii policies"
ON public.audit_pii_policies FOR SELECT
TO authenticated
USING (public.is_audit_admin(auth.uid()));

CREATE POLICY "audit admins can manage pii policies"
ON public.audit_pii_policies FOR ALL
TO authenticated
USING (public.is_audit_admin(auth.uid()))
WITH CHECK (public.is_audit_admin(auth.uid()));

CREATE TRIGGER trg_audit_pii_policies_updated_at
BEFORE UPDATE ON public.audit_pii_policies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: returns effective PII rules for the calling user's roles
CREATE OR REPLACE FUNCTION public.get_audit_pii_policies_for_role()
RETURNS TABLE (
  field_pattern text,
  strategy text,
  description text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_user_id uuid;
  v_roles text[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- Audit viewers only (mirrors can_view_audit gate)
  IF NOT public.can_view_audit(v_uid) THEN
    RETURN;
  END IF;

  v_user_id := public.get_user_id(v_uid);

  SELECT array_agg(DISTINCT ur.role::text)
    INTO v_roles
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id;

  v_roles := COALESCE(v_roles, ARRAY[]::text[]);

  RETURN QUERY
  SELECT
    p.field_pattern,
    CASE
      WHEN v_roles && p.exempt_roles THEN 'none'
      ELSE p.strategy
    END AS strategy,
    p.description
  FROM public.audit_pii_policies p
  WHERE p.is_active = true
    AND (
      v_roles && p.exempt_roles
      OR p.strategy <> 'none'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_audit_pii_policies_for_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audit_pii_policies_for_role() TO authenticated;

-- Seed default PII policies
INSERT INTO public.audit_pii_policies (field_pattern, strategy, exempt_roles, description)
VALUES
  ('email', 'partial', ARRAY['admin','ceo'], 'Indirizzi email - parziale (j***@dom.com)'),
  ('phone', 'partial', ARRAY['admin','ceo','responsabile_callcenter'], 'Numeri telefono - ultime 4 cifre visibili'),
  ('tax_code', 'partial', ARRAY['admin','ceo','amministrazione'], 'Codice fiscale italiano'),
  ('codice_fiscale', 'partial', ARRAY['admin','ceo','amministrazione'], 'Codice fiscale italiano'),
  ('vat_number', 'partial', ARRAY['admin','ceo','amministrazione'], 'Partita IVA'),
  ('partita_iva', 'partial', ARRAY['admin','ceo','amministrazione'], 'Partita IVA'),
  ('address', 'partial', ARRAY['admin','ceo','responsabile_callcenter'], 'Indirizzi residenziali'),
  ('iban', 'full', ARRAY['admin','amministrazione'], 'Coordinate bancarie - sempre nascoste'),
  ('birth_date', 'partial', ARRAY['admin','ceo','amministrazione'], 'Data di nascita - solo anno visibile'),
  ('password', 'full', ARRAY[]::text[], 'Password - sempre nascoste a tutti'),
  ('token', 'full', ARRAY[]::text[], 'Token di accesso - sempre nascosti'),
  ('secret', 'full', ARRAY[]::text[], 'Secret keys - sempre nascosti'),
  ('api_key', 'full', ARRAY[]::text[], 'API keys - sempre nascoste')
ON CONFLICT (field_pattern) DO NOTHING;