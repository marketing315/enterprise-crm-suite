# CRM Lead Management Platform

> Piattaforma CRM enterprise multi-brand per la gestione completa del ciclo lead-to-deal.

**Produzione:** [crm.gruppobenessere.it](https://crm.gruppobenessere.it)

> L'URL del preview environment è interno al team e non viene pubblicato nel repo per evitare enumerazione/scraping di build non protette. Vedi `docs/decisions.md` o chiedi a un admin.

---

## Quick Start (sviluppo locale)

```bash
# 1. Clona e installa (toolchain: npm)
git clone <REPO_URL> && cd <PROJECT>
npm ci

# 2. Avvia dev server
npm run dev
```

> Le variabili `.env` (solo chiavi pubbliche) sono già versionate.  
> I secret privati risiedono in **Cloud secrets** — mai nel repo.

---

## Stack

| Layer | Tecnologia |
|-------|-----------|
| Frontend | React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui |
| Backend | Lovable Cloud (Edge Functions · PostgreSQL · Storage) |
| AI | Classificazione lead, tagging, chat assistito |
| CI | GitHub Actions (`e2e-gate`, `secrets-scan`) |

---

## Architettura

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                       │
│   Dashboard │ Pipeline │ Contacts │ Tickets │ Marketing │ CEO  │
├─────────────────────────────────────────────────────────────────┤
│                      Lovable Cloud Backend                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  Edge Functions   │  │   PostgreSQL     │  │   Storage     │ │
│  │ • webhook-ingest  │  │ • contacts       │  │ (file upload) │ │
│  │ • ai-classify     │  │ • deals          │  └───────────────┘ │
│  │ • meta-webhook    │  │ • lead_events    │                    │
│  │ • sheets-export   │  │ • tickets        │                    │
│  │ • automation-*    │  │ • appointments   │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features (Milestones)

| # | Feature | Stato |
|---|---------|-------|
| M1 | Inbound Webhooks (HMAC, dedup, rate limit) | ✅ |
| M2 | Deal & Pipeline (Kanban, stage per brand) | ✅ |
| M3 | Lead Events Timeline (append-only audit) | ✅ |
| M4 | AI Classification (priorità, rationale) | ✅ |
| M5 | Ticketing + SLA (breach alerts, queue tabs) | ✅ |
| M6 | Appuntamenti (scheduling, assegnazione) | ✅ |
| M7 | Tag & Filtri (gerarchici, avanzati) | ✅ |
| M8 | Outbound Webhooks (retry, DLQ, HMAC) | ✅ |
| M9 | Google Sheets Export (real-time sync) | ✅ |
| M10 | Meta Lead Ads (FB/IG integration) | ✅ |
| M11 | Analytics Avanzati (funnel, velocity) | ✅ |

---

## Ruoli (RBAC)

| Ruolo | Scope |
|-------|-------|
| CEO | Tutti i brand, tutti i dati |
| Admin | Brand assegnati, configurazione |
| Resp. Venditori | Coordina venditori |
| Resp. Call Center | Coordina operatori |
| Venditore | Deal, appuntamenti |
| Operatore CC | Contatti iniziali |

---

## Testing

```bash
# Unit tests
npx vitest run

# E2E (richiede setup — vedi docs/e2e-checklist.md)
cp .env.e2e.example .env.e2e   # compilare credenziali test
npx playwright install --with-deps chromium
npx playwright test
```

> ⚠️ **Mai testare su dati di produzione.** Usare brand/credenziali dedicati.

---

## Security

- **RLS** su tutte le tabelle (filtro per brand + ruolo)
- **HMAC** per webhook inbound/outbound
- **API Key** hashate SHA-256, mostrate una volta sola
- **Secret scan CI** — blocca merge se trova credenziali nel repo
- **Cron auth** — JWT verification + `x-cron-secret` con rotazione

---

## Documentazione approfondita

| Doc | Contenuto |
|-----|-----------|
| [docs/inbound-webhooks.md](docs/inbound-webhooks.md) | Configurazione sorgenti inbound |
| [docs/meta-lead-ads.md](docs/meta-lead-ads.md) | Integrazione Meta Lead Ads |
| [docs/google-sheets.md](docs/google-sheets.md) | Export Google Sheets |
| [docs/analytics.md](docs/analytics.md) | Dashboard analytics |
| [docs/voispeed-integration.md](docs/voispeed-integration.md) | Integrazione VOIspeed |
| [docs/keplero-integration.md](docs/keplero-integration.md) | Integrazione Keplero |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Guida troubleshooting |
| [docs/e2e-checklist.md](docs/e2e-checklist.md) | Checklist pre-run E2E |
| [docs/decisions.md](docs/decisions.md) | Decision log architetturali |

---

## Runbook operativo

| Scenario | Azione |
|----------|--------|
| Lead non arrivano | Verificare webhook source attiva, controllare `incoming_requests` per errori |
| SLA breach non notificato | Controllare cron `sla-breach-checker`, verificare soglie in Settings |
| Sheets export fallisce | Verificare secret `GOOGLE_SERVICE_ACCOUNT_KEY`, controllare `sheets_export_logs` |
| Webhook outbound in DLQ | Admin → DLQ Dashboard → replay manuale |
| AI classification lenta | Admin → AI Metrics → controllare latenza e job queue |
