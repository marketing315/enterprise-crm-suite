
# M13 - Controllo di Gestione & Intelligenza Decisionale

## Panoramica

Implementazione del modulo strategico M13 con le tre migliorie richieste:
1. **Confidence Level** per KPI stimati
2. **Alert Spiegabili** con root causes e azioni suggerite  
3. **Budget come baseline** separato concettualmente dai costi storici

---

## Architettura Esistente

Ho analizzato il codice e confermo:

- **RPC `get_admin_finance_kpis`**: calcola total_expenses, sales_total, margin, expenses_by_category, budget_by_category
- **Tabelle attuali**:
  - `expenses`: amount, category_id, vendor_name, expense_date, description, notes
  - `expense_categories`: name, is_active (schema semplice)
  - `budgets`: period_month, planned_amount, category_id
- **Accesso**: via `has_finance_access()` per admin/ceo/amministrazione
- **System Brand**: `00000000-...` per aggregazione cross-brand
- **Modulo Company**: `/azienda` con Overview, Costi, Budget, Report

---

## Fase 1: Database Migration

### 1.1 Nuova tabella `cost_centers`

```sql
CREATE TABLE cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 1.2 Nuova tabella `brand_tax_settings`

```sql
CREATE TABLE brand_tax_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE UNIQUE,
  corporate_tax_rate numeric(5,2) NOT NULL DEFAULT 24.0,
  regional_tax_rate numeric(5,2) NOT NULL DEFAULT 3.9,
  vat_rate_default numeric(5,2) NOT NULL DEFAULT 22.0,
  fiscal_year_start integer NOT NULL DEFAULT 1 CHECK (fiscal_year_start BETWEEN 1 AND 12),
  notes text,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### 1.3 Estensione `expense_categories`

```sql
ALTER TABLE expense_categories
  ADD COLUMN parent_id uuid REFERENCES expense_categories(id),
  ADD COLUMN category_type text DEFAULT 'direct' 
    CHECK (category_type IN ('direct','indirect','personnel','marketing','overhead')),
  ADD COLUMN is_deductible boolean NOT NULL DEFAULT true;
```

### 1.4 Estensione `expenses`

```sql
ALTER TABLE expenses
  ADD COLUMN cost_center_id uuid REFERENCES cost_centers(id),
  ADD COLUMN periodicity text DEFAULT 'one_off' 
    CHECK (periodicity IN ('one_off','monthly','quarterly','yearly')),
  ADD COLUMN recurring_until date,
  ADD COLUMN is_deductible boolean,
  ADD COLUMN tax_rate numeric(5,2),
  ADD COLUMN gross_amount numeric(12,2);
```

### 1.5 RLS Policies

```sql
-- cost_centers
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can view cost centers"
  ON cost_centers FOR SELECT
  USING (has_finance_access(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admin/CEO can manage cost centers"
  ON cost_centers FOR ALL
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo')
  );

-- brand_tax_settings
ALTER TABLE brand_tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/CEO can view tax settings"
  ON brand_tax_settings FOR SELECT
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo')
  );

CREATE POLICY "Admin/CEO can manage tax settings"
  ON brand_tax_settings FOR ALL
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo')
  );
```

---

## Fase 2: RPC `get_ceo_dashboard_kpis`

### Output Struttura

