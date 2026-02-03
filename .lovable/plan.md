
# M13 - Controllo di Gestione & Intelligenza Decisionale (Versione Potenziata)

## Panoramica

Implementazione del modulo strategico M13 con le tre migliorie richieste:
1. **Confidence Level** per KPI stimati
2. **Alert Spiegabili** con root causes e azioni suggerite
3. **Budget come baseline** separato concettualmente dai costi storici

---

## Architettura Esistente

- RPC `get_admin_finance_kpis` calcola: total_expenses, sales_total, margin
- Tabelle: `expenses`, `expense_categories`, `budgets`
- Accesso via `has_finance_access()` per admin/ceo/amministrazione
- System Brand `00000000-...` per aggregazione cross-brand

---

## 1. Schema Database - Nuove Tabelle

### 1.1 Tabella `cost_centers`

| Campo | Tipo | Note |
|-------|------|------|
| id | uuid | PK |
| brand_id | uuid | FK brands |
| name | text | es. "Sede Milano" |
| code | text | codice breve opzionale |
| is_active | boolean | default true |
| created_at | timestamptz | |

### 1.2 Tabella `brand_tax_settings`

| Campo | Tipo | Note |
|-------|------|------|
| id | uuid | PK |
| brand_id | uuid | UNIQUE |
| corporate_tax_rate | numeric | IRES (es. 24) |
| regional_tax_rate | numeric | IRAP (es. 3.9) |
| vat_rate_default | numeric | IVA standard (22) |
| fiscal_year_start | integer | 1-12 |
| notes | text | disclaimer custom |

---

## 2. Schema Database - Estensioni Tabelle Esistenti

### 2.1 Estensione `expense_categories`

Nuovi campi:
| Campo | Tipo | Note |
|-------|------|------|
| parent_id | uuid | gerarchia nullable |
| category_type | text | 'direct'/'indirect'/'personnel'/'marketing'/'overhead' |
| is_deductible | boolean | default true |

### 2.2 Estensione `expenses`

Nuovi campi:
| Campo | Tipo | Note |
|-------|------|------|
| cost_center_id | uuid | FK cost_centers |
| periodicity | text | 'one_off'/'monthly'/'quarterly'/'yearly' |
| recurring_until | date | per costi ricorrenti |
| is_deductible | boolean | override categoria |
| tax_rate | numeric | aliquota IVA (22, 10, 4, 0) |
| gross_amount | numeric | importo lordo |

---

## 3. RPC `get_ceo_dashboard_kpis` - Output Completo

```text
{
  // === FATTURATO ===
  revenue_total: number,
  revenue_from_won_deals: number,
  
  // === COSTI STRUTTURATI ===
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
  
  // === [NUOVO] CONFIDENCE LEVELS ===
  confidence: {
    estimated_net_profit: number,  // 0.0 - 1.0
    marketing_roi: number,
    factors: [{
      factor: string,
      contribution: number,
      detail: string
    }]
  },
  
  // === [NUOVO] ALERT SPIEGABILI ===
  alerts: [{
    type: string,
    severity: 'info' | 'warning' | 'error' | 'success',
    message: string,
    root_causes: string[],
    suggested_action: string,
    metric_value: number,
    threshold_value: number
  }],
  
  // === [NUOVO] BUDGET BASELINE ===
  budget_baseline: {
    total_planned: number,
    total_spent: number,
    variance: number,
    variance_percent: number,
    categories_over_budget: [{
      category_name: string,
      planned: number,
      actual: number,
      overage: number
    }],
    remaining_allocable: number
  }
}
```

---

## 4. Confidence Level - Formula di Calcolo

Il confidence level indica quanto possiamo fidarci delle stime. Viene calcolato come media ponderata di fattori:

```text
confidence = (
  recurring_costs_known * 0.30 +    -- % costi ricorrenti su totale
  confirmed_sales_ratio * 0.30 +    -- % vendite confermate
  period_coverage * 0.20 +          -- giorni con dati / giorni totali
  historical_accuracy * 0.20        -- accuratezza stime passate (fase 2)
)
```

