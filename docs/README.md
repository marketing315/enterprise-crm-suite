# CRM Lead Management Platform

## Overview

Piattaforma CRM enterprise multi-brand per la gestione completa del ciclo lead-to-deal. Supporta ingestion automatica da Meta Lead Ads, webhook generici, classificazione AI e analytics avanzati.

---

## Features (M1-M11)

| Milestone | Feature | Descrizione |
|-----------|---------|-------------|
| **M1** | Inbound Webhooks | Ingestion lead con rate limiting, HMAC, deduplication |
| **M2** | Deal & Pipeline | Kanban drag-drop con stage configurabili per brand |
| **M3** | Gestione Eventi | Timeline lead events append-only per audit |
| **M4** | AI Classification | Classificazione automatica lead con priorità e rationale |
| **M5** | Ticketing + SLA | Sistema ticket con breach alerts e queue tabs |
| **M6** | Appuntamenti | Scheduling con assegnazione venditori |
| **M7** | Tag & Filtri | Tagging gerarchico e filtri avanzati |
| **M8** | Outbound Webhooks | Dispatcher con retry esponenziale e DLQ |
| **M9** | Google Sheets Export | Sync real-time lead → Sheets per C-level |
| **M10** | Meta Lead Ads | Integrazione Facebook/Instagram leads |
| **M11** | Analytics Avanzati | Dashboard funnel, source analysis, velocity |

---

## Architettura

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                  │
│    Dashboard │ Pipeline │ Contacts │ Tickets │ Settings        │
├─────────────────────────────────────────────────────────────────┤
│                      Supabase Backend                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │   Edge Functions │  │    PostgreSQL    │  │   Storage     │ │
│  │ • webhook-ingest │  │ • contacts       │  │ (file upload) │ │
│  │ • meta-webhook   │  │ • deals          │  └───────────────┘ │
│  │ • ai-classify    │  │ • lead_events    │                    │
│  │ • sheets-export  │  │ • tickets        │                    │
│  └──────────────────┘  │ • meta_apps      │                    │
│                        └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Configurazione Brand

1. Accedi come CEO/Admin
2. Vai in **Settings → Gestione Brand**
3. Crea un nuovo brand con nome e slug unico

### 2. Configurazione Inbound Webhooks

1. **Settings → Webhooks → Inbound**
2. Clicca "Aggiungi Sorgente"
3. Copia l'**API Key** e l'**Endpoint URL**
4. Configura il tuo form/landing page per inviare POST

**Documentazione completa:** [docs/inbound-webhooks.md](./inbound-webhooks.md)

### 3. Configurazione Meta Lead Ads

1. **Settings → Meta Lead Ads**
2. Clicca "Aggiungi Meta App"
3. Inserisci:
   - **Brand Slug**: identificativo unico
   - **App Secret**: dalla console Meta Developer
   - **Access Token**: System User Token con permessi
   - **Page ID**: ID pagina Facebook

**Documentazione completa:** [docs/meta-lead-ads.md](./meta-lead-ads.md)

### 4. Visualizzazione Analytics

1. **Admin → Analytics Avanzati** o `/admin/analytics`
2. Seleziona il periodo con il date picker
3. Naviga tra i tab: Funnel, Fonti, Trend

**Documentazione completa:** [docs/analytics.md](./analytics.md)

---

## Navigazione Principale

| Pagina | Route | Descrizione |
|--------|-------|-------------|
| Dashboard | `/dashboard` | Overview KPI e roadmap |
| Contatti | `/contacts` | Anagrafica lead/clienti |
| Pipeline | `/pipeline` | Kanban deal stages |
| Eventi | `/events` | Timeline lead events |
| Appuntamenti | `/appointments` | Calendario appuntamenti |
| Ticket | `/tickets` | Queue gestione ticket SLA |
| Chat | `/chat` | Comunicazione team |
| Team | `/team` | Gestione membri team |
| Settings | `/settings` | Configurazioni brand |

### Admin Pages

