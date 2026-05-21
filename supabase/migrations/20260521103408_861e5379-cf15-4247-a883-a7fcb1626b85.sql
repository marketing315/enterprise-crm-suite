-- =========================================================================
-- F0 — Fondamenta dimensione "Fonte" per Dashboard Performance
-- Spec: spec-dashboard-performance-2.md §3.1, §4.1
-- Decisioni: mem://features/dashboard-performance/decisions
-- Tutte le modifiche sono ADDITIVE (no drop/truncate, no required new fields)
-- =========================================================================

-- 1) tracking_numbers — registry numeri telefonici nominati ---------------
CREATE TABLE IF NOT EXISTS public.tracking_numbers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL,
  phone_e164    text NOT NULL,
  label         text NOT NULL,
  number_type   text NOT NULL DEFAULT 'tollfree'
                CHECK (number_type IN ('tollfree','mobile','landline','virtual')),
  direction     text NOT NULL DEFAULT 'both'
                CHECK (direction IN ('inbound','outbound','both')),
  channel_id    uuid REFERENCES public.marketing_channels(id) ON DELETE SET NULL,
  campaign_id   uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  broadcaster   text,
  voispeed_did  text,
  default_operator_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tracking_numbers_brand_e164
  ON public.tracking_numbers (brand_id, phone_e164);
CREATE INDEX IF NOT EXISTS ix_tracking_numbers_brand_active
  ON public.tracking_numbers (brand_id, is_active);
CREATE INDEX IF NOT EXISTS ix_tracking_numbers_channel
  ON public.tracking_numbers (channel_id);
CREATE INDEX IF NOT EXISTS ix_tracking_numbers_campaign
  ON public.tracking_numbers (campaign_id);

-- Updated_at trigger (riusa la funzione standard del progetto se esiste)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='update_updated_at_column' AND pronamespace='public'::regnamespace) THEN
    DROP TRIGGER IF EXISTS trg_tracking_numbers_updated_at ON public.tracking_numbers;
    CREATE TRIGGER trg_tracking_numbers_updated_at
      BEFORE UPDATE ON public.tracking_numbers
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.tracking_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance roles can view tracking numbers" ON public.tracking_numbers;
CREATE POLICY "Finance roles can view tracking numbers"
  ON public.tracking_numbers FOR SELECT
  USING (public.has_finance_access(public.get_user_id(auth.uid()), brand_id));

DROP POLICY IF EXISTS "Finance roles can insert tracking numbers" ON public.tracking_numbers;
CREATE POLICY "Finance roles can insert tracking numbers"
  ON public.tracking_numbers FOR INSERT
  WITH CHECK (public.has_finance_access(public.get_user_id(auth.uid()), brand_id));

DROP POLICY IF EXISTS "Finance roles can update tracking numbers" ON public.tracking_numbers;
CREATE POLICY "Finance roles can update tracking numbers"
  ON public.tracking_numbers FOR UPDATE
  USING (public.has_finance_access(public.get_user_id(auth.uid()), brand_id));

DROP POLICY IF EXISTS "Finance roles can delete tracking numbers" ON public.tracking_numbers;
CREATE POLICY "Finance roles can delete tracking numbers"
  ON public.tracking_numbers FOR DELETE
  USING (public.has_finance_access(public.get_user_id(auth.uid()), brand_id));

COMMENT ON TABLE public.tracking_numbers IS
  'F0: Registry numeri telefonici nominati (numeri verdi TV, cellulari) con mapping a canale/campagna/operatore. Spec §4.1.1';

-- 2) marketing_campaign_groups — generalizza per TV/web -------------------
ALTER TABLE public.marketing_campaign_groups
  ADD COLUMN IF NOT EXISTS group_kind text NOT NULL DEFAULT 'campaign',
  ADD COLUMN IF NOT EXISTS channel_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tracking_number_ids uuid[] NOT NULL DEFAULT '{}';

