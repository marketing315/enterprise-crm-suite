# SLO / SLA Operativi

> Service Level Objectives per i flussi critici della piattaforma CRM.

---

## 1. SLO Definitions

### 1.1 API Ingest (webhook-ingest, meta-leads-webhook, keplero-webhook)

| Metric | SLO | Measurement |
|--------|-----|-------------|
| **Availability** | ≥ 99.5% (month) | `1 - (5xx responses / total requests)` |
| **Latency P95** | ≤ 500ms | Edge function execution time |
| **Latency P99** | ≤ 2000ms | Edge function execution time |
| **Ingestion Success Rate** | ≥ 98% | `lead_events created / valid requests received` |
| **Deduplication Accuracy** | 100% | Zero duplicate `lead_events` per `leadgen_id` or idempotency key |

**Error Budget**: 0.5% = ~3.6h downtime/month or ~2,160 failed requests per 432,000.

### 1.2 Ticket SLA Breach Processing (sla-breach-checker)

| Metric | SLO | Measurement |
|--------|-----|-------------|
| **Detection Latency** | ≤ 5 min from breach | `sla_breached_at - (created_at + threshold_minutes)` |
| **Cron Reliability** | ≥ 99% executions/month | Successful cron runs / expected runs |
| **False Positive Rate** | ≤ 1% | Breached tickets where `sla_breached_at` was set incorrectly |
| **Recovery Assignment** | ≤ 4 min | `ticket-assign-recovery` cron cycle time |

### 1.3 Dashboard & UI

| Metric | SLO | Measurement |
|--------|-----|-------------|
| **Initial Load (LCP)** | ≤ 3s | Largest Contentful Paint on dashboard |
| **API Response (RPC)** | P95 ≤ 800ms | Supabase RPC calls from frontend |
| **Real-time Latency** | ≤ 2s | Time from DB write to UI update via Realtime |
| **Error Rate (client)** | ≤ 0.5% | Unhandled JS errors / page views |

### 1.4 Outbound Webhooks (webhook-dispatcher)

| Metric | SLO | Measurement |
|--------|-----|-------------|
| **First Attempt Latency** | ≤ 60s from trigger | `first_attempted_at - created_at` |
| **Delivery Success Rate** | ≥ 95% (within retry window) | Delivered / total deliveries |
| **DLQ Overflow Rate** | ≤ 2% | DLQ entries / total deliveries |
| **P95 Delivery Latency** | ≤ 500ms | Response time from target endpoint |

### 1.5 AI Classification (ai-classify)

| Metric | SLO | Measurement |
|--------|-----|-------------|
| **Processing Latency** | P95 ≤ 10s | `ai_jobs.completed_at - created_at` |
| **Success Rate** | ≥ 95% | Completed jobs / total jobs |
| **Override Rate** | ≤ 15% | `was_overridden = true` / total decisions |

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

## 4. Review Cadence

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
