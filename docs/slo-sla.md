# SLO / SLA Operativi

> Service Level Objectives collegati a KPI di business.  
> Ogni SLO risponde alla domanda: **"se questo degrada, quale risultato di business ne risente?"**

---

## 1. SLO Definitions

### 1.1 API Ingest (webhook-ingest, meta-leads-webhook, keplero-webhook)

**Business Link:** Ogni minuto di downtime = lead persi → pipeline vuota → revenue a zero.

| Metric | SLO | Business Impact se violato |
|--------|-----|---------------------------|
| **Availability** | ≥ 99.5% (month) | Lead drop → calo Lead→Deal conversion |
| **Latency P95** | ≤ 500ms | UX degradata per partner che inviano lead |
| **Latency P99** | ≤ 2000ms | Timeout partner → lead persi silenziosamente |
| **Ingestion Success Rate** | ≥ 98% | Lead non registrati → pipeline incompleta |
| **Deduplication Accuracy** | 100% | Duplicati → spreco FTE operatore + metriche falsate |

**Error Budget**: 0.5% = ~3.6h downtime/month or ~2,160 failed requests per 432,000.

### 1.2 Ticket SLA Breach Processing (sla-breach-checker)

**Business Link:** SLA breach = penali contrattuali + churn cliente enterprise.

| Metric | SLO | Business Impact se violato |
|--------|-----|---------------------------|
| **Detection Latency** | ≤ 5 min from breach | Ritardo escalation → cliente insoddisfatto |
| **Cron Reliability** | ≥ 99% executions/month | Breach non rilevati → SLA compliance falsata |
| **False Positive Rate** | ≤ 1% | Alert fatigue → team ignora breach reali |
| **Recovery Assignment** | ≤ 4 min | Ticket orfani → aumento MTTR |

### 1.3 Dashboard & UI

**Business Link:** Dashboard lenta = adozione bassa → utenti tornano a Excel → churn.

| Metric | SLO | Business Impact se violato |
|--------|-----|---------------------------|
| **Initial Load (LCP)** | ≤ 3s | Abbandono pagina, percezione prodotto lento |
| **API Response (RPC)** | P95 ≤ 800ms | Workflow operatore rallentato → meno lead gestiti/giorno |
| **Real-time Latency** | ≤ 2s | Decisioni su dati stale → errori operativi |
| **Error Rate (client)** | ≤ 0.5% | Fiducia utente erosa → escalation a supporto |

### 1.4 Outbound Webhooks (webhook-dispatcher)

**Business Link:** Webhook falliti = automazioni partner interrotte → integrazione percepita come inaffidabile.

| Metric | SLO | Business Impact se violato |
|--------|-----|---------------------------|
| **First Attempt Latency** | ≤ 60s from trigger | Partner riceve dati in ritardo → workflow asincroni falliscono |
| **Delivery Success Rate** | ≥ 95% (within retry window) | Dati non consegnati → partner perde lead |
| **DLQ Overflow Rate** | ≤ 2% | Troppi eventi persi → fiducia integrazione compromessa |
| **P95 Delivery Latency** | ≤ 500ms | Lentezza percepita dal partner |

### 1.5 AI Classification (ai-classify)

**Business Link:** AI inaccurata = operatori override manuale → spreco FTE = ROI AI negativo.

| Metric | SLO | Business Impact se violato |
|--------|-----|---------------------------|
| **Processing Latency** | P95 ≤ 10s | Lead in coda → ritardo lavorazione → speed-to-lead peggiore |
| **Success Rate** | ≥ 95% | Job falliti → lead non classificati → triage manuale |
| **Override Rate** | ≤ 15% | Ogni override = costo FTE + sfiducia nel sistema AI |

---

## 1.6 SLO → Business KPI Mapping

> Mappa diretta: quale SLO protegge quale KPI di business.