```text
{
  // === FATTURATO ===
  revenue_total: number,
  revenue_from_won_deals: number,
  
  // === COSTI STRUTTURATI ===
  costs_total: number,
  costs_direct: number,
  costs_indirect: number,
  costs_personnel: number,
  costs_marketing: number,
  costs_by_center: [{center_name, amount}],
  costs_by_category: [{category_name, type, amount}],
  
  // === MARGINALITA ===
  gross_margin: number,
  operating_margin: number,
  gross_margin_percent: number,
  
  // === TASSE STIMATE ===
  tax_settings: {corporate_rate, regional_rate, vat_rate},
  estimated_vat_payable: number,
  estimated_corporate_tax: number,
  estimated_net_profit: number,
  
  // === COMPARATIVI ===
  prev_period_revenue: number,
  prev_period_costs: number,
  revenue_change_percent: number,
  costs_change_percent: number,
  
  // === MARKETING ROI ===
  marketing_spend: number,
  marketing_roi: number,
  
  // === CONFIDENCE LEVELS ===
  confidence: {
    overall: number,
    estimated_net_profit: number,
    marketing_roi: number,
    factors: [{factor, contribution, value, detail}]
  },
  
  // === ALERT SPIEGABILI ===
  alerts: [{
    type, severity, message, 
    root_causes[], suggested_action,
    metric_value, threshold_value
  }],
  
  // === BUDGET BASELINE ===
  budget_baseline: {
    total_planned: number,
    total_spent: number,
    variance: number,
    variance_percent: number,
    categories_over_budget: [{category_name, planned, actual, overage}],
    remaining_allocable: number
  }
}
```

### Calcolo Confidence Level

```sql
-- Formula ponderata
v_recurring_ratio := (SELECT COUNT(*) FROM expenses 
  WHERE periodicity != 'one_off' AND ...) / NULLIF(total_expenses_count, 0);

v_confirmed_sales_ratio := (SELECT COUNT(*) FROM deals 
  WHERE status = 'won' AND value IS NOT NULL) / NULLIF(total_won_deals, 0);

v_period_coverage := (SELECT COUNT(DISTINCT expense_date) FROM expenses ...) 
  / GREATEST(1, p_to - p_from);

v_confidence := (
  COALESCE(v_recurring_ratio, 0) * 0.30 +
  COALESCE(v_confirmed_sales_ratio, 1) * 0.30 +
  COALESCE(v_period_coverage, 0) * 0.20 +
  0.80 * 0.20  -- historical_accuracy placeholder
);
```

### Generazione Alert Spiegabili

```sql
-- MARGIN_DECLINING: margine < media 3m - 10%
IF v_margin_change < -10 THEN
  v_root_causes := ARRAY(
    SELECT format('%s: %+.1f%%', category_type, pct_change)
    FROM cost_category_changes 
    WHERE ABS(pct_change) > 5
    ORDER BY ABS(pct_change) DESC
    LIMIT 3
  );
  
  v_alerts := v_alerts || jsonb_build_object(
    'type', 'MARGIN_DECLINING',
    'severity', 'warning',
    'message', format('Margine in calo del %.1f%% rispetto alla media trimestrale', ABS(v_margin_change)),
    'root_causes', v_root_causes,
    'suggested_action', 'Analizzare categorie con maggiore incremento. Valutare ottimizzazione budget.',
    'metric_value', v_margin_change,
    'threshold_value', -10.0
  );
END IF;
```

---

## Fase 3: Frontend - Nuovi Componenti

### 3.1 Struttura File

```text
src/
├── pages/
│   └── CeoDashboard.tsx              # Nuova pagina dashboard CEO
├── hooks/
│   ├── useCeoDashboard.ts            # Hook per RPC
│   ├── useCostCenters.ts             # CRUD centri di costo
│   └── useBrandTaxSettings.ts        # Gestione impostazioni fiscali
├── components/
│   └── ceo/
│       ├── CeoKpiCards.tsx           # Grid KPI con confidence
│       ├── CeoRevenueVsCostsChart.tsx # Grafico andamento
│       ├── CeoCostBreakdown.tsx      # Breakdown per categoria/centro
│       ├── CeoAlertsPanel.tsx        # Pannello alert espandibili
│       ├── ConfidenceBadge.tsx       # Badge livello confidenza
│       ├── TaxDisclaimer.tsx         # Banner disclaimer fiscale
│       └── BudgetBaselineCard.tsx    # Card budget disponibile
└── types/
    └── company.ts                    # Estensione tipi esistenti
```

### 3.2 Tipi TypeScript