-- Vincolo group_kind: NOT VALID per evitare blocco su righe legacy (qui non
-- possibile perché tutte default a 'campaign', ma manteniamo convenzione)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='marketing_campaign_groups_group_kind_check'
  ) THEN
    ALTER TABLE public.marketing_campaign_groups
      ADD CONSTRAINT marketing_campaign_groups_group_kind_check
      CHECK (group_kind IN ('campaign','tv','web','mixed'));
  END IF;
END $$;

-- 3) lead_campaign_attribution — estensioni per phone/webhook -------------
ALTER TABLE public.lead_campaign_attribution
  ADD COLUMN IF NOT EXISTS tracking_number_id uuid REFERENCES public.tracking_numbers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.marketing_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_category text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='lead_campaign_attribution_source_category_check'
  ) THEN
    ALTER TABLE public.lead_campaign_attribution
      ADD CONSTRAINT lead_campaign_attribution_source_category_check
      CHECK (source_category IS NULL OR source_category IN
        ('tv','web','google','meta','organic','referral','other'));
  END IF;
END $$;

-- Estendiamo i valori accettati di match_type SENZA toccare righe esistenti.
-- Approccio: drop check esistente (se c'è) e ricreazione allargata.
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid='public.lead_campaign_attribution'::regclass
    AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%match_type%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.lead_campaign_attribution DROP CONSTRAINT %I', v_conname);
  END IF;
  ALTER TABLE public.lead_campaign_attribution
    ADD CONSTRAINT lead_campaign_attribution_match_type_check
    CHECK (match_type IN ('exact','group','unmapped','phone','webhook','manual','utm'));
END $$;

CREATE INDEX IF NOT EXISTS ix_lca_tracking_number
  ON public.lead_campaign_attribution (tracking_number_id);
CREATE INDEX IF NOT EXISTS ix_lca_channel
  ON public.lead_campaign_attribution (channel_id);
CREATE INDEX IF NOT EXISTS ix_lca_brand_matched
  ON public.lead_campaign_attribution (brand_id, matched_at);

-- 4) webhook_sources — attribuzione integrata -----------------------------
ALTER TABLE public.webhook_sources
  ADD COLUMN IF NOT EXISTS attributed_campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attributed_channel_id uuid REFERENCES public.marketing_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_mode text NOT NULL DEFAULT 'none';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='webhook_sources_attribution_mode_check'
  ) THEN
    ALTER TABLE public.webhook_sources
      ADD CONSTRAINT webhook_sources_attribution_mode_check
      CHECK (attribution_mode IN ('campaign','organic','none'));
  END IF;
END $$;

-- 5) marketing_costs — granularità TV per emittente + cost_kind -----------
ALTER TABLE public.marketing_costs
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.marketing_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tracking_number_id uuid REFERENCES public.tracking_numbers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS cost_kind text NOT NULL DEFAULT 'media';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='marketing_costs_cost_kind_check'
  ) THEN
    ALTER TABLE public.marketing_costs
      ADD CONSTRAINT marketing_costs_cost_kind_check
      CHECK (cost_kind IN ('media','production','agency','other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_marketing_costs_brand_date
  ON public.marketing_costs (brand_id, cost_date);
CREATE INDEX IF NOT EXISTS ix_marketing_costs_channel
  ON public.marketing_costs (channel_id);
CREATE INDEX IF NOT EXISTS ix_marketing_costs_tracking_number
  ON public.marketing_costs (tracking_number_id);
CREATE INDEX IF NOT EXISTS ix_marketing_costs_import_batch
  ON public.marketing_costs (import_batch_id);

COMMENT ON COLUMN public.marketing_costs.cost_kind IS
  'F0: tipologia costo (media spazio/produzione/agenzia/altro). Spec §4.1.3';
COMMENT ON COLUMN public.marketing_costs.tracking_number_id IS
  'F0: link al numero verde/cellulare per costi TV per emittente. Spec §4.1.3';