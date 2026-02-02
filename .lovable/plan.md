
# Piano Finale Marketing — Correzioni Applicate

## Verifica Codebase Completata

### Dati Estratti dal Database

| Elemento | Valore Confermato |
|----------|-------------------|
| **Enum `app_role`** | admin, ceo, amministrazione, responsabile_venditori, responsabile_callcenter, venditore, operatore_callcenter, callcenter, sales |
| **Nome canonico call center** | `responsabile_callcenter` (senza underscore tra "call" e "center") |
| **Tabella `users`** | `public.users` con FK a `auth.users` via `supabase_auth_id` |
| **user_roles.is_active** | Colonna presente (boolean, default true) |
| **Funzione `has_finance_access`** | Presente, include `amministrazione` |
| **Trigger `set_updated_at`** | Presente e riutilizzabile |
| **Brand Sistema** | "Azienda Intera", ID `00000000-0000-0000-0000-000000000000`, `is_system = true` |

---

## Fix Applicati al Piano

### FIX 1: Nome Ruolo Call Center
- Usare **sempre** `responsabile_callcenter` (confermato dall'enum)

### FIX 2: Enum per Campaign Status
```sql
CREATE TYPE marketing_campaign_status AS ENUM ('planned', 'active', 'paused', 'closed');
```

### FIX 3: Trigger updated_at
Riutilizzo della funzione esistente `set_updated_at()`

### FIX 4: FK Utenti
FK verso `public.users(id)` (non auth.users)

### FIX 5: RLS Funzioni Corrette
Logica corretta che separa controllo globale da controllo per brand, includendo `is_active = true`

### FIX 6: has_finance_access già presente
Verificato: include `amministrazione`, quindi può essere riusata per marketing_costs

### FIX 7: RPC ritorna TABLE
Implementazione con `RETURNS TABLE` invece di `jsonb`

### FIX 8: Attribution
Source of truth = `deals.marketing_campaign_id`

### FIX 9: Brand Sistema
Usare costante `COMPANY_BRAND_ID = '00000000-0000-0000-0000-000000000000'`

---

## Migrazione 1: Tabelle Marketing + Enum

```sql
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
```

---

## Migrazione 2: Helper Functions + RLS Policies

```sql
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
```

---

## Migrazione 3: RPC KPI Marketing

```sql
-- MK-DB-5: KPI per campagna (RETURNS TABLE)
CREATE OR REPLACE FUNCTION get_marketing_campaign_kpis(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_channel_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE (
  campaign_id uuid,
  campaign_name text,
  channel_name text,
  leads_count bigint,
  deals_count bigint,
  deals_won bigint,
  revenue numeric,
  marketing_cost numeric,
  cpl numeric,
  cac numeric,
  roi numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_company_brand boolean;
  v_company_brand_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- Verifica accesso
  IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_is_company_brand := (p_brand_id = v_company_brand_id);

  RETURN QUERY
  WITH campaign_costs AS (
    SELECT 
      mc.campaign_id,
      COALESCE(SUM(mc.amount), 0) as total_cost
    FROM marketing_costs mc
    WHERE mc.cost_date >= p_from AND mc.cost_date <= p_to
      AND (v_is_company_brand OR mc.brand_id = p_brand_id)
      AND (p_campaign_id IS NULL OR mc.campaign_id = p_campaign_id)
    GROUP BY mc.campaign_id
  ),
  campaign_deals AS (
    SELECT 
      d.marketing_campaign_id,
      COUNT(*) as deals_total,
      COUNT(*) FILTER (WHERE d.status = 'won') as deals_won_count,
      COALESCE(SUM(d.value) FILTER (WHERE d.status = 'won'), 0) as total_revenue
    FROM deals d
    WHERE d.created_at >= p_from::timestamptz AND d.created_at <= (p_to + 1)::timestamptz
      AND d.marketing_campaign_id IS NOT NULL
      AND (v_is_company_brand OR d.brand_id = p_brand_id)
      AND (p_campaign_id IS NULL OR d.marketing_campaign_id = p_campaign_id)
    GROUP BY d.marketing_campaign_id
  ),
  campaign_leads AS (
    -- Conta lead via source_name matching con campaign external_id o name
    SELECT 
      mcp.id as campaign_id,
      COUNT(DISTINCT le.id) as leads_total
    FROM marketing_campaigns mcp
    LEFT JOIN lead_events le ON (
      le.source_name ILIKE '%' || mcp.external_id || '%'
      OR le.source_name ILIKE '%' || mcp.name || '%'
    )
    WHERE le.received_at >= p_from::timestamptz AND le.received_at <= (p_to + 1)::timestamptz
      AND (v_is_company_brand OR mcp.brand_id = p_brand_id)
      AND (p_channel_id IS NULL OR mcp.channel_id = p_channel_id)
      AND (p_campaign_id IS NULL OR mcp.id = p_campaign_id)
    GROUP BY mcp.id
  )
  SELECT 
    mcp.id as campaign_id,
    mcp.name as campaign_name,
    COALESCE(ch.name, 'Non specificato') as channel_name,
    COALESCE(cl.leads_total, 0)::bigint as leads_count,
    COALESCE(cd.deals_total, 0)::bigint as deals_count,
    COALESCE(cd.deals_won_count, 0)::bigint as deals_won,
    COALESCE(cd.total_revenue, 0)::numeric as revenue,
    COALESCE(cc.total_cost, 0)::numeric as marketing_cost,
    -- CPL = cost / leads (0 se no leads)
    CASE WHEN COALESCE(cl.leads_total, 0) > 0 
      THEN ROUND(COALESCE(cc.total_cost, 0) / cl.leads_total, 2)
      ELSE 0 
    END as cpl,
    -- CAC = cost / deals_won (0 se no deals vinti)
    CASE WHEN COALESCE(cd.deals_won_count, 0) > 0 
      THEN ROUND(COALESCE(cc.total_cost, 0) / cd.deals_won_count, 2)
      ELSE 0 
    END as cac,
    -- ROI = (revenue - cost) / cost (0 se no costi)
    CASE WHEN COALESCE(cc.total_cost, 0) > 0 
      THEN ROUND((COALESCE(cd.total_revenue, 0) - COALESCE(cc.total_cost, 0)) / cc.total_cost * 100, 2)
      ELSE 0 
    END as roi
  FROM marketing_campaigns mcp
  LEFT JOIN marketing_channels ch ON ch.id = mcp.channel_id
  LEFT JOIN campaign_costs cc ON cc.campaign_id = mcp.id
  LEFT JOIN campaign_deals cd ON cd.marketing_campaign_id = mcp.id
  LEFT JOIN campaign_leads cl ON cl.campaign_id = mcp.id
  WHERE (v_is_company_brand OR mcp.brand_id = p_brand_id)
    AND (p_channel_id IS NULL OR mcp.channel_id = p_channel_id)
    AND (p_campaign_id IS NULL OR mcp.id = p_campaign_id)
  ORDER BY COALESCE(cd.total_revenue, 0) DESC;
END;
$$;

-- MK-DB-6: KPI aggregati per canale
CREATE OR REPLACE FUNCTION get_marketing_channel_kpis(
  p_brand_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  channel_id uuid,
  channel_name text,
  channel_type text,
  campaigns_count bigint,
  leads_count bigint,
  deals_won bigint,
  revenue numeric,
  marketing_cost numeric,
  avg_roi numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_company_brand boolean;
  v_company_brand_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_is_company_brand := (p_brand_id = v_company_brand_id);

  RETURN QUERY
  SELECT 
    ch.id as channel_id,
    ch.name as channel_name,
    ch.type as channel_type,
    COUNT(DISTINCT mcp.id)::bigint as campaigns_count,
    0::bigint as leads_count, -- Placeholder, requires join logic
    COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'won')::bigint as deals_won,
    COALESCE(SUM(d.value) FILTER (WHERE d.status = 'won'), 0)::numeric as revenue,
    COALESCE(SUM(mc.amount), 0)::numeric as marketing_cost,
    CASE WHEN COALESCE(SUM(mc.amount), 0) > 0 
      THEN ROUND((COALESCE(SUM(d.value) FILTER (WHERE d.status = 'won'), 0) - COALESCE(SUM(mc.amount), 0)) / SUM(mc.amount) * 100, 2)
      ELSE 0 
    END as avg_roi
  FROM marketing_channels ch
  LEFT JOIN marketing_campaigns mcp ON mcp.channel_id = ch.id
    AND (v_is_company_brand OR mcp.brand_id = p_brand_id)
  LEFT JOIN deals d ON d.marketing_campaign_id = mcp.id
    AND d.created_at >= p_from::timestamptz AND d.created_at <= (p_to + 1)::timestamptz
  LEFT JOIN marketing_costs mc ON mc.campaign_id = mcp.id
    AND mc.cost_date >= p_from AND mc.cost_date <= p_to
  WHERE (v_is_company_brand OR ch.brand_id = p_brand_id)
    AND ch.is_active = true
  GROUP BY ch.id, ch.name, ch.type
  ORDER BY revenue DESC;
END;
$$;
```

---

## Frontend: Nuovi File

### src/types/marketing.ts
Tipi TypeScript per Marketing

### src/hooks/useMarketingAccess.ts
Hook per controllo permessi marketing

### src/hooks/useMarketingChannels.ts
CRUD canali marketing

### src/hooks/useMarketingCampaigns.ts
CRUD campagne con filtri

### src/hooks/useMarketingCosts.ts
CRUD costi marketing

### src/hooks/useMarketingKpis.ts
Chiamate RPC per KPI

### src/pages/marketing/MarketingDashboard.tsx
Dashboard con KPI cards e grafici

### src/pages/marketing/MarketingCampaigns.tsx
Gestione campagne con tabella e drawer

### src/pages/marketing/MarketingCosts.tsx
Inserimento/modifica costi

### src/pages/marketing/MarketingReports.tsx
Report e export CSV

### src/components/marketing/CampaignFormDrawer.tsx
Form creazione/modifica campagna

### src/components/marketing/CostFormDrawer.tsx
Form inserimento costo

### src/components/marketing/ChannelSelect.tsx
Select per canali

### src/components/marketing/CampaignStatusBadge.tsx
Badge status campagna

### src/components/marketing/MarketingKpiCards.tsx
Card KPI riutilizzabili

---

## File Esistenti da Modificare

| File | Modifica |
|------|----------|
| `src/App.tsx` | Aggiungere routes `/marketing/*` |
| `src/components/layout/MainLayout.tsx` | Voce menu "Marketing" con controllo permessi |
| `src/components/pipeline/KanbanCard.tsx` | Badge campagna marketing se `deal.marketing_campaign_id` |
| `src/hooks/usePipeline.ts` | Estendere query deals per includere `marketing_campaigns` join |
| `src/types/database.ts` | Aggiungere `MarketingCampaignStatus` type |

---

## Ordine di Esecuzione

| Step | Task | Tempo Stimato |
|------|------|---------------|
| 1 | Migrazione 1: Tabelle + Enum | 15 min |
| 2 | Migrazione 2: Helper + RLS | 15 min |
| 3 | Migrazione 3: RPC KPI | 30 min |
| 4 | Types + Hooks base | 45 min |
| 5 | MarketingDashboard | 1.5 ore |
| 6 | MarketingCampaigns + CampaignFormDrawer | 1.5 ore |
| 7 | MarketingCosts + CostFormDrawer | 1 ora |
| 8 | MarketingReports | 45 min |
| 9 | Badge Pipeline + Menu | 30 min |
| 10 | Test E2E | 1 ora |
| **Totale** | | **~8 ore** |

---

## Acceptance Criteria

- [ ] Enum `app_role` NON modificato (tutti i ruoli già presenti)
- [ ] Tabelle marketing create con RLS attivo
- [ ] `has_marketing_access` e `has_marketing_write_access` funzionano correttamente
- [ ] Admin/CEO possono creare/modificare campagne e canali
- [ ] Amministrazione può vedere tutto e inserire costi (ma NON campagne)
- [ ] Responsabili possono vedere dashboard e report (read-only)
- [ ] KPI calcolati: CPL, CAC, ROI corretti
- [ ] Funziona per brand singolo e "Azienda Intera" (`00000000-0000-0000-0000-000000000000`)
- [ ] Badge campagna visibile su KanbanCard
- [ ] Attribution basata su `deals.marketing_campaign_id` (source of truth)