```typescript
// Estensione src/types/company.ts

export interface CeoKpi {
  revenue_total: number;
  revenue_from_won_deals: number;
  
  costs_total: number;
  costs_direct: number;
  costs_indirect: number;
  costs_personnel: number;
  costs_marketing: number;
  costs_by_center: CostByCenter[];
  costs_by_category: CostByCategory[];
  
  gross_margin: number;
  operating_margin: number;
  gross_margin_percent: number;
  
  tax_settings: TaxSettings;
  estimated_vat_payable: number;
  estimated_corporate_tax: number;
  estimated_net_profit: number;
  
  prev_period_revenue: number;
  prev_period_costs: number;
  revenue_change_percent: number;
  costs_change_percent: number;
  
  marketing_spend: number;
  marketing_roi: number;
  
  confidence: ConfidenceLevel;
  alerts: CeoAlert[];
  budget_baseline: BudgetBaseline;
}

export interface ConfidenceLevel {
  overall: number;
  estimated_net_profit: number;
  marketing_roi: number;
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  factor: string;
  contribution: number;
  value: number;
  detail: string;
}

export interface CeoAlert {
  type: 'MARGIN_DECLINING' | 'COST_ANOMALY' | 'BUDGET_EXCEEDED' | 
        'REVENUE_DROP' | 'POSITIVE_TREND' | 'MISSING_COSTS' | 'MARKETING_ROI_LOW';
  severity: 'info' | 'warning' | 'error' | 'success';
  message: string;
  root_causes: string[];
  suggested_action: string;
  metric_value: number;
  threshold_value: number;
}

export interface BudgetBaseline {
  total_planned: number;
  total_spent: number;
  variance: number;
  variance_percent: number;
  categories_over_budget: CategoryOverBudget[];
  remaining_allocable: number;
}

export interface CostCenter {
  id: string;
  brand_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BrandTaxSettings {
  id: string;
  brand_id: string;
  corporate_tax_rate: number;
  regional_tax_rate: number;
  vat_rate_default: number;
  fiscal_year_start: number;
  notes: string | null;
}
```

### 3.3 Layout Dashboard CEO

```text
+------------------------------------------+
|  CEO Dashboard - [Brand] - [Periodo]     |
|  [i] Stima gestionale (disclaimer)       |
+------------------------------------------+
|  [Utile Netto]  [Margine %]  [ROI Mkt]   |
|  conf: 82%      conf: 90%    conf: 75%   |
+------------------------------------------+
|  [Fatturato]  [Costi Tot]  [Budget Disp] |
|   €125.000     €85.000       €15.000     |
+------------------------------------------+
|                                          |
|  [Grafico: Vendite vs Costi - 6 mesi]    |
|                                          |
+-------------------+----------------------+
|  Costi per Tipo   |  Costi per Centro   |
|  [stacked bar]    |  [pie chart]        |
+-------------------+----------------------+
|                                          |
|  [Alert & Anomalie]              [3]     |
|  +-----------------------------------+   |
|  | [!] MARGIN_DECLINING    warning   |   |
|  | Margine -12% vs media 3m          |   |
|  | Cause: Marketing +18%, Revenue -8%|   |
|  | Azione: Analizzare campagne...    |   |
|  +-----------------------------------+   |
|                                          |
+------------------------------------------+
```

---

## Fase 4: Routing e Menu

### 4.1 App.tsx

```typescript
import CeoDashboard from '@/pages/CeoDashboard';

// Dentro Routes
<Route path="/ceo-dashboard" element={<CeoDashboard />} />
```

### 4.2 MainLayout.tsx

```typescript
// Nuovo menu item nell'array adminMenuItems
{ 
  icon: LineChart, 
  label: 'Dashboard CEO', 
  path: '/ceo-dashboard', 
  requiresRole: ['admin', 'ceo'] 
}
```

---

## Fase 5: Estensione Form Costi

### 5.1 Nuovi campi nel dialog

