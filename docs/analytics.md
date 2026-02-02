# Analytics Avanzati (M11)

## Overview

Dashboard analytics executive per metriche strategiche e performance. Fornisce visibilità su funnel conversion, source performance, e deal velocity.

---

## Accesso

| Route | Descrizione |
|-------|-------------|
| `/admin/analytics` | Dashboard completa |
| `/analytics` | Alias (stesso contenuto) |

**Permessi richiesti**: Admin o CEO del brand selezionato.

---

## Metriche Disponibili

### 1. Funnel Pipeline Analytics

Analisi conversione per stage della pipeline:

| Metrica | Descrizione |
|---------|-------------|
| **Deals Entered** | Deal entrati in ogni stage |
| **Conversion Rate** | % che avanza allo stage successivo |
| **Drop-off** | Deal persi per stage |
| **Avg Days in Stage** | Tempo medio permanenza |

**Use case**: Identificare colli di bottiglia nel processo vendita.

### 2. Source Performance

Performance per fonte lead:

| Metrica | Descrizione |
|---------|-------------|
| **Leads Count** | Volume lead per fonte |
| **Deals Created** | Deal generati |
| **Deals Won** | Deal chiusi positivamente |
| **Conversion Rate** | % lead → deal vinto |
| **Total Value Won** | Revenue per fonte |
| **Avg Deal Value** | Valore medio deal |

**Fonti tracciate**:
- `meta` - Meta Lead Ads (Facebook/Instagram)
- `webhook` - Inbound webhooks generici
- `manual` - Inserimento manuale

**Use case**: Allocazione budget marketing.

### 3. Velocity Metrics

Metriche temporali deal:

| Metrica | Descrizione |
|---------|-------------|
| **Avg Days to Win** | Tempo medio da creazione a chiusura positiva |
| **Avg Days to Lose** | Tempo medio da creazione a chiusura negativa |
| **Weekly Trend** | Andamento settimanale deal creati/vinti |

**Use case**: Previsione chiusure e resource planning.

---

## KPI Cards

Header con 4 KPI principali:

| KPI | Calcolo | Colore |
|-----|---------|--------|
| **Pipeline Value** | Somma value deal aperti | Blu |
| **Win Rate** | won / (won + lost) × 100 | Verde se > 30% |
| **Avg Velocity** | Media giorni a chiusura | Neutro |
| **Total Leads** | Conteggio lead nel periodo | Neutro |

---

## Date Range

Selettore periodo in alto a destra:
- Default: ultimi 30 giorni
- Calendario dual-month per range
- Refresh manuale con pulsante ⟳

---

## Tabs

### Tab: Funnel

Visualizzazione verticale funnel:
- Barre orizzontali proporzionali al volume
- Colori per stage (dalla configurazione)
- Frecce di flusso tra stage
- Indicatori drop-off in rosso

### Tab: Fonti

- **Bar chart orizzontale**: Lead per fonte
- **Tabella dettaglio**: Tutte le metriche per fonte
- Badge colorati per fonte

### Tab: Trend

- **Line chart**: Deal creati vs Deal vinti per settimana
- Confronto settimana corrente vs precedente
- Indicatori up/down trend

---

## RPC Functions

### get_pipeline_funnel_analytics

```sql
SELECT get_pipeline_funnel_analytics(
  p_brand_id := 'uuid',
  p_from := '2026-01-01'::timestamptz,
  p_to := '2026-01-31'::timestamptz
);
```

**Output**:
```json
{
  "stages": [
    {
      "stage_id": "uuid",
      "stage_name": "Lead",
      "stage_color": "#3B82F6",
      "deals_entered": 150,
      "deals_exited_to_next": 120,
      "deals_won": 0,
      "deals_lost": 10,
      "conversion_rate": 80,
      "avg_days_in_stage": 2.5
    }
  ],
  "total_deals": 150,
  "overall_win_rate": 25,
  "avg_deal_velocity_days": 14,
  "total_pipeline_value": 450000
}
```

### get_lead_source_analytics

```sql
SELECT get_lead_source_analytics(
  p_brand_id := 'uuid',
  p_from := '2026-01-01'::timestamptz,
  p_to := '2026-01-31'::timestamptz
);
```

**Output**:
```json
{
  "sources": [
    {
      "source": "meta",
      "source_name": "Meta Ads",
      "leads_count": 80,
      "deals_created": 75,
      "deals_won": 20,
      "total_value_won": 120000,
      "unique_contacts": 78,
      "conversion_rate": 25,
      "avg_deal_value": 6000
    }
  ],
  "total_leads": 150,
  "total_deals_won": 38,
  "total_revenue": 228000
}
```

### get_deal_velocity_metrics

```sql
SELECT get_deal_velocity_metrics(
  p_brand_id := 'uuid',
  p_from := '2026-01-01'::timestamptz,
  p_to := '2026-01-31'::timestamptz
);
```

**Output**:
```json
{
  "avg_days_to_win": 14.5,
  "avg_days_to_lose": 7.2,
  "deals_won_count": 38,
  "deals_lost_count": 22,
  "new_deals_count": 150,
  "avg_won_value": 6000,
  "total_won_value": 228000,
  "weekly_trend": [
    {
      "week_start": "2026-01-06",
      "deals_created": 35,
      "deals_won": 8
    }
  ]
}
```

---

## Calcoli Metriche

### Win Rate
```sql
win_rate = deals_won / NULLIF(deals_won + deals_lost, 0) * 100
```

### Deal Velocity
```sql
avg_velocity = AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400)
WHERE status IN ('won', 'lost')
```

### Funnel Conversion
```sql
stage_conversion = deals_moved_to_next_stage / NULLIF(deals_entered_stage, 0) * 100
```

### Lead Quality Score
```sql
quality_score = deals_won_from_source / NULLIF(leads_from_source, 0) * 100
```

---

## Best Practices

### Analisi Funnel

1. **Identifica drop-off**: Stage con basso conversion rate
2. **Ottimizza colli di bottiglia**: Riduci tempo negli stage critici
3. **Confronta periodi**: WoW/MoM per trend

### Analisi Fonti

1. **ROI per fonte**: Revenue / costo acquisizione
2. **Quality over quantity**: Preferisci fonti con alto conversion rate
3. **A/B test campagne**: Confronta performance ad/form

### Velocity Optimization

1. **Target SLA**: Definisci giorni target per chiusura
2. **Fast-track hot leads**: Prioritizza lead ad alta probabilità
3. **Reduce lost velocity**: Identifica e scarta lead freddi prima

---

## Export (Fase 2)

Funzionalità pianificate:
- Export PDF report
- Scheduled email reports
- CSV download dati raw