| Pagina | Route | Accesso |
|--------|-------|---------|
| AI Configuration | `/admin/ai` | Admin, CEO |
| AI Metrics | `/admin/ai-metrics` | Admin, CEO |
| Callcenter KPI | `/admin/callcenter-kpi` | Admin, CEO |
| Ticket Trend | `/admin/ticket-trend` | Admin, CEO |
| Webhooks Monitor | `/admin/webhooks` | Admin |
| DLQ Dashboard | `/admin/dlq` | Admin |
| Analytics | `/admin/analytics` | Admin, CEO |

---

## Ruoli e Permessi (RBAC)

| Ruolo | Descrizione | Gestisce |
|-------|-------------|----------|
| **CEO** | Accesso completo a tutti i brand | Tutti i ruoli |
| **Admin** | Amministratore brand | Tutti eccetto CEO |
| **Responsabile Venditori** | Coordina venditori | Venditore |
| **Responsabile Call Center** | Coordina operatori | Operatore Call Center |
| **Venditore** | Gestisce deal e appuntamenti | - |
| **Operatore Call Center** | Gestisce contatti iniziali | - |

---

## Integrazioni

### Meta Lead Ads (M10)

Ricezione automatica lead da Facebook/Instagram Lead Ads:
- Deduplicazione per `leadgen_id`
- Fetch automatico dati contatto
- Creazione Contact + Deal
- Validazione HMAC signature

→ [Documentazione Meta](./meta-lead-ads.md)

### Google Sheets (M9)

Export real-time lead → Google Sheets:
- Tab per fonte (Meta, Generic)
- KPI dashboard automatico
- Idempotenza via DB constraint

→ [Documentazione Sheets](./google-sheets.md)

### Outbound Webhooks (M8)

Notifiche eventi a sistemi esterni:
- Retry esponenziale (1min → 24h)
- HMAC signing opzionale
- Dead Letter Queue per fallimenti

→ [Documentazione Webhooks](./inbound-webhooks.md)

---

## Database Schema (Tabelle Principali)

| Tabella | Descrizione |
|---------|-------------|
| `brands` | Multi-brand configuration |
| `contacts` | Anagrafica lead/clienti |
| `contact_phones` | Telefoni normalizzati |
| `deals` | Pipeline deal tracking |
| `pipeline_stages` | Stage configurabili per brand |
| `lead_events` | Timeline eventi (append-only) |
| `tickets` | Sistema ticketing con SLA |
| `appointments` | Scheduling appuntamenti |
| `meta_apps` | Configurazioni Meta Lead Ads |
| `meta_lead_events` | Staging table eventi Meta |
| `incoming_requests` | Audit log richieste inbound |
| `outbound_webhook_deliveries` | Log consegne outbound |

---

## Security

### Row Level Security (RLS)

Tutte le tabelle hanno RLS abilitato:
- Utenti vedono solo dati del proprio brand
- Admin vedono dati di tutti i brand assegnati
- CEO vede tutto

### API Key Authentication

- API key hashate (SHA-256) prima dello storage
- Mostrate una sola volta alla creazione
- Rotazione disponibile da UI

### HMAC Signature Verification

- Opzionale per fonte
- Anti-replay con finestra temporale
- Formato: `sha256=<hex>`

---

## Environment Variables

| Variabile | Descrizione |
|-----------|-------------|
| `VITE_SUPABASE_URL` | URL progetto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key |
| `GOOGLE_SHEETS_ENABLED` | Abilita export Sheets |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Service account JSON |
| `GOOGLE_SHEETS_FILE_ID` | ID spreadsheet |

---

## Troubleshooting

→ [Guida Troubleshooting](./troubleshooting.md)

---

## Changelog

### v11.0 - Analytics Avanzati (M11)
- Dashboard funnel pipeline con conversion rates
- Analisi performance fonti lead
- Metriche velocity (giorni medi deal)
- Trend WoW/MoM

### v10.0 - Meta Lead Ads (M10)
- Integrazione Facebook/Instagram Lead Ads
- System User Token (non scadono)
- Test lead utility

### v9.0 - Google Sheets (M9)
- Export real-time a Sheets
- KPI dashboard automatico

### v8.0 - Outbound Webhooks (M8)
- Dispatcher con retry esponenziale
- Dead Letter Queue
- HMAC signing

[... milestone precedenti ...]
