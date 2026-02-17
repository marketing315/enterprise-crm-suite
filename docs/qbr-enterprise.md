# Quarterly Business Review (QBR) — Operating Cadence

> Cadenza operativa enterprise: gate automatici + audit umani con evidenze versionate.  
> Ogni QBR produce un report archiviato in questo documento con esito GO/NO-GO.

---

## 1. Cadenza Operativa

| Frequenza | Attività | Owner | Output |
|-----------|----------|-------|--------|
| **Per PR** | CI gate automatico (7 metriche) | Automatico | Merge bloccato se rosso |
| **Per PR** | Review checklist dominio | Domain owner | Approvazione GitHub |
| **Settimanale** | KPI C-Level snapshot (§3) | Tech Lead | Slack/email digest |
| **Mensile** | Adoption check moduli Evaluate | Product | Decisione invest/freeze |
| **Trimestrale (QBR)** | Review completa (§2) | Engineering Lead + CEO | Report versionato sotto §5 |

---

## 2. Agenda QBR Trimestrale

Durata: 60 min. Partecipanti: Engineering Lead, Product, CEO.

| # | Blocco | Durata | Fonte dati | Domanda chiave |
|---|--------|--------|------------|----------------|
| 1 | **Delivery KPIs** | 10 min | `docs/slo-sla.md` §4.1 | Stiamo rilasciando abbastanza velocemente con qualità? |
| 2 | **Reliability SLO** | 10 min | `docs/slo-sla.md` §1-3 | I sistemi critici rispettano gli SLO? Error budget consumato? |
| 3 | **Security Findings** | 10 min | `docs/rbac-assurance.md` §6 | Ci sono violazioni aperte? Remediation completate? |
| 4 | **ROI per Dominio** | 15 min | `docs/portfolio-rationalization.md` | Quali moduli investire/freezare nel prossimo trimestre? |
| 5 | **Business KPI** | 10 min | `docs/slo-sla.md` §4.2 | Lead→Deal, SLA compliance, CAC, deal velocity on target? |
| 6 | **Azioni & Decisioni** | 5 min | — | Cosa cambiamo per il prossimo trimestre? |

---

## 3. Metriche QBR (Scorecard)

### 3.1 Delivery (da `docs/slo-sla.md` §4.1)

| KPI | Target | Fonte query |
|-----|--------|-------------|
| Deployment Frequency | ≥ 2/settimana | CI deploy count |
| Change Failure Rate | ≤ 5% | Rollback / total deploys |
| MTTR | ≤ 4h (P1), ≤ 24h (P2) | Incident tracker |
| PR Smoke Pass Rate | ≥ 98% | `e2e-gate.yml` |
| Security Posture | 100% clean | `secrets-scan.yml` + linter |

### 3.2 Reliability (da `docs/slo-sla.md` §1)

| SLO | Target | Business Link |
|-----|--------|---------------|
| Ingest Availability | ≥ 99.5% | Lead→Deal conversion |
| Ingest P95 Latency | ≤ 500ms | Partner experience |
| SLA Detection | ≤ 5 min | Ticket SLA compliance |
| Dashboard LCP | ≤ 3s | User adoption |
| AI Success Rate | ≥ 95% | AI classification accuracy |
| Webhook Delivery | ≥ 95% | Partner retention |

### 3.3 Security (da `docs/rbac-assurance.md`)

| Check | Target | Frequenza |
|-------|--------|-----------|
| RLS coverage | 100% tabelle con brand_id | Trimestrale |
| Permissive policies | 0 su tabelle PII | Trimestrale |
| Legacy roles | 0 | Trimestrale |
| Secret scan CI | Clean | Per PR |
| DB linter | 0 warnings | Per migration |

### 3.4 Business (da `docs/slo-sla.md` §4.2)

| KPI | Target | Query |
|-----|--------|-------|
| Lead → Deal Conversion | ≥ 15% | §4.2.1 |
| Ticket SLA Compliance | ≥ 90% | §4.2.2 |
| CAC Payback | ≤ 6 mesi | §4.2.3 |
| Deal Velocity | ≤ 30gg | §4.2.4 |
| AI Accuracy (1 - override) | ≥ 85% | `ai_decision_logs` |

### 3.5 ROI per Dominio (da `docs/portfolio-rationalization.md`)

| Tier | Moduli | Criterio promozione/retrocessione |
|------|--------|-----------------------------------|
| 🚀 Invest | Pipeline, AI Classify, Inbound, Tickets | KPI core stabili 2 sprint → mantieni |
| ⏸️ Maintain | Meta Ads, Outbound WH, Sales, Appointments | Bug > 3/mese → rivaluta |
| 🔍 Evaluate | AI Chat, Sheets, Analytics, CEO Dash, Finance, Forecast | Adoption < threshold → freeze |
| ❄️ Freeze | Chat Team, Ad Stats, VOIspeed, Keplero, PWA, CC KPI, CAPI Mon, AI Chat | Adoption = 0 per 2Q → sunset |

---

## 4. Gate Automatici (Enforcement)

Questi gate sono **bloccanti** e non richiedono intervento umano:

| Gate | Dove | Cosa blocca |
|------|------|-------------|
| `npm ci` | `e2e-gate.yml` | PR merge |
| `tsc --noEmit` | `e2e-gate.yml` | PR merge |
| `npm run build` | `e2e-gate.yml` | PR merge |
| `vitest run` | `e2e-gate.yml` | PR merge |
| `playwright test smoke` | `e2e-gate.yml` | PR merge |
| `playwright test feature` | `e2e-gate.yml` | PR merge |
| Secret scan | `secrets-scan.yml` | PR merge |
| PR review checklist | `docs/domain-ownership.md` | Approvazione reviewer |

