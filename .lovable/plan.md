
# M14 - Intelligenza Predittiva & Automazione Decisionale

## Panoramica

M14 trasforma il CRM da strumento di **osservazione** (M13: "come sta andando?") a strumento di **previsione e azione** ("cosa succederà e cosa conviene fare?").

**Filosofia**: Controllo umano + suggerimenti AI. L'automazione è sempre "safe mode" - suggerisce, non forza.

---

## Architettura Esistente (Base per M14)

Dall'analisi del codice, M14 può costruire su:

- **AI Decision Service** (`ai-classify`): già classifica lead con priorità 1-5, tag, rationale
- **AI Agent Executive** (`ai-agent`): tool-calling per KPI, pipeline, ticket, trend
- **Sistema Notifiche**: realtime con preferenze per ruolo
- **CEO Dashboard** (M13): KPI, confidence levels, alert spiegabili, budget baseline
- **Salesperson KPIs**: win_rate, avg_days_to_close, deals_open/won/lost
- **ActionGuide**: neuromarketing con loss aversion messaging già implementato
- **Tags e Scoring**: infrastruttura tag gerarchici con AI assignment

---

## 1. Deal Scoring Intelligente (0-100)

### 1.1 Schema Database

```sql
-- Nuova tabella per storicizzare score
CREATE TABLE deal_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  factors jsonb NOT NULL DEFAULT '[]',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(deal_id, calculated_at::date)  -- Un score al giorno max
);

-- Colonne su deals per accesso veloce
ALTER TABLE deals
  ADD COLUMN deal_score integer CHECK (deal_score BETWEEN 0 AND 100),
  ADD COLUMN deal_risk_level text CHECK (deal_risk_level IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN score_updated_at timestamptz;
```

### 1.2 Fattori di Scoring

| Fattore | Peso | Calcolo |
|---------|------|---------|
| `days_in_stage` | -15% | Penalità progressiva: -2 per ogni giorno oltre la media stage |
| `interaction_recency` | +20% | Bonus se interazione (chat, chiamata, evento) negli ultimi 3 giorni |
| `salesperson_win_rate` | +15% | Win rate storico del venditore assegnato |
| `deal_value_vs_avg` | +10% | Bonus se valore > media brand (motivazione venditore) |
| `stage_progression_speed` | +15% | Velocità di avanzamento rispetto alla media |
| `contact_engagement` | +10% | Email aperte, risposte chat, appuntamenti confermati |
| `ai_priority` | +15% | Priorità iniziale AI (1-5 → 20-100 punti) |

### 1.3 Calcolo Risk Level

```text
score >= 70: risk_level = 'low'     (verde)
score 50-69: risk_level = 'medium'  (giallo)
score 30-49: risk_level = 'high'    (arancione)
score < 30:  risk_level = 'critical' (rosso)
```

### 1.4 RPC `calculate_deal_scores`

Eseguita via cron ogni ora o on-demand:
- Calcola score per tutti i deal aperti
- Aggiorna `deals.deal_score` e `deals.deal_risk_level`
- Inserisce in `deal_scores` per storico

---

## 2. Forecasting Automatico

### 2.1 Nuova Tabella `forecasts`

```sql
CREATE TABLE forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  forecast_type text NOT NULL CHECK (forecast_type IN ('revenue', 'deals', 'tickets')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  predicted_value numeric(14,2) NOT NULL,
  confidence_level numeric(4,3) NOT NULL CHECK (confidence_level BETWEEN 0 AND 1),
  model_version text NOT NULL DEFAULT 'v1',
  factors jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(brand_id, forecast_type, period_start, period_end)
);
```

### 2.2 Modello di Previsione Revenue

Formula basata su dati reali (no ML complesso):

```text
predicted_revenue = 
  (deal_value * probability_by_stage) 
  + (historical_monthly_avg * seasonality_factor)
  * salesperson_performance_modifier

Dove:
- probability_by_stage: % storica chiusura per stage (es. Qualificato=40%, Negoziazione=70%)
- seasonality_factor: confronto stesso mese anno precedente
- salesperson_performance_modifier: 0.8-1.2 basato su win_rate recente
```

### 2.3 RPC `get_revenue_forecast`

```sql
CREATE FUNCTION get_revenue_forecast(
  p_brand_id UUID,
  p_period TEXT  -- 'month', 'quarter'
) RETURNS JSONB
```