| SLO Domain | KPI Business Protetto | Target KPI | Conseguenza se SLO violato |
|------------|----------------------|------------|---------------------------|
| Ingest Availability ≥ 99.5% | **Lead → Deal Conversion** | ≥ 15% | Lead persi → conversion rate crolla |
| Ingest Success Rate ≥ 98% | **Pipeline Volume** | Crescita MoM | Lead non registrati → pipeline vuota |
| SLA Detection ≤ 5min | **Ticket SLA Compliance** | ≥ 90% | Breach non rilevati → penali contrattuali |
| SLA Cron Reliability ≥ 99% | **Customer Retention** | Churn ≤ 3%/mese | SLA violati = churn enterprise |
| Dashboard LCP ≤ 3s | **User Adoption** | DAU stabile | UX lenta → ritorno a Excel |
| AI Success Rate ≥ 95% | **AI Classification Accuracy** | ≥ 85% | Triage manuale → costo FTE aumenta |
| AI Override Rate ≤ 15% | **CAC Payback** | ≤ 6 mesi | ROI AI negativo → costo acquisizione sale |
| Webhook Delivery ≥ 95% | **Partner Retention** | Zero escalation/mese | Integrazione rotta → partner churn |
| Deal Velocity (§4.2.4) | **Revenue Velocity** | ≤ 30gg | Ciclo lungo → cash flow ritardato |

---

## 2. Observability Queries

### 2.1 Ingestion Success Rate (last 24h)

```sql
SELECT
  COUNT(*) AS total_requests,
  COUNT(*) FILTER (WHERE status_code < 400) AS success,
  COUNT(*) FILTER (WHERE status_code >= 500) AS server_errors,
  ROUND(
    COUNT(*) FILTER (WHERE status_code < 400)::numeric / NULLIF(COUNT(*), 0) * 100, 2
  ) AS success_rate_pct
FROM incoming_requests
WHERE received_at > NOW() - INTERVAL '24 hours';
```

### 2.2 SLA Breach Detection Latency

```sql
SELECT
  t.id,
  t.priority,
  t.created_at,
  t.sla_breached_at,
  b.sla_thresholds_minutes,
  EXTRACT(EPOCH FROM (
    t.sla_breached_at - (t.created_at + (
      (b.sla_thresholds_minutes->>('P' || t.priority))::int * INTERVAL '1 minute'
    ))
  )) / 60 AS detection_delay_minutes
FROM tickets t
JOIN brands b ON t.brand_id = b.id
WHERE t.sla_breached_at IS NOT NULL
  AND t.created_at > NOW() - INTERVAL '7 days'
ORDER BY detection_delay_minutes DESC
LIMIT 20;
```

### 2.3 AI Classification Performance

```sql
SELECT
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS total_jobs,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))::numeric, 1) AS avg_latency_s,
  PERCENTILE_CONT(0.95) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))
  ) AS p95_latency_s
FROM ai_jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

### 2.4 Outbound Webhook Delivery Health

```sql
SELECT
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'success') AS delivered,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  COUNT(*) FILTER (WHERE status = 'dlq') AS in_dlq,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'success')::numeric / NULLIF(COUNT(*), 0) * 100, 1
  ) AS delivery_rate_pct,
  ROUND(AVG(latency_ms)::numeric, 0) AS avg_latency_ms
FROM outbound_webhook_deliveries
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

### 2.5 Error Budget Burn Rate (30-day rolling)

```sql
WITH daily AS (
  SELECT
    DATE_TRUNC('day', received_at) AS day,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status_code >= 500) AS errors
  FROM incoming_requests
  WHERE received_at > NOW() - INTERVAL '30 days'
  GROUP BY day
)
SELECT
  day,
  total,
  errors,
  ROUND(errors::numeric / NULLIF(total, 0) * 100, 3) AS error_rate_pct,
  ROUND(0.5 - (errors::numeric / NULLIF(total, 0) * 100), 3) AS remaining_budget_pct,
  SUM(errors) OVER (ORDER BY day) AS cumulative_errors,
  SUM(total) OVER (ORDER BY day) AS cumulative_total
FROM daily
ORDER BY day DESC;
```

### 2.6 MTTR (Mean Time To Resolve) — Tickets

```sql
SELECT
  DATE_TRUNC('week', created_at) AS week,
  COUNT(*) AS resolved,
  ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 1) AS avg_mttr_hours,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600
  ) AS median_mttr_hours
FROM tickets
WHERE resolved_at IS NOT NULL
  AND created_at > NOW() - INTERVAL '90 days'
GROUP BY week
ORDER BY week DESC;
```