---

## 5. Registro QBR

> Ogni QBR completato viene archiviato qui con scorecard, decisioni e azioni.

### QBR Q1 2026 — 2026-02-17

**Partecipanti:** Tech Lead (AI-assisted)  
**Esito complessivo:** 🟢 GO con remediation pianificate

#### Scorecard

| Area | Score | Note |
|------|-------|------|
| Delivery | 🟢 | CI gate attivi e bloccanti, build hard gate |
| Reliability | 🟡 | SLO definiti, monitoring query pronte, dati baseline in raccolta |
| Security | 🟢 | 86/86 RLS, 0 policy permissive, 0 legacy roles, linter clean |
| Business KPI | 🟡 | Query pronte, target definiti, dati storici limitati (primo trimestre) |
| Portfolio | 🟢 | Matrice 4-tier definita, gate stabilità KPI prima di riallocazione |

#### Decisioni (Evidence-Based)

| # | Decisione | Metrica Target | Baseline | Obiettivo Q2 | Outcome Economico |
|---|-----------|---------------|----------|-------------|-------------------|
| D1 | Focus esclusivo su 4 moduli Invest | CI gate pass rate | 100% | 100% | Evita regressioni → zero rollback cost (~4h MTTR × costo team) |
| D2 | AI Chat → Freeze | LLM API cost / msg inviati | €X/mese, 0 msg misurati | €0 | **Risparmio OPEX**: 100% costo LLM AI Chat (~60% budget AI) |
| D3 | Creare utenti test venditore/operatore | RBAC check coverage | 7/10 (70%) | 10/10 (100%) | **Risk reduction**: previene data leak cross-brand (costo P0: >€10k) |
| D4 | Estendere audit trigger deal/ticket/contact | Audit log entity coverage | 2 entity types | 5 entity types | **Compliance**: audit trail completo per contratti enterprise |

#### Investimenti CAPEX Q2 (con ROI atteso)

| # | Investimento | Effort stimato | Metrica impattata | Target Δ | ROI atteso |
|---|-------------|----------------|-------------------|----------|------------|
| I1 | Pipeline scoring avanzato | 2 sprint | Deal velocity | 30gg → 22gg | +26% revenue velocity → cash flow anticipato |
| I2 | AI override rate reduction | 1 sprint | Override rate | 15% → <10% | -33% FTE triage manuale (~0.5 FTE risparmiato) |
| I3 | SLA escalation automatica | 1 sprint | SLA compliance | 90% → 95% | -50% penali contrattuali, +retention enterprise |
| I4 | Inbound validation layer | 1 sprint | Ingestion success rate | 98% → 99.5% | -75% lead persi → +1.5% conversion pipeline |

#### Risparmi OPEX Q2 (da freeze/consolidamento)

| # | Azione | Costo attuale | Costo post | Risparmio | Rischio |
|---|--------|--------------|------------|-----------|---------|
| O1 | Freeze AI Chat | LLM API €X/mese | €0 | 100% | Basso (0 adoption) |
| O2 | Freeze Ad Stats Sync | Edge Function cron runtime | €0 | 100% | Basso (dati duplicati da piattaforme) |
| O3 | Consolidamento Sheets (5→1 fn) | 5 fn × monitoring cost | 1 fn | -80% | Medio (richiede refactor) |
| O4 | Riduzione QA surface (15→8 domini) | Test matrix 15 domini | 8 domini | -47% effort QA | Basso (frozen = no change) |

#### Azioni Q2

| # | Azione | Owner | Scadenza | Metrica di successo | Stato |
|---|--------|-------|----------|-------------------|-------|
| A1 | Seed utenti venditore + operatore_callcenter | Core | Apr 2026 | RBAC coverage 10/10 | 📋 Todo |
| A2 | Aggiungere audit trigger su deals, tickets, contacts | Platform | Apr 2026 | Entity coverage 5/5 | 📋 Todo |
| A3 | Raccogliere baseline 4 settimane Business KPI | Analytics | Mag 2026 | Dati disponibili per 5 KPI | 📋 Todo |
| A4 | Primo adoption check moduli Evaluate | Product | Apr 2026 | Decisione invest/freeze per ogni modulo | 📋 Todo |
| A5 | Assegnare owner nominali ai domini | Engineering Lead | Mar 2026 | 100% domini con owner nominale | 📋 Todo |

---

### QBR Q2 2026 — _da schedulare (Aprile 2026)_

**Prerequisiti:**
- [ ] Azioni A1-A5 da Q1 completate
- [ ] Audit RBAC Q2 eseguito (`docs/rbac-assurance.md`)
- [ ] Baseline Business KPI disponibile (4+ settimane di dati)
- [ ] Adoption metrics moduli Evaluate raccolte

---

## 6. Riferimenti

| Documento | Contenuto |
|-----------|-----------|
| [`docs/slo-sla.md`](./slo-sla.md) | SLO definitions, observability queries, KPI C-Level |
| [`docs/rbac-assurance.md`](./rbac-assurance.md) | Audit RBAC trimestrale, matrice accesso |
| [`docs/portfolio-rationalization.md`](./portfolio-rationalization.md) | Matrice must-have/nice-to-have, raccomandazioni tier |
| [`docs/domain-ownership.md`](./domain-ownership.md) | Domain map, boundary rules, PR review checklist |
| [`docs/sandbox-strategy.md`](./sandbox-strategy.md) | Go/No-Go board, seed strategy |
| [`docs/changelog.md`](./changelog.md) | Release log con evidenze QA |