Output:
```json
{
  "period": "febbraio 2026",
  "predicted_revenue": 125000,
  "confidence": 0.72,
  "range": { "min": 95000, "max": 155000 },
  "breakdown": {
    "from_open_deals": 85000,
    "from_historical_trend": 40000
  },
  "comparison": {
    "vs_last_month": "+12%",
    "vs_same_month_last_year": "+8%"
  }
}
```

---

## 3. Alert Business Automatici

### 3.1 Estensione Tabella Notifiche

Riuso sistema esistente `notifications` con nuovi `type`:

| Alert Type | Trigger | Ruoli Target |
|------------|---------|--------------|
| `FORECAST_BELOW_BREAKEVEN` | predicted_revenue < break_even_threshold | CEO, Admin |
| `SALESPERSON_OVERLOADED` | deal_count > capacity_threshold | Manager, Admin |
| `CAMPAIGN_LOSING_MONEY` | ROAS < 1 per 7+ giorni | Marketing, Admin |
| `DEAL_STALE_HOT` | deal con score > 60 fermo > 5 giorni | Venditore, Manager |
| `MARGIN_DECLINING` | già in M13, esteso con trend prediction | CEO |
| `POSITIVE_FORECAST` | predicted_revenue > target + 20% | CEO (motivazionale) |

### 3.2 Edge Function `smart-alerts`

Eseguita da cron ogni 6 ore:
1. Calcola metriche predittive
2. Confronta con soglie configurabili (in `brand_settings`)
3. Crea notifiche con `root_causes` e `suggested_action`
4. Rispetta `notification_preferences` per ruolo

### 3.3 Configurazione Soglie

Nuova tabella o estensione `brand_settings`:

```sql
ALTER TABLE brands ADD COLUMN alert_thresholds jsonb DEFAULT '{
  "salesperson_capacity": 15,
  "deal_stale_days": 5,
  "campaign_loss_days": 7,
  "margin_decline_percent": 10
}';
```

---

## 4. Suggerimenti Operativi AI

### 4.1 Nuova Tabella `action_suggestions`

```sql
CREATE TABLE action_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),  -- null = per tutti
  entity_type text NOT NULL CHECK (entity_type IN ('deal', 'contact', 'ticket')),
  entity_id uuid NOT NULL,
  suggestion_type text NOT NULL,  -- 'call_now', 'offer_discount', 'send_followup', 'archive', 'reassign'
  title text NOT NULL,
  description text,
  priority integer NOT NULL DEFAULT 3,
  confidence numeric(4,3) NOT NULL,
  expires_at timestamptz,
  dismissed_at timestamptz,
  acted_on_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 4.2 Tipi di Suggerimento

| Tipo | Trigger | Azione Suggerita |
|------|---------|------------------|
| `call_now` | Deal hot (score>70) con ultimo contatto > 3gg | "Chiama ora - cliente caldo" |
| `offer_discount` | Deal in stage Negoziazione > 10gg, storico sconto funziona | "Proponi sconto 10%" |
| `send_followup` | Email/chat senza risposta > 5gg | "Invia follow-up" |
| `change_channel` | Nessuna risposta su canale X, ma attivo su Y | "Prova WhatsApp" |
| `archive` | Deal fermo > 30gg, score < 20, no interazioni | "Archivia e libera pipeline" |
| `reassign` | Venditore sovraccarico, deal simili chiusi da altro | "Riassegna a [nome]" |

### 4.3 Generazione Suggerimenti

Edge function `generate-action-suggestions`:
1. Analizza deal aperti con score e interazioni
2. Applica pattern matching basato su storico chiusure
3. Crea suggerimenti con confidence score
4. Scade automaticamente dopo 48h se non agiti

---

## 5. Performance Venditori Evoluta

### 5.1 Nuovi Campi Calcolati

Estensione RPC `get_salesperson_kpis`:

```json
{
  "user_id": "...",
  "full_name": "Mario Rossi",
  
  // Esistenti
  "deals_open": 12,
  "deals_won": 8,
  "win_rate": 67,
  "avg_days_to_close": 14,
  
  // M14: Nuovi
  "stress_score": 72,          // 0-100: carico vs capacità
  "focus_score": 85,           // 0-100: % tempo su deal caldi
  "efficiency_score": 78,      // valore/ora stimato
  "deal_velocity_trend": "+12%", // velocità chiusura vs mese scorso
  "suggested_capacity": 10,    // deal consigliati
  "current_load": 12,          // deal attuali
  "overloaded": true
}
```

### 5.2 Calcolo Stress Score

```text
stress_score = 
  (current_deals / suggested_capacity) * 40 +
  (overdue_deals / current_deals) * 30 +
  (avg_response_time_hours / target_response_hours) * 30