---

## 3. Alert Thresholds

| Alert | Condition | Severity | Channel |
|-------|-----------|----------|---------|
| Ingest error spike | Error rate > 2% over 15min | 🔴 P1 | Brand `alert_thresholds` → notification |
| SLA checker missed | No cron execution in 10min | 🔴 P1 | Cron monitoring |
| AI job queue growing | Pending jobs > 50 | 🟡 P2 | Admin dashboard |
| DLQ overflow | DLQ entries > 20 in 1h | 🟡 P2 | Admin webhook dashboard |
| Dashboard RPC slow | P95 > 2s over 5min | 🟡 P2 | Client-side monitoring |
| Error budget < 20% | Monthly burn > 80% | 🔴 P1 | Weekly report |

---

## 4. KPI C-Level

> Metriche raccomandate per il board esecutivo. Aggiornamento: settimanale.

### 4.1 Engineering Velocity & Reliability

| # | KPI | Target | Fonte | Cadenza |
|---|-----|--------|-------|---------|
| 1 | **Deployment Frequency** | ≥ 2/settimana | CI deploy pipeline | Settimanale |
| 2 | **Change Failure Rate** | ≤ 5% | Rollback count / total deploys | Settimanale |
| 3 | **MTTR (Mean Time To Restore)** | ≤ 4h (P1), ≤ 24h (P2) | Incident tracker | Settimanale |
| 4 | **% PR con smoke test pass** | ≥ 98% | `e2e/smoke.spec.ts` gate CI | Per PR |
| 5 | **Security Posture Score** | 100% clean | Secret scan + dependency audit | Settimanale |

#### Dettaglio metriche

**Deployment Frequency**
- Conta i merge su `main` che generano un deploy effettivo
- Target: almeno 2 rilasci/settimana = ciclo iterativo sano
- Se < 1/settimana → indagare bottleneck (review, test, infra)

**Change Failure Rate**
- `(deploys con rollback o hotfix entro 24h) / total deploys × 100`
- Target ≤ 5% indica buona copertura test e review process
- Tracciare separatamente: config failure vs code failure

**MTTR**
- Tempo da incident detection a service restored (non root-cause found)
- Query disponibile in §2.6 per ticket MTTR
- Per infra: tracking manuale fino a implementazione incident log

**Security Posture Score**
- Composito di:
  - Secret scan CI: 0 leak → ✅ (`.github/workflows/secrets-scan.yml`)
  - Dependency audit: 0 critical/high CVE → ✅
  - RLS linter: 0 warning → ✅ (`supabase--linter`)
- Score = (check passati / check totali) × 100

### 4.2 Business KPI

| # | KPI | Target | Query / Fonte | Cadenza |
|---|-----|--------|---------------|---------|
| 6 | **Lead → Deal Conversion Rate** | ≥ 15% | Query §4.2.1 | Settimanale |
| 7 | **Ticket SLA Compliance** | ≥ 90% | Query §4.2.2 | Settimanale |
| 8 | **CAC Payback Period** | ≤ 6 mesi | Query §4.2.3 (se dati disponibili) | Mensile |
| 9 | **Deal Velocity (giorni medi)** | ≤ 30gg | Query §4.2.4 | Settimanale |
| 10 | **AI Classification Accuracy** | ≥ 85% (1 - override rate) | `ai_decision_logs` | Settimanale |

#### 4.2.1 Lead → Deal Conversion Rate

```sql
WITH period AS (
  SELECT NOW() - INTERVAL '30 days' AS start_date
),
leads AS (
  SELECT COUNT(DISTINCT c.id) AS total_leads
  FROM contacts c, period p
  WHERE c.created_at >= p.start_date
),
converted AS (
  SELECT COUNT(DISTINCT d.contact_id) AS total_deals
  FROM deals d
  JOIN contacts c ON d.contact_id = c.id
  CROSS JOIN period p
  WHERE c.created_at >= p.start_date
    AND d.stage_name NOT IN ('lost', 'disqualified')
)
SELECT
  l.total_leads,
  c.total_deals,
  ROUND(c.total_deals::numeric / NULLIF(l.total_leads, 0) * 100, 1) AS conversion_rate_pct
FROM leads l, converted c;
```

