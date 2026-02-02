-- MK-DB-1: Enum per status campagne
CREATE TYPE marketing_campaign_status AS ENUM ('planned', 'active', 'paused', 'closed');

-- MK-DB-2: Tabella marketing_channels
CREATE TABLE public.marketing_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('paid', 'organic', 'offline')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_channels_brand ON marketing_channels(brand_id, is_active);

-- MK-DB-3: Tabella marketing_campaigns
CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES marketing_channels(id) ON DELETE SET NULL,
  name text NOT NULL,
  external_id text,
  start_date date NOT NULL,
  end_date date,
  planned_budget numeric(12,2),
  status marketing_campaign_status NOT NULL DEFAULT 'planned',
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_campaigns_brand_channel ON marketing_campaigns(brand_id, channel_id, start_date DESC);
CREATE INDEX idx_marketing_campaigns_status ON marketing_campaigns(brand_id, status) WHERE status IN ('active', 'planned');

-- Trigger per updated_at (riuso funzione esistente)
CREATE TRIGGER set_marketing_campaigns_updated_at
  BEFORE UPDATE ON marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- MK-DB-4: Tabella marketing_costs
CREATE TABLE public.marketing_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  cost_date date NOT NULL,
  source text,
  notes text,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_costs_brand_campaign ON marketing_costs(brand_id, campaign_id, cost_date DESC);
CREATE INDEX idx_marketing_costs_date ON marketing_costs(brand_id, cost_date DESC);

-- MK-DB-5: Colonna marketing_campaign_id su deals
ALTER TABLE deals
ADD COLUMN marketing_campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL;

CREATE INDEX idx_deals_marketing_campaign ON deals(marketing_campaign_id) WHERE marketing_campaign_id IS NOT NULL;

-- Enable RLS
ALTER TABLE marketing_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_costs ENABLE ROW LEVEL SECURITY;