# Portfolio Rationalization

> Classificazione di ogni modulo per impatto sul revenue e costo di mantenimento.  
> Obiettivo: focalizzare CAPEX su ciò che genera/protegge ricavo, contenere OPEX su nice-to-have.

---

## Matrice Must-Have vs Nice-to-Have

### 🔴 Must-Have (Revenue-Critical)

Senza questi moduli il prodotto non genera valore per il cliente. Downtime = churn.

| # | Modulo | Revenue Impact | Costo OPEX | Note |
|---|--------|---------------|------------|------|
| M1 | **Inbound Webhooks** | Lead ingestion = pipeline alimentata | Medio (Edge Functions, rate limiting) | Zero lead = zero deal |
| M2 | **Pipeline & Deals** | Core conversion engine | Basso (CRUD + Kanban) | KPI #1 per ogni cliente |
| M3 | **Lead Events** | Audit trail per compliance + AI | Basso (append-only) | Alimenta AI + analytics |
| M4 | **AI Classification** | Automazione triage → riduce FTE | Alto (LLM API, job queue) | ROI diretto su costo operatore |
| M5 | **Ticketing + SLA** | Customer retention, SLA contrattuali | Medio (cron, breach checker) | SLA breach = penali contrattuali |
| — | **Auth & RBAC** | Accesso sicuro multi-tenant | Basso | Prerequisito per tutto |
| — | **Brand Multi-tenancy** | Serve più clienti su 1 istanza | Basso | Modello di business |
| — | **Contacts** | Anagrafica = fondamento CRM | Basso | Ogni modulo dipende da contacts |

### 🟡 Should-Have (Revenue-Enabling)

Potenziano il valore ma il prodotto funziona senza. Differenziatori competitivi.

| # | Modulo | Revenue Impact | Costo OPEX | Note |
|---|--------|---------------|------------|------|
| M6 | **Appuntamenti** | Conversione deal → scheduling | Basso | Importante per vendite field |
| M8 | **Outbound Webhooks** | Integrazione ecosistema cliente | Medio (dispatcher, DLQ, retry) | Stickiness: più integrazioni = meno churn |
| M10 | **Meta Lead Ads** | Canale acquisizione #1 per PMI | Medio (API Meta, token mgmt) | Alto valore percepito |
| M15 | **Automation Engine** | Riduce lavoro manuale | Alto (rule engine, runner, DSL) | Differenziatore vs competitor base |
| — | **Sales Orders & Products** | Chiusura ciclo commerciale | Basso | Necessario per clienti con catalogo |
| — | **Team Management** | Gestione operativa | Basso | Prerequisito per RBAC operativo |

### 🟢 Nice-to-Have (Value-Add)

Arricchiscono l'offerta, ma il ROI marginale è basso. Candidati a freeze/simplify se risorse scarse.

| # | Modulo | Revenue Impact | Costo OPEX | Note |
|---|--------|---------------|------------|------|
| M7 | **Tags & Filtri** | UX improvement | Basso | Utile ma non differenziante |
| M9 | **Google Sheets Export** | Reporting C-level legacy | Medio (Google API, quota) | Sostituibile con CSV export |
| M11 | **Analytics Avanzati** | Insight ma non azione diretta | Basso (query SQL) | Bello da demo, usato poco day-to-day |
| — | **CEO Dashboard** | Vanity metrics per decisore | Basso | Serve per vendere, non per operare |
| — | **AI Chat** | Assistente conversazionale | Alto (LLM per ogni msg) | Wow-factor, ROI incerto |
| — | **Chat Team** | Comunicazione interna | Basso | Slack/Teams già usato dal 90% clienti |
| — | **CAPI Monitor** | Debug Meta conversions | Basso | Utile solo per marketing avanzato |
| — | **Forecast** | Proiezioni revenue | Basso | Accuratezza dipende da data quality |
| — | **Company Finance** | Budget/spese aziendali | Basso | Non core CRM, overlap con ERP |
| — | **PWA Install** | Mobile access | Molto basso | Usato da <5% utenti tipicamente |
| — | **Callcenter KPI Dashboard** | Monitoring operativo | Basso | Utile per 1 ruolo su 7 |
| — | **Ad Stats (Google/Meta)** | Reporting ads | Medio (sync API) | Duplica funzionalità piattaforme ads |
| — | **VOIspeed Integration** | Telefonia click-to-call | Basso | Vendor-specific, piccola nicchia |
| — | **Keplero Integration** | Ingest da gestionale | Basso | 1 cliente specifico |