### Fattori di Confidence

| Fattore | Peso | Calcolo |
|---------|------|---------|
| `recurring_costs_known` | 30% | costi con periodicity != 'one_off' / totale costi |
| `confirmed_sales_ratio` | 30% | deal won con payment confirmed / totale won |
| `period_coverage` | 20% | giorni con almeno 1 transazione / giorni periodo |
| `historical_accuracy` | 20% | (M14) confronto stime vs consuntivi passati |

### Output UI

- Confidence > 0.8: Badge verde "Alta affidabilita"
- Confidence 0.5-0.8: Badge giallo "Media affidabilita"
- Confidence < 0.5: Badge rosso "Bassa affidabilita - dati incompleti"

---

## 5. Alert Spiegabili - Tipi e Root Cause Analysis

### 5.1 Tipi di Alert

| Tipo | Trigger | Severity |
|------|---------|----------|
| `MARGIN_DECLINING` | margine < media 3m - 10% | warning |
| `COST_ANOMALY` | singolo costo > 2x media categoria | warning |
| `BUDGET_EXCEEDED` | actual > budget categoria | error |
| `REVENUE_DROP` | revenue < prev_month - 20% | error |
| `POSITIVE_TREND` | margine > prev_month + 15% | success |
| `MISSING_COSTS` | categoria senza costi registrati | info |
| `MARKETING_ROI_LOW` | ROI marketing < 100% | warning |

### 5.2 Struttura Alert Completa

```text
{
  type: "MARGIN_DECLINING",
  severity: "warning",
  message: "Margine in calo del 12% rispetto alla media trimestrale",
  root_causes: [
    "Marketing: +18% rispetto al mese precedente",
    "Revenue: -8% rispetto al mese precedente",
    "Costi personale: +5% (nuova assunzione)"
  ],
  suggested_action: "Analizzare ROI campagne Brand X. Valutare ottimizzazione budget marketing.",
  metric_value: -12.3,
  threshold_value: -10.0
}
```

### 5.3 Logica Root Cause Analysis

Per ogni alert, la RPC identifica i contributori principali analizzando:

1. **MARGIN_DECLINING**: Confronta ogni categoria costo MoM, ordina per delta assoluto
2. **COST_ANOMALY**: Identifica vendor/descrizione del costo anomalo
3. **BUDGET_EXCEEDED**: Lista categorie con scostamento > 0
4. **MARKETING_ROI_LOW**: Identifica campagne con ROAS < 1

---

## 6. Budget come Baseline Decisionale

### 6.1 Filosofia

- **Budget**: piano decisionale, modificabile, forward-looking
- **Costi**: realta storica, immutabile, backward-looking

### 6.2 Struttura `budget_baseline`

```text
budget_baseline: {
  total_planned: 50000,           // totale budget mese
  total_spent: 42000,             // costi effettivi
  variance: 8000,                 // planned - spent (positivo = sotto budget)
  variance_percent: 16.0,         // % risparmiato
  
  categories_over_budget: [
    { category_name: "Marketing", planned: 10000, actual: 12500, overage: 2500 }
  ],
  
  remaining_allocable: 8000       // budget riallocabile a fine mese
}
```

### 6.3 UI Budget Baseline

Nella dashboard CEO:
- Card "Budget Disponibile" con remaining_allocable
- Alert automatico quando categoria sfora
- Suggerimento: "Riallocare X da Categoria A a Categoria B"

---

## 7. Componenti React

### Nuovi file