```

### 5.3 Dashboard Performance (nuova sezione)

Nella pagina `SalespersonKpi.tsx`:
- Badge stress (verde/giallo/rosso)
- Sparkline velocità chiusura
- Suggerimento redistribuzione automatica

---

## 6. Automazioni Guidate (Safe Mode)

### 6.1 Nuova Tabella `automation_rules`

```sql
CREATE TABLE automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL,  -- 'deal_stale', 'stage_enter', 'score_threshold', 'time_based'
  trigger_config jsonb NOT NULL DEFAULT '{}',
  action_type text NOT NULL,   -- 'move_stage', 'create_reminder', 'suggest_action', 'notify'
  action_config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  requires_confirmation boolean NOT NULL DEFAULT true,  -- Safe mode!
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES automation_rules(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action_taken text NOT NULL,
  was_confirmed boolean,  -- null = pending, true = confermato, false = rifiutato
  confirmed_by uuid REFERENCES users(id),
  executed_at timestamptz NOT NULL DEFAULT now()
);
```

### 6.2 Automazioni Default

| Regola | Trigger | Azione | Conferma |
|--------|---------|--------|----------|
| Auto-move stale | Deal in stage > 14gg | Sposta a "Da Richiamare" | Sì (notifica) |
| Reminder scadenza | Deal con appuntamento | Crea reminder 1h prima | No |
| Priorità giornaliera | Ogni mattina 08:00 | Genera lista 5 deal top score | No |
| Alert SLA imminente | Ticket a 80% SLA | Notifica operatore | No |

### 6.3 Safe Mode UI

Nel pannello notifiche:
```text
+-------------------------------------------+
| 🤖 Automazione suggerita                   |
| Deal "Mario Rossi" fermo da 14 giorni      |
|                                           |
| Azione: Sposta a "Da Richiamare"          |
|                                           |
| [✓ Conferma]  [✗ Ignora]  [⚙️ Modifica regola] |
+-------------------------------------------+
```

---

## 7. Executive Summary Automatico

### 7.1 Edge Function `executive-summary`

Genera report settimanale testuale:

```typescript
// Input
{
  brand_id: "...",
  period: "week",
  format: "markdown" | "plain"
}

// Output
{
  summary: `
## Riepilogo Settimanale - [Brand]
**Periodo**: 27 Gen - 2 Feb 2026

### 📈 Performance
- **Fatturato**: €45.200 (+12% vs settimana scorsa)
- **Deal chiusi**: 8 (5 vinti, 3 persi)
- **Win Rate**: 62% (sopra media 58%)

### ⚠️ Attenzione
- Brand X in calo per costi marketing elevati (+18%)
- 3 deal caldi fermi da > 5 giorni

### 💡 Raccomandazioni
1. Ridurre budget campagna Y (ROAS 0.7)
2. Riassegnare deal fermi a venditori con capacità
3. Follow-up urgente su cliente [nome]
  `,
  generated_at: "2026-02-03T08:00:00Z",
  confidence: 0.82
}
```

### 7.2 Invio Automatico

- Cron domenica sera o lunedì mattina
- Email ai ruoli CEO/Admin (preferenze opt-in)
- Archiviato in nuova tabella `executive_reports`

### 7.3 UI in Dashboard

Card "Report Settimanale" con:
- Anteprima 3 righe
- "Leggi tutto" apre modal
- "Genera ora" per refresh manuale

---

## 8. Componenti React

### Nuovi File

| File | Descrizione |
|------|-------------|
| `src/pages/Forecasts.tsx` | Pagina previsioni revenue/deal |
| `src/hooks/useDealScoring.ts` | Hook per score deal |
| `src/hooks/useForecast.ts` | Hook per previsioni |
| `src/hooks/useActionSuggestions.ts` | Hook suggerimenti |
| `src/hooks/useAutomationRules.ts` | CRUD regole automazione |
| `src/components/pipeline/DealScoreBadge.tsx` | Badge score colorato |
| `src/components/pipeline/DealSuggestionCard.tsx` | Card suggerimento azione |
| `src/components/forecast/ForecastCard.tsx` | Card previsione con range |
| `src/components/forecast/ForecastChart.tsx` | Grafico predicted vs actual |
| `src/components/team/SalespersonStressIndicator.tsx` | Indicatore carico |
| `src/components/settings/AutomationRulesSettings.tsx` | Gestione regole |
| `src/components/dashboard/ExecutiveSummaryCard.tsx` | Card report settimanale |

### Modifiche Esistenti

| File | Modifica |
|------|----------|
| `src/components/pipeline/KanbanCard.tsx` | Aggiunge DealScoreBadge |
| `src/components/pipeline/DealDetailSheet.tsx` | Sezione Score + Suggerimenti |
| `src/components/dashboard/ActionGuide.tsx` | Integra suggerimenti AI |
| `src/pages/CeoDashboard.tsx` | Card Forecast + Executive Summary |
| `src/pages/SalespersonKpi.tsx` | Stress/Focus score |
| `src/components/layout/MainLayout.tsx` | Menu item "Previsioni" |

---

## 9. Sicurezza e Permessi

### Matrice Accesso M14

| Feature | Venditore | Manager | Admin | CEO |
|---------|-----------|---------|-------|-----|
| Deal Score (proprio) | ✅ | ✅ | ✅ | ✅ |
| Deal Score (altri) | ❌ | ✅ | ✅ | ✅ |
| Suggerimenti personali | ✅ | ✅ | ✅ | ✅ |
| Forecast revenue | ❌ | ✅ | ✅ | ✅ |
| Team stress score | ❌ | ✅ | ✅ | ✅ |
| Automation rules | ❌ | ❌ | ✅ | ✅ |
| Executive summary | ❌ | ❌ | ✅ | ✅ |

### RLS Policies

```sql
-- action_suggestions: solo propri o se admin
CREATE POLICY "Users see own suggestions"
  ON action_suggestions FOR SELECT
  USING (
    user_id = get_user_id(auth.uid()) OR
    user_id IS NULL OR  -- suggerimenti globali
    has_role(get_user_id(auth.uid()), 'admin') OR
    has_role(get_user_id(auth.uid()), 'ceo')
  );
