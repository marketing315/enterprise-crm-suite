-- ============================================================
-- Sprint 1 — Sicurezza, RLS, integrità dati
-- ============================================================

-- ───────────────────────────────────────────────
-- 1) SEC-001/002: user_roles management scoped per brand
-- ───────────────────────────────────────────────
-- Sostituisce la vecchia policy "Admins can manage roles" che permetteva
-- a qualsiasi admin di toccare ruoli di QUALSIASI brand.
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Solo admin del brand specifico (o admin di sistema) può gestire user_roles per quel brand.
CREATE POLICY "user_roles_admin_manage_scoped"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role_for_brand(get_user_id(auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
)
WITH CHECK (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role_for_brand(get_user_id(auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- ───────────────────────────────────────────────
-- 2) LE-001: soft-delete su contacts (additivo, niente DROP)
-- ───────────────────────────────────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE INDEX IF NOT EXISTS idx_contacts_archived_at
  ON public.contacts (brand_id) WHERE archived_at IS NULL;

-- Aggiorno SELECT policies per escludere anche archiviati (oltre a mergiati).
-- Admin di brand / CEO continuano a vedere tutto.
DROP POLICY IF EXISTS "Users can view contacts in their brands" ON public.contacts;
CREATE POLICY "Users can view contacts in their brands"
ON public.contacts
FOR SELECT
TO authenticated
USING (
  user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
  AND (
    (merged_into_contact_id IS NULL AND archived_at IS NULL)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  )
);

DROP POLICY IF EXISTS "Users can view contacts via brand hierarchy" ON public.contacts;
CREATE POLICY "Users can view contacts via brand hierarchy"
ON public.contacts
FOR SELECT
TO authenticated
USING (
  user_can_access_brand(auth.uid(), brand_id)
  AND (
    (merged_into_contact_id IS NULL AND archived_at IS NULL)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  )
);

-- Blocco UPDATE/DELETE su contatti già archiviati (solo admin/CEO override).
DROP POLICY IF EXISTS "Users can update contacts in their brands" ON public.contacts;
CREATE POLICY "Users can update contacts in their brands"
ON public.contacts
FOR UPDATE
TO authenticated
USING (
  user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
  AND (
    archived_at IS NULL
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  )
);

DROP POLICY IF EXISTS "Users can delete contacts in their brands" ON public.contacts;
CREATE POLICY "Users can delete contacts in their brands"
ON public.contacts
FOR DELETE
TO authenticated
USING (
  -- hard delete consentito solo a admin del brand o CEO
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- RPC helper: soft-delete contact (usato dal client al posto di DELETE).
CREATE OR REPLACE FUNCTION public.archive_contact(
  p_contact_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
BEGIN
  v_user_id := get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT brand_id INTO v_brand_id FROM public.contacts WHERE id = p_contact_id;
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Contact not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT user_belongs_to_brand(v_user_id, v_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: contact not in your brand scope' USING ERRCODE = '42501';
  END IF;

  UPDATE public.contacts
     SET archived_at = COALESCE(archived_at, now()),
         archived_by = v_user_id,
         archive_reason = COALESCE(p_reason, archive_reason)
   WHERE id = p_contact_id
     AND archived_at IS NULL;

  -- Audit append-only via centralized logger
  PERFORM log_audit_event(
    v_brand_id,
    'contact',
    p_contact_id,
    'soft_delete',
    'user',
    'archive_contact_rpc',
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_contact(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_contact(uuid, text) TO authenticated;