```text
+-----------------------------------------------+
|  Nuovo Costo                                  |
+-----------------------------------------------+
|  Importo *        [___________] €             |
|  Data *           [___________]               |
|  Categoria        [Select ▼]                  |
|  Fornitore        [___________]               |
|                                               |
|  --- Dettagli Avanzati ---                    |
|                                               |
|  Centro di Costo  [Select ▼]                  |
|  Periodicita      ○ Una tantum                |
|                   ○ Mensile                   |
|                   ○ Trimestrale               |
|                   ○ Annuale                   |
|  Ricorrente fino  [___________] (se != una t.)|
|  Deducibile       [✓]                         |
|  Aliquota IVA     [22% ▼]                     |
|                                               |
|  Descrizione      [___________]               |
|  Note             [___________]               |
+-----------------------------------------------+
```

---

## Fase 6: Settings - Centri di Costo e Tasse

### 6.1 Nuovo tab in Settings

```text
Settings
├── Generali
├── Webhook
├── Google Sheets
├── ...
└── [NUOVO] Controllo Gestione
    ├── Centri di Costo (CRUD table)
    └── Impostazioni Fiscali
        ├── Aliquota IRES: [24.0]%
        ├── Aliquota IRAP: [3.9]%
        ├── IVA Default: [22.0]%
        └── Inizio Anno Fiscale: [Gennaio ▼]
```

---

## Sequenza Implementazione

| Fase | Descrizione | Files |
|------|-------------|-------|
| 1 | Migration DB | `supabase/migrations/xxx.sql` |
| 2 | RPC `get_ceo_dashboard_kpis` | stesso migration file |
| 3 | Tipi TypeScript | `src/types/company.ts` |
| 4 | Hook useCeoDashboard | `src/hooks/useCeoDashboard.ts` |
| 5 | Hook useCostCenters | `src/hooks/useCostCenters.ts` |
| 6 | Hook useBrandTaxSettings | `src/hooks/useBrandTaxSettings.ts` |
| 7 | Componenti CEO | `src/components/ceo/*.tsx` |
| 8 | Pagina CeoDashboard | `src/pages/CeoDashboard.tsx` |
| 9 | Routing | `src/App.tsx` |
| 10 | Menu | `src/components/layout/MainLayout.tsx` |
| 11 | Estensione form costi | `src/pages/company/CompanyExpenses.tsx` |
| 12 | Settings controllo gestione | `src/pages/Settings.tsx` + componenti |

---

## Sicurezza

### Accesso Dashboard CEO

```typescript
// In CeoDashboard.tsx
const { isAdmin, isCeo } = useAuth();

if (!isAdmin && !isCeo) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        Accesso riservato a Admin e CEO.
      </AlertDescription>
    </Alert>
  );
}
```

### RLS Enforcement

- `cost_centers`: SELECT per finance, ALL per admin/ceo
- `brand_tax_settings`: ALL solo per admin/ceo
- RPC: validazione interna con `has_finance_access()`

---

## Disclaimer Fiscale

Banner presente in:
- CeoDashboard (header)
- CompanyOverview (se mostra tasse)
- CompanyReports

```tsx
<Alert className="bg-blue-50 border-blue-200">
  <Info className="h-4 w-4 text-blue-600" />
  <AlertTitle className="text-blue-800">Stima Gestionale</AlertTitle>
  <AlertDescription className="text-blue-700">
    Questi dati sono calcolati per supporto decisionale interno. 
    Non costituiscono documentazione fiscale ufficiale.
  </AlertDescription>
</Alert>
```

---

## Risultato Atteso

Al completamento di M13:

1. **Dashboard CEO** con KPI finanziari e **livello di confidenza** visivo
2. **Costi strutturati** per categoria, centro, tipo (diretto/indiretto/personale/marketing)
3. **Alert intelligenti** con cause radice e azioni suggerite espandibili
4. **Budget baseline** come riferimento decisionale con variance tracking
5. **Stima tasse** (IVA, IRES, IRAP) con disclaimer appropriato
6. **Confronti temporali** (MoM, YoY) per decisioni informate
7. **Gestione centri di costo** e impostazioni fiscali per brand