---

## Cost vs Impact Matrix

```
                    HIGH REVENUE IMPACT
                          │
          Must-Invest     │     Cash Cows
          (AI Classify,   │     (Pipeline, Contacts,
           Automation)    │      Webhooks Inbound,
                          │      Auth/RBAC)
    ──────────────────────┼──────────────────────
          Money Pits      │     Low Maintenance
          (AI Chat,       │     (Tags, Events,
           Sheets Export, │      Appointments,
           Ad Stats Sync) │      Team Mgmt)
                          │
                    LOW REVENUE IMPACT

    HIGH OPEX ◄───────────┼──────────────► LOW OPEX
```

---

## Raccomandazioni

### 🚀 Invest (aumentare qualità + feature)

| Modulo | Azione | Rationale |
|--------|--------|-----------|
| Pipeline & Deals | Scoring avanzato, automazioni stage | Core revenue engine |
| AI Classification | Ridurre override rate (<10%), più modelli | ROI operatore diretto |
| Inbound Webhooks | Idempotency, validation layer, monitoring | Affidabilità = fiducia cliente |
| Ticketing + SLA | Escalation automatica, reporting SLA | Retention + contratti enterprise |

### ⏸️ Maintain (no new features, solo bug fix)

| Modulo | Azione | Rationale |
|--------|--------|-----------|
| Meta Lead Ads | Stabilità, nessuna nuova feature | Funziona, non toccare |
| Outbound Webhooks | Monitoring, no nuovi trigger | Già completo |
| Sales Orders | Solo correzioni | Bassa priorità cliente |
| Appointments | Solo correzioni | Stabile |

### 🔍 Evaluate (misurare adoption prima di investire)

| Modulo | Metrica da tracciare | Decisione se <threshold |
|--------|---------------------|------------------------|
| AI Chat | Messaggi/settimana per brand | < 10 → freeze |
| Google Sheets Export | Export/settimana | < 5 → deprecate, offrire CSV |
| Analytics Avanzati | Visite/settimana per brand | < 3 → simplify |
| CEO Dashboard | Sessioni uniche/mese | < 10 → merge in admin |
| Company Finance | Utenti attivi/mese | < 5 → remove |
| Forecast | Accessi/mese | < 5 → remove |

### ❄️ Freeze Candidates (stop development)

| Modulo | Motivo | Alternativa |
|--------|--------|-------------|
| Chat Team | Duplica Slack/Teams | Link a tool esterno |
| Ad Stats Sync | Duplica Meta/Google dashboard | Deep link a piattaforme |
| VOIspeed | 1 vendor, nicchia | Webhook generico |
| Keplero | 1 cliente | Inbound webhook generico |
| PWA Install | Adoption bassissima | Responsive web |
| Callcenter KPI | 1 ruolo | Merge in admin dashboard |
| CAPI Monitor | Debug-only | Log viewer generico |

---

## Impatto su Roadmap

### Prima (disperso)
```
Q1: 15 moduli in sviluppo parallelo → 0.5 dev/modulo
```

### Dopo (focalizzato)
```
Q1: 4 moduli invest + 4 maintain + 7 frozen
    → 2 dev su Pipeline/AI, 1 su Ingest/Tickets, 1 su maintain
```

### Risparmio stimato

| Voce | Prima | Dopo | Δ |
|------|-------|------|---|
| Moduli attivi in dev | 15 | 8 | -47% |
| Edge Functions da monitorare | 25+ | 15 | -40% |
| LLM API cost (AI Chat freeze) | €X/mese | €X×0.4 | -60% |
| QA surface (test matrix) | 15 domini | 8 domini | -47% |

---

## Review Cadence

| Frequenza | Azione |
|-----------|--------|
| **Mensile** | Check adoption metrics per moduli in "Evaluate" |
| **Trimestrale** | Revisione matrice completa, promozione/retrocessione moduli |
| **Semestrale** | Sunset formale dei moduli frozen con zero adoption |