#### 4.2.2 Ticket SLA Compliance

```sql
SELECT
  DATE_TRUNC('week', created_at) AS week,
  COUNT(*) AS total_tickets,
  COUNT(*) FILTER (WHERE sla_breached_at IS NULL OR resolved_at < sla_breached_at) AS within_sla,
  ROUND(
    COUNT(*) FILTER (WHERE sla_breached_at IS NULL OR resolved_at < sla_breached_at)::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS compliance_pct
FROM tickets
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY week
ORDER BY week DESC;
```

#### 4.2.3 CAC Payback Period (se disponibile)

```sql
-- Richiede dati di spesa marketing e revenue per deal
WITH monthly_spend AS (
  SELECT
    DATE_TRUNC('month', period_start) AS month,
    SUM(amount) AS total_spend
  FROM marketing_costs
  WHERE period_start > NOW() - INTERVAL '6 months'
  GROUP BY month
),
monthly_revenue AS (
  SELECT
    DATE_TRUNC('month', closed_at) AS month,
    COUNT(*) AS deals_closed,
    SUM(value) AS total_revenue
  FROM deals
  WHERE stage_name = 'won'
    AND closed_at > NOW() - INTERVAL '6 months'
  GROUP BY month
)
SELECT
  s.month,
  s.total_spend,
  r.deals_closed,
  ROUND(s.total_spend / NULLIF(r.deals_closed, 0), 0) AS cac,
  r.total_revenue,
  ROUND(s.total_spend / NULLIF(r.total_revenue, 0) * 12, 1) AS payback_months
FROM monthly_spend s
LEFT JOIN monthly_revenue r ON s.month = r.month
ORDER BY s.month DESC;
```

#### 4.2.4 Deal Velocity

```sql
SELECT
  DATE_TRUNC('week', d.created_at) AS week,
  COUNT(*) AS deals_closed,
  ROUND(AVG(EXTRACT(EPOCH FROM (d.closed_at - d.created_at)) / 86400)::numeric, 1) AS avg_days,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (d.closed_at - d.created_at)) / 86400
  ) AS median_days
FROM deals d
WHERE d.closed_at IS NOT NULL
  AND d.stage_name = 'won'
  AND d.created_at > NOW() - INTERVAL '90 days'
GROUP BY week
ORDER BY week DESC;
```

### 4.3 Executive Dashboard Summary

```
┌──────────────────────────────────────────────────────┐
│                 C-LEVEL KPI BOARD                    │
├────────────────────┬─────────────────────────────────┤
│  ENGINEERING       │  BUSINESS                       │
│                    │                                 │
│  Deploy Freq: 3/w  │  Lead→Deal: 18.2%              │
│  CFR: 2.1%        │  SLA Compliance: 93.4%          │
│  MTTR: 2.8h       │  CAC Payback: 4.2 mesi          │
│  Smoke: 99.1%     │  Deal Velocity: 22gg             │
│  Security: 100%   │  AI Accuracy: 88.3%              │
│                    │                                 │
│  Status: 🟢       │  Status: 🟢                     │
├────────────────────┴─────────────────────────────────┤
│  ⚠️  Alerts: CFR > 5% → P1 | SLA < 85% → P1        │
└──────────────────────────────────────────────────────┘
```

---

## 5. Review Cadence

| Frequenza | Attività | Owner |
|-----------|----------|-------|
| **Daily** | Glance at ingest success rate + DLQ count | Platform on-call |
| **Weekly** | Review error budget burn, AI override rate | Admin |
| **Monthly** | Full SLO review, MTTR trend, generate report | Core + Domain owners |
| **Quarterly** | SLO targets revision (tighten or relax) | Engineering lead |

---

## 5. Glossary

| Term | Definition |
|------|-----------|
| **SLO** | Service Level Objective — internal target |
| **SLA** | Service Level Agreement — customer-facing commitment (SLO + consequences) |
| **Error Budget** | `1 - SLO` — allowable failure margin |
| **MTTR** | Mean Time To Resolve |
| **LCP** | Largest Contentful Paint (Core Web Vital) |
| **DLQ** | Dead Letter Queue — undeliverable webhook payloads |
