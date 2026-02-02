

# Piano: Import Statistiche Meta Ads - MVP

## Obiettivo
Importare automaticamente statistiche pubblicitarie da Meta Ads, collegandole alle campagne marketing tramite `marketing_campaigns.external_id` con formato `meta:<campaign_id>`.

---

## Correzioni Applicate

| Issue | Correzione |
|-------|------------|
| Tipo canali | Manteniamo `paid/organic/offline`. Aggiungiamo `platform` + `channel_subtype` su `marketing_channels` |
| RLS ad_platform_stats | SELECT: `has_marketing_access()`. INSERT/UPDATE/DELETE: solo service role |
| marketing_costs.description | Confermato: il campo corretto è `notes` (già presente) |
| Campi extra | Aggiungiamo `currency` e `account_id` su `ad_platform_stats` |
| Fallback matching | Aggiungiamo `allow_name_fallback` su `marketing_campaigns` |

---

## Fase 1: Migrazioni Database

### 1.1 Tabella `ad_platform_stats`

```text
┌─────────────────────────────────────────────────────────────┐
│                    ad_platform_stats                        │
├─────────────────────────────────────────────────────────────┤
│ id                    UUID PK                               │
│ brand_id              UUID FK → brands                      │
│ campaign_id           UUID FK → marketing_campaigns (null)  │
│ platform              ad_platform ENUM (meta, google)       │
│ account_id            TEXT (ad account ID)                  │
│ external_campaign_id  TEXT                                  │
│ external_campaign_name TEXT                                 │
│ stat_date             DATE                                  │
│ currency              TEXT DEFAULT 'EUR'                    │
│ spend                 NUMERIC                               │
│ impressions           INTEGER                               │
│ clicks                INTEGER                               │
│ ctr                   NUMERIC (computed)                    │
│ cpm                   NUMERIC (computed)                    │
│ cpc                   NUMERIC (computed)                    │
│ conversions           NUMERIC (nullable)                    │
│ conversions_value     NUMERIC (nullable)                    │
│ raw_data              JSONB                                 │
│ imported_at           TIMESTAMPTZ                           │
├─────────────────────────────────────────────────────────────┤
│ UNIQUE (brand_id, platform, account_id, external_campaign_id, stat_date) │
│ INDEX (brand_id, stat_date)                                 │
│ INDEX (brand_id, platform, stat_date)                       │
└─────────────────────────────────────────────────────────────┘
```

**RLS Policies:**
- SELECT: `has_marketing_access(get_user_id(auth.uid()), brand_id)`
- INSERT/UPDATE/DELETE: nessuna policy (solo service role via edge function)

### 1.2 Estensione `meta_apps`

Aggiungiamo:
- `ad_account_id TEXT` - ID Ad Account Meta (es. `act_12345`)
- `stats_enabled BOOLEAN DEFAULT false` - Abilita import statistiche

### 1.3 Estensione `marketing_channels`

Aggiungiamo (per future espansioni):
- `platform ad_platform_type ENUM` - `meta`, `google`, `tiktok`, `linkedin`, `other` (nullable)
- `channel_subtype TEXT` - `social`, `search`, `display`, `remarketing` (nullable)

### 1.4 Estensione `marketing_campaigns`

Aggiungiamo:
- `allow_name_fallback BOOLEAN DEFAULT false` - Abilita matching per nome (solo se univoco)

### 1.5 RPC Aggregazione

Funzione `get_ad_platform_stats`:
- Parametri: `p_brand_id`, `p_from`, `p_to`, `p_platform` (nullable)
- Ritorna: aggregati per campagna con CTR/CPM/CPC calcolati

---

## Fase 2: Edge Function `ads-stats-meta`

### Flusso

```text
┌─────────────────────────────────────────────────────────────┐
│                    ads-stats-meta                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Verifica CRON_SECRET header                              │
│ 2. Leggi meta_apps WHERE stats_enabled = true               │
│ 3. Per ogni meta_app:                                       │
│    a. Chiama Meta Insights API                              │
│    b. Normalizza metriche                                   │
│    c. Upsert in ad_platform_stats                           │
│    d. Match con marketing_campaigns.external_id             │
└─────────────────────────────────────────────────────────────┘
```

### API Meta Chiamata

```text
GET https://graph.facebook.com/v20.0/act_{ad_account_id}/insights
  ?fields=campaign_id,campaign_name,spend,impressions,clicks,actions
  &level=campaign
  &time_increment=1
  &date_preset=yesterday
```

### Matching Campagne

1. Cerca `marketing_campaigns` dove `external_id = 'meta:{campaign_id}'`
2. Se non trovato e `allow_name_fallback = true` su qualche campagna: cerca per nome univoco
3. Altrimenti: `campaign_id = NULL` (stats orfane, visibili ma non aggregate)

### Gestione Errori

- Token scaduto → log + skip meta_app
- Rate limit → retry con backoff
- Network error → retry 3 volte

---

## Fase 3: Interfaccia Utente

### 3.1 Settings Meta Apps (modifica esistente)

Aggiungiamo al form `MetaAppFormDrawer.tsx`:
- Campo `Ad Account ID` (input text, placeholder: `act_123456789`)
- Toggle `Abilita import statistiche ADV`

### 3.2 Hook `useAdPlatformStats`

```typescript
useAdPlatformStats({
  fromDate: string,
  toDate: string,
  platform?: 'meta' | 'google' | null,
  campaignId?: string
})
```

