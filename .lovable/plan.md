# Marketing: gruppi inserzioni + attribuzione manuale lead

Due interventi separati, entrambi su brand già in uso (MyMed in primis).

---

## A) Vedere i Gruppi di inserzioni in "Statistiche ADV"

Oggi `ad_platform_stats` salva una riga per **campagna/giorno**. Meta espone anche il livello **adset** (gruppo di inserzioni). L'API `ads-stats-meta` già scarica le inserzioni (livello `ad`) per i creativi, ma NON gli adset.

### Cosa faccio

1. **DB** — nuova tabella `ad_platform_adset_stats` (parallela a `ad_platform_stats`):
   - `external_adset_id`, `external_adset_name`, `external_campaign_id`, `external_campaign_name`
   - metriche: `spend, impressions, clicks, reach, frequency, conversions`
   - chiave unica `(brand_id, platform, account_id, external_adset_id, stat_date)`
   - RLS identica (`has_marketing_access`)
2. **Edge `ads-stats-meta`** — aggiunta chiamata Insights con `level=adset` e upsert su nuova tabella (stesso ciclo brand/chunk già in essere).
3. **RPC** — `get_ad_adset_stats(p_brand_id, p_from, p_to, p_platform, p_campaign_id)` che aggrega per adset.
4. **UI** — in `AdStatsTab`:
   - quando l'utente seleziona **una campagna** dal filtro, sotto la tabella campagne appare una nuova sezione "Gruppi di inserzioni" con tabella (nome adset, spesa, impr., reach, CPL, lead). 
   - Se nessuna campagna è selezionata, la sezione resta collassata con CTA "Seleziona una campagna per vedere i gruppi di inserzioni".
5. **Backfill** — bottone "Sync storica Meta" già esistente: lo estendo per popolare anche gli adset nello stesso ciclo (no nuovo bottone).

Google Ads: per ora resta solo livello campagna (l'API Google ha "ad_group" — lo aggiungo in un secondo giro se serve).

---

## B) Attribuire manualmente un lead a una campagna

Oggi `lead_events.marketing_campaign_id` esiste ma viene compilato solo in alcuni webhook. Se un lead arriva da un sorgente non riconosciuto (es. Quiz funnel, WordPress, CallAI…), nessuno lo lega a una campagna ADV → KPI "lead da Meta" lo esclude.

### Cosa faccio

1. **DB** — nessuna nuova colonna, uso `lead_events.marketing_campaign_id` già esistente. Aggiungo trigger di audit su update (chi ha riassegnato, quando, da quale campagna a quale).
2. **RPC** — `set_lead_event_campaign(p_event_id, p_campaign_id)`:
   - controllo brand-scoped (`assert_brand_access`)
   - log su `audit_log_unified`
   - rate-limit standard
3. **UI nel ContactDetailSheet → sezione "Storico lead"**:
   - per ogni `lead_event` mostro un piccolo badge "Campagna: {nome}" oppure "Non attribuita"
   - icona matita → popover con `Combobox` campagne del brand (filtro per nome) + opzione "Nessuna" → salva via RPC
   - feedback con `useMutationFeedback` standard
4. **Bulk attribution (admin/marketing)** — nella pagina `/marketing/leads` aggiungo:
   - colonna "Campagna" 
   - selezione multipla → azione "Attribuisci a campagna…" (Combobox stesso pattern)
   - utile per fissare in massa "Quiz funnel - Prova Gratuita" → campagna "Quiz Fibromialgia"
5. **Effetto KPI** — i conteggi "lead da Meta" in Statistiche ADV usano già `marketing_campaign_id` quando presente (cambio la RPC `get_ad_platform_stats_summary` per preferire join via `marketing_campaign_id` invece del solo `ILIKE source_name`). Fallback al match per nome resta per retrocompatibilità.

---

## Dettagli tecnici

```text
ad_platform_adset_stats
  brand_id, platform, account_id,
  external_campaign_id, external_campaign_name,
  external_adset_id, external_adset_name,
  stat_date, spend, impressions, clicks, reach, frequency,
  conversions, raw_data
  UNIQUE(brand_id, platform, account_id, external_adset_id, stat_date)
```

Edge call Meta:
`/{ad_account}/insights?level=adset&fields=campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks,reach,frequency&time_range=...&time_increment=1`

RPC `set_lead_event_campaign(event_id uuid, campaign_id uuid|null)` — SECURITY DEFINER, search_path=public, brand check, audit append, rate-limit `consume_critical_rate_limit('set_lead_event_campaign', 60, 15)`.

UI: `MarketingLeads.tsx` aggiunge colonna + bulk bar; `ContactDetailSheet → ContactLeadDataSection` aggiunge il selector inline.

---

## Fuori scope

- Livello "ad" in tabella (esiste già `AdCreativesTab`)
- Google Ads ad_group breakdown (rimando)
- Riscrittura attribuzione automatica via regex (è la sol. (3) discussa prima)

Procedo?