```

---

## 10. Sequenza Implementazione

### Fase 1: Database (Migration)
1. Tabella `deal_scores`
2. Colonne scoring su `deals`
3. Tabella `forecasts`
4. Tabella `action_suggestions`
5. Tabelle automazioni
6. RLS policies

### Fase 2: Backend (RPC + Edge Functions)
1. RPC `calculate_deal_scores`
2. RPC `get_revenue_forecast`
3. Edge function `smart-alerts`
4. Edge function `generate-action-suggestions`
5. Edge function `executive-summary`
6. Cron jobs setup

### Fase 3: Frontend - Core
1. DealScoreBadge e integrazione Kanban
2. ForecastCard e ForecastChart
3. ActionSuggestionCard
4. Estensione DealDetailSheet

### Fase 4: Frontend - Dashboard
1. ExecutiveSummaryCard
2. Integrazione ActionGuide con suggerimenti AI
3. Estensione CeoDashboard con forecast

### Fase 5: Frontend - Settings
1. AutomationRulesSettings
2. Configurazione soglie alert

### Fase 6: Frontend - Team Performance
1. SalespersonStressIndicator
2. Estensione SalespersonKpi con nuovi score

---

## 11. Edge Functions Schedule

| Function | Frequenza | Descrizione |
|----------|-----------|-------------|
| `calculate-deal-scores` | Ogni ora | Ricalcola score deal aperti |
| `smart-alerts` | Ogni 6 ore | Genera alert business |
| `generate-action-suggestions` | Ogni 4 ore | Crea suggerimenti operativi |
| `executive-summary` | Domenica 20:00 | Genera report settimanale |
| `forecast-refresh` | Ogni notte 03:00 | Ricalcola previsioni |

---

## Risultato Atteso

Al completamento di M14:

1. **Deal Scoring** con badge visivo (0-100) e risk level in Kanban
2. **Forecasting** revenue/deal con range di confidenza
3. **Alert Business** intelligenti per tutti i ruoli
4. **Suggerimenti Operativi** "cosa fare ora" per ogni venditore
5. **Performance Team** con stress/focus score per coaching
6. **Automazioni Safe Mode** con conferma utente
7. **Executive Summary** settimanale pronto in 2 minuti

---

## Preview M15 (spoiler 😏)

M15 porterà l'automazione al livello successivo:
- **Scaling automatico**: redistribuzione lead basata su capacità predittiva
- **Auto-pricing**: suggerimenti sconto basati su elasticità storica
- **Multi-brand optimization**: allocazione budget cross-brand
- **API esterne**: integrazione con calendario, email, telefonia

