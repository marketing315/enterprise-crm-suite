

# Piano: M11 - Analytics Avanzati

## Panoramica

M11 introduce una suite di analytics avanzati orientati al business e alle decisioni strategiche, complementando le dashboard operative esistenti (AI Metrics, Callcenter KPI, Webhook Monitor).

---

## Nuove Funzionalita

### 1. Dashboard Analytics Unificata

Una nuova pagina `/admin/analytics` che aggrega metriche strategiche in un'unica vista executive.

**Sezioni:**

| Sezione | Metriche |
|---------|----------|
| **Funnel Lead-to-Deal** | Conversion rate per stage, drop-off points, tempo medio per stage |
| **Revenue Analytics** | Valore pipeline per stage, win rate, deal velocity, valore medio deal |
| **Lead Source Analysis** | Performance per fonte (Meta, Web, Referral), costo per lead (se disponibile), quality score |
| **Cohort Analysis** | Retention leads per settimana/mese, lifecycle value |
| **Forecast** | Proiezione chiusure basata su velocity storica |

### 2. Funnel Pipeline Analytics

Visualizzazione del funnel di conversione con:

- **Conversion Rate per Stage**: % di deal che avanzano da ogni stage
- **Drop-off Analysis**: Dove si perdono i deal (stage con maggior abbandono)
- **Stage Duration**: Tempo medio in ogni stage (identificare colli di bottiglia)
- **Velocity Metrics**: Deal velocity (giorni medi da creazione a chiusura)

### 3. Lead Source Performance

Dashboard per analizzare le fonti lead:

- **Volume per fonte**: Leads da Meta, Webhook, Manuale
- **Quality Score**: Conversion rate per fonte
- **Cost per Lead**: Se integrato con Meta Ads spend
- **Best Performing Campaigns**: Top campagne/form

### 4. Time-based Analytics

- **Heatmap attivita**: Orari/giorni con piu lead
- **Seasonality Analysis**: Pattern stagionali
- **Trend YoY/MoM**: Confronti anno su anno, mese su mese

### 5. Export e Scheduled Reports

- **Export PDF/CSV**: Report esportabili
- **Scheduled Email**: Report automatici (fase 2)

---

## Architettura Tecnica

### Database: Nuove RPC per Analytics

```sql
-- Funnel conversion rates
CREATE FUNCTION get_pipeline_funnel_analytics(
  p_brand_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
) RETURNS JSON

-- Lead source performance
CREATE FUNCTION get_lead_source_analytics(
  p_brand_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
) RETURNS JSON

-- Deal velocity metrics
CREATE FUNCTION get_deal_velocity_metrics(
  p_brand_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
) RETURNS JSON
```

### Struttura Dati Funnel

```typescript
interface FunnelStage {
  stage_id: string;
  stage_name: string;
  stage_color: string;
  deals_entered: number;
  deals_exited_to_next: number;
  deals_won: number;
  deals_lost: number;
  conversion_rate: number; // % che avanza
  avg_days_in_stage: number;
}

interface FunnelAnalytics {
  stages: FunnelStage[];
  total_deals: number;
  overall_win_rate: number;
  avg_deal_velocity_days: number;
  total_pipeline_value: number;
}
```

### Struttura Lead Source

```typescript
interface LeadSourceMetrics {
  source: string; // 'meta', 'webhook', 'manual'
  source_name: string; // Nome specifico
  leads_count: number;
  deals_created: number;
  deals_won: number;
  total_value_won: number;
  conversion_rate: number;
  avg_deal_value: number;
}
```

---

## UI/UX Design

### Pagina AdminAnalytics

```text
+------------------------------------------+
|  📊 Analytics Avanzati     [Date Range]  |
+------------------------------------------+
|  KPI Cards (4 principali)                |
|  [Pipeline Value] [Win Rate] [Velocity] [Leads] |
+------------------------------------------+
|  [Tabs: Funnel | Sources | Trends | Forecast]   |
+------------------------------------------+
|  Tab Content:                            |
|  - Funnel: Sankey/Funnel chart           |
|  - Sources: Bar chart + table            |
|  - Trends: Line charts                   |
|  - Forecast: Projection chart            |
+------------------------------------------+
```

### Componenti Grafici

- **Funnel Chart**: Visualizzazione stages con conversion rates
- **Sankey Diagram**: Flusso deals tra stages (opzionale, fase 2)
- **Bar Chart orizzontale**: Source comparison
- **Area Chart stacked**: Trend temporali
- **KPI Cards animati**: Metriche principali con delta vs periodo precedente

---

## File da Creare

| File | Descrizione |
|------|-------------|
| `src/pages/AdminAnalytics.tsx` | Pagina principale analytics |
| `src/hooks/useAdvancedAnalytics.ts` | Hook per fetch dati analytics |
| `src/components/admin/analytics/FunnelChart.tsx` | Visualizzazione funnel |
| `src/components/admin/analytics/SourcePerformanceChart.tsx` | Performance fonti |
| `src/components/admin/analytics/TrendComparisonChart.tsx` | Confronti temporali |
| `src/components/admin/analytics/AnalyticsKpiCards.tsx` | KPI cards principali |
| `src/components/admin/analytics/ForecastChart.tsx` | Proiezione revenue |
| Migrazione SQL | RPC functions per analytics |

## File da Modificare

| File | Modifiche |
|------|-----------|
| `src/App.tsx` | Aggiungere route `/admin/analytics` |
| `src/components/layout/MainLayout.tsx` | Sostituire link Analytics generico con nuova pagina |
| `src/components/dashboard/DashboardMilestones.tsx` | Aggiornare M11 a "current" |

---

## Metriche Calcolate

### Win Rate
```sql
win_rate = deals_won / (deals_won + deals_lost) * 100
```

### Deal Velocity
```sql
avg_velocity = AVG(closed_at - created_at) WHERE status IN ('won', 'lost')
```

### Funnel Conversion
```sql
stage_conversion = deals_moved_to_next_stage / deals_entered_stage * 100
```

### Lead Quality Score
```sql
quality_score = (deals_won_from_source / leads_from_source) * 100
```

---

## Navigazione

Il menu Admin verra aggiornato:

| Attuale | Nuovo |
|---------|-------|
| Analytics (link a Dashboard) | Analytics Avanzati (nuova pagina) |

---

## Fasi di Implementazione

### Fase 1 (Core)
1. Migrazione SQL con RPC analytics
2. Hook `useAdvancedAnalytics`
3. Pagina `AdminAnalytics` con tabs
4. Funnel Chart e Source Performance
5. KPI Cards con delta

### Fase 2 (Enhancement)
1. Forecast/proiezioni
2. Sankey diagram
3. Export PDF
4. Heatmap attivita

---

## Risultato Atteso

1. Dashboard analytics unificata accessibile da Admin > Analytics
2. Visualizzazione funnel pipeline con conversion rates
3. Analisi performance fonti lead
4. Trend temporali con confronti (WoW, MoM)
5. KPI strategici: Win Rate, Deal Velocity, Pipeline Value
6. Aggiornamento roadmap con M11 come milestone corrente