| File | Descrizione |
|------|-------------|
| `src/pages/CeoDashboard.tsx` | Dashboard CEO principale |
| `src/hooks/useCeoDashboard.ts` | Hook per RPC |
| `src/components/ceo/CeoKpiCards.tsx` | KPI con confidence badge |
| `src/components/ceo/CeoRevenueChart.tsx` | Grafico vendite vs costi |
| `src/components/ceo/CeoCostBreakdown.tsx` | Breakdown per categoria/centro |
| `src/components/ceo/CeoAlertsPanel.tsx` | Pannello alert spiegabili |
| `src/components/ceo/ConfidenceBadge.tsx` | Badge livello confidenza |
| `src/components/ceo/TaxDisclaimer.tsx` | Banner disclaimer fiscale |
| `src/components/ceo/BudgetBaselineCard.tsx` | Card budget disponibile |

### Modifiche esistenti

| File | Modifica |
|------|----------|
| `src/App.tsx` | Route /ceo-dashboard |
| `src/components/layout/MainLayout.tsx` | Menu item CEO |
| `src/types/company.ts` | Tipi CeoKpi, Alert, Confidence |
| `src/hooks/useCompanyFinance.ts` | Nuovi campi expense |

---

## 8. UI Alert Panel

```text
+-----------------------------------------------+
|  Alert & Anomalie                      [3]    |
+-----------------------------------------------+
|  [!] MARGIN_DECLINING                warning  |
|  Margine -12% rispetto alla media 3 mesi      |
|                                               |
|  Cause principali:                            |
|  - Marketing: +18%                            |
|  - Revenue: -8%                               |
|                                               |
|  Azione suggerita:                            |
|  Analizzare campagne Brand X                  |
|                                               |
|  [Vai al dettaglio] [Ignora]                  |
+-----------------------------------------------+
|  [!] BUDGET_EXCEEDED                  error   |
|  Categoria "Marketing" ha sforato del 25%     |
|  ...                                          |
+-----------------------------------------------+
```

---

## 9. Sequenza Implementazione

### Fase 1: Database
1. Creare tabella `cost_centers`
2. Creare tabella `brand_tax_settings`
3. ALTER `expense_categories` (parent_id, category_type, is_deductible)
4. ALTER `expenses` (cost_center_id, periodicity, tax_rate, gross_amount, is_deductible, recurring_until)
5. RLS policies

### Fase 2: RPC Backend
1. Creare `get_ceo_dashboard_kpis` con:
   - Calcolo costi strutturati
   - Calcolo tasse stimate
   - Calcolo confidence levels
   - Generazione alert con root causes
   - Budget baseline comparison

### Fase 3: Frontend Settings
1. UI gestione centri di costo
2. UI configurazione tasse brand
3. Estensione form costi

### Fase 4: Frontend Dashboard
1. Pagina CeoDashboard
2. KPI Cards con ConfidenceBadge
3. AlertsPanel espandibile
4. BudgetBaselineCard
5. Grafici e breakdown

---

## 10. Sicurezza

### Accesso

```typescript
// Solo admin/ceo possono accedere alla dashboard CEO
if (!isAdmin && !isCeo) {
  return <AccessDenied />;
}
```

### RLS Policies

- `brand_tax_settings`: SELECT/UPDATE solo admin/ceo
- `cost_centers`: SELECT per finance, CRUD per admin/ceo
- RPC `get_ceo_dashboard_kpis`: validazione interna con `has_finance_access()`

---

## 11. Disclaimer Fiscale

Ogni visualizzazione include il banner:

```text
+-----------------------------------------------+
|  i  Stima gestionale                          |
|     Questi dati sono calcolati per supporto   |
|     decisionale interno. Non costituiscono    |
|     documentazione fiscale ufficiale.         |
+-----------------------------------------------+
```

---

## Risultato Atteso

Al completamento di M13, CEO e Admin avranno:

1. Dashboard strategica con KPI finanziari e **livello di confidenza**
2. Costi strutturati per categoria, centro, tipo (diretto/indiretto)
3. **Alert intelligenti** con cause radice e azioni suggerite
4. **Budget baseline** come riferimento decisionale riallocabile
5. Stima tasse (IVA, IRES, IRAP) con disclaimer appropriato
6. Confronti temporali (MoM, YoY) per decisioni informate
