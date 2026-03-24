

# SPEC: Integrazione Google Analytics 4 nella Marketing Dashboard

## Obiettivo

Integrare i dati di Google Analytics 4 (GA4) nel CRM per capire il comportamento degli utenti sul sito, identificare dove si perdono le conversioni e correlare visite/eventi con le campagne ADV attive. GTM non ha un'API diretta — i dati transitano da GA4.

## Architettura a 3 livelli

```text
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  GA4 Data   │────▸│  Edge Function   │────▸│  Tabella DB  │
│  API (read) │     │  ga4-stats-sync  │     │  ga4_stats   │
└─────────────┘     └──────────────────┘     └──────────────┘
                                                    │
┌─────────────┐     ┌──────────────────┐            │
│  CRM Events │────▸│  Edge Function   │            ▼
│  (deal won, │     │ ga4-measurement  │     ┌──────────────┐
│  lead qual) │     │ -protocol-send   │     │  Dashboard   │
└─────────────┘     └──────────────────┘     │  Tab "Sito"  │
                                              └──────────────┘
┌─────────────┐     ┌──────────────────┐
│  GTM Server │────▸│  webhook-ingest  │ (già esistente)
│  Side Tag   │     │  + mapping GTM   │
└─────────────┘     └──────────────────┘
```

## Componenti

### 1. Connessione GA4 — Credenziali

- Servono: **GA4 Property ID** e **Service Account JSON** (Google Cloud)
- Salvati come secrets: `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_JSON`
- Configurazione per brand nella tabella `brand_integrations` o campo dedicato in `brands`

### 2. Tabella `ga4_stats` (nuova)

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| brand_id | uuid FK | |
| stat_date | date | |
| sessions | integer | |
| pageviews | integer | |
| users | integer | |
| new_users | integer | |
| bounce_rate | numeric | |
| avg_session_duration | numeric | secondi |
| conversions | integer | eventi conversione GA4 |
| conversion_events | jsonb | dettaglio per evento |
| top_pages | jsonb | array [{page, views}] |
| top_sources | jsonb | array [{source, medium, sessions}] |
| top_campaigns | jsonb | array [{campaign, sessions, conversions}] |
| imported_at | timestamptz | |

### 3. Edge Function `ga4-stats-sync`

- Chiama GA4 Data API (v1beta) con Service Account
- Importa metriche giornaliere: sessions, pageviews, users, bounce_rate, conversions
- Importa dimensioni: page_path, source/medium, campaign
- Upsert in `ga4_stats` per brand + data
- Cron giornaliero (pg_cron) + sync manuale dalla dashboard
- Supporta backfill con parametri `from`/`to`

### 4. Edge Function `ga4-measurement-protocol`

- Invia eventi server-side a GA4 (Measurement Protocol v2)
- Trigger: automazione CRM (deal vinto, lead qualificato, appuntamento fissato)
- Permette a GA4 di attribuire conversioni offline alle campagne
- Usa `client_id` da `contact_tracking.fbp` o genera uno stabile

### 5. Webhook GTM Server-Side

- GTM Server-Side Container invia eventi al `webhook-ingest` esistente
- Mapping dedicato per eventi GTM (page_view, form_submit, purchase)
- I dati vengono salvati come `lead_events` con source = "gtm"
- Correlazione con contatti esistenti tramite email/telefono nei parametri

### 6. Dashboard — Nuovo Tab "Sito Web"

Aggiunto come 5° tab nella Marketing Dashboard:

**KPI Cards (riga superiore):**
- Sessioni | Utenti | Nuovi Utenti | Bounce Rate | Durata Media | Conversioni

**Grafici:**
- Trend giornaliero sessioni vs conversioni (line chart)
- Funnel landing page: Pageview → Scroll → Click CTA → Form Submit → Thank You (bar/funnel)
- Top 10 pagine per visualizzazioni (horizontal bar)
- Distribuzione sorgenti traffico (pie chart)

**Tabella campagne UTM:**
- Campaign | Source | Medium | Sessioni | Conversioni | Conv. Rate
- Correlazione con spesa ADV dalla tabella `ad_platform_stats` (join su utm_campaign)

### 7. Analisi Conversioni — "Perché non converto?"

Sezione dedicata che incrocia dati GA4 + ADV + CRM:

- **Drop-off analysis**: Impression → Click (da ADV) → Sessione (da GA4) → Lead (da CRM)
- **Landing page performance**: quali pagine convertono di più/meno
- **Suggerimenti AI**: basati sui dati, genera insight tipo "La landing X ha bounce rate 85%, CTR ADV buono ma conversione form 2% — problema nella pagina"

## File coinvolti

| File/Risorsa | Azione |
|---|---|
| Migration SQL | Tabella `ga4_stats` + RLS + RPC aggregate |
| `supabase/functions/ga4-stats-sync/index.ts` | Nuova Edge Function |
| `supabase/functions/ga4-measurement-protocol/index.ts` | Nuova Edge Function |
| `src/hooks/useGa4Stats.ts` | Hook per query GA4 |
| `src/components/marketing/Ga4StatsTab.tsx` | Nuovo tab dashboard |
| `src/components/marketing/Ga4KpiCards.tsx` | KPI cards sito |
| `src/components/marketing/Ga4TrendChart.tsx` | Trend chart |
| `src/components/marketing/Ga4SourcesChart.tsx` | Sources pie |
| `src/components/marketing/Ga4PagesTable.tsx` | Top pages |
| `src/components/marketing/Ga4ConversionAnalysis.tsx` | Drop-off analysis |
| `src/pages/marketing/MarketingDashboard.tsx` | Aggiunta tab "Sito Web" |
| Secrets | `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_JSON`, `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` |

## Prerequisiti dall'utente

1. Creare un progetto Google Cloud con GA4 Data API abilitata
2. Creare un Service Account e scaricare il JSON
3. Dare accesso in lettura al Service Account nella proprietà GA4
4. Fornire il Property ID di GA4
5. (Per Measurement Protocol) Creare un API Secret in GA4 Admin → Data Streams
6. (Per GTM Server-Side) Configurare un tag Custom HTTP che invia a `webhook-ingest`

## Ordine di implementazione suggerito

1. Tabella + RLS + secrets
2. Edge Function `ga4-stats-sync` + cron
3. Hook + Tab dashboard con KPI e grafici
4. Edge Function `ga4-measurement-protocol`
5. Mapping GTM nel webhook-ingest
6. Sezione analisi conversioni con AI insights