Ritorna: array di stats + aggregati summary

### 3.3 Tab "Statistiche ADV" in MarketingDashboard

```text
┌─────────────────────────────────────────────────────────────┐
│  📊 Statistiche ADV                                         │
├─────────────────────────────────────────────────────────────┤
│  [Filtro: Meta ▼] [Filtro: Data da-a]                       │
├─────────────────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│  │ Spend  │ │ Impr.  │ │ Click  │ │ CTR    │ │ CPC    │     │
│  │ €5,234 │ │ 125K   │ │ 3,456  │ │ 2.8%   │ │ €1.51  │     │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘     │
├─────────────────────────────────────────────────────────────┤
│  [Grafico trend giornaliero: Spend + Click]                 │
├─────────────────────────────────────────────────────────────┤
│  | Campagna        | Spend  | Impr.  | Click | CTR   | CPC  │
│  |---------------------------------------------------------│
│  | Estate 2026     | €2,100 | 52,000 | 1,456 | 2.8%  | €1.44│
│  | Lancio Prodotto | €1,800 | 45,000 | 1,200 | 2.7%  | €1.50│
│  | Brand Awareness | €1,334 | 28,000 | 800   | 2.9%  | €1.67│
├─────────────────────────────────────────────────────────────┤
│  ⏱️ Ultimo import: 02/02/2026 02:30                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Fase 4: Schedulazione

### Cron Edge Function

Configuriamo in `supabase/config.toml`:
```toml
[functions.ads-stats-meta]
verify_jwt = false
```

Chiamata schedulata (da configurare via Supabase Dashboard o pg_cron):
- **Daily** (02:30 UTC): Import statistiche di ieri
- **Monthly** (1° del mese, 03:00 UTC): Riconciliazione mese precedente

### Endpoint Manuale

La edge function accetta anche:
- `?date=YYYY-MM-DD` per import specifico
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` per range

---

## File da Creare

| File | Descrizione |
|------|-------------|
| `supabase/functions/ads-stats-meta/index.ts` | Edge function import Meta |
| `src/types/adPlatform.ts` | Tipi TypeScript per stats ADV |
| `src/hooks/useAdPlatformStats.ts` | Hook fetch stats |
| `src/components/marketing/AdStatsTab.tsx` | Tab container |
| `src/components/marketing/AdStatsKpiCards.tsx` | KPI cards (Spend, Click, CTR...) |
| `src/components/marketing/AdStatsTrendChart.tsx` | Grafico trend |
| `src/components/marketing/AdStatsTable.tsx` | Tabella per campagna |

## File da Modificare

| File | Modifica |
|------|----------|
| `src/hooks/useMetaApps.ts` | Aggiungere campi `ad_account_id`, `stats_enabled` |
| `src/components/settings/meta/MetaAppFormDrawer.tsx` | Form per `ad_account_id` + toggle stats |
| `src/types/marketing.ts` | Estendere tipi canali con `platform`, `channel_subtype` |
| `src/pages/marketing/MarketingDashboard.tsx` | Aggiungere Tab "Statistiche ADV" |
| `supabase/config.toml` | Aggiungere `[functions.ads-stats-meta]` |

---

## Formato external_id

**Convenzione adottata:** `meta:<campaign_id>`

Esempi:
- Meta campaign ID `120212345678901` → `external_id = 'meta:120212345678901'`
- Google campaign ID `12345678` → `external_id = 'google:12345678'` (fase successiva)

Quando l'utente crea una campagna nel CRM e vuole collegarla a Meta:
1. Copia il Campaign ID dalla Meta Ads Manager
2. Lo inserisce nel campo "ID Esterno" con prefisso `meta:`
3. L'import automatico aggancerà le statistiche

---

## Prerequisiti Utente

Prima di attivare l'import, l'utente deve:

1. **Configurare l'Ad Account Meta:**
   - Andare in Settings → Meta Apps
   - Modificare la Meta App esistente
   - Inserire l'`Ad Account ID` (formato: `act_123456789`)
   - Abilitare "Import statistiche ADV"

2. **Verificare permessi token:**
   - Il System User token deve avere `ads_read` e `read_insights`
   - L'Ad Account deve essere assegnato al System User

3. **Collegare le campagne:**
   - Per ogni campagna nel CRM, inserire `external_id = 'meta:<campaign_id>'`
   - Il Campaign ID si trova nella Meta Ads Manager

---

## Ordine di Implementazione

1. **Migrazione DB** - Creo tabella + estensioni + RLS
2. **Tipi TypeScript** - `src/types/adPlatform.ts`
3. **Edge Function** - `ads-stats-meta` con logica import
4. **Form Meta Apps** - Campi `ad_account_id` + `stats_enabled`
5. **Hook stats** - `useAdPlatformStats`
6. **UI Tab ADV** - KPI + Chart + Table
7. **Test manuale** - Import 1 giorno, verifica KPI

---

## Note Tecniche

- **Idempotenza:** Upsert con constraint UNIQUE previene duplicati
- **Timezone:** Date in UTC, conversione lato display
- **Rate limits:** Meta 200 req/h - gestiti con retry esponenziale
- **Audit:** `raw_data` JSONB conserva payload originale
- **Metriche calcolate:** CTR, CPM, CPC calcolati lato frontend per flessibilità

