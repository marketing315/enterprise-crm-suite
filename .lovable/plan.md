
# Marketing Manager Dashboard v1 — Piano sprint-per-sprint

## Stato attuale (verificato da codice)

La pagina `/marketing` esiste (`MarketingDashboard.tsx`) con: tabs Overview/ADV/Creatives/Demographics/Website, KPI cards, mini-funnel base, BarChart canale, PieChart distribuzione, tabella canali. RPC esistenti coprono ~70% di quello che serve:

✅ `get_marketing_summary_kpis`, `get_marketing_channel_kpis`, `get_marketing_campaign_kpis`
✅ `get_ad_platform_stats_summary/_trend`, `get_ad_creative_stats`, `get_ad_demographics`
✅ `get_funnel_metrics/_breakdown/_losses`, `get_pipeline_funnel_analytics`
✅ `get_marketing_leads_by_campaign`, `get_attribution_summary`
✅ `get_appointments_by_campaign`, `get_marketing_monthly_trend`

❌ Mancano: `get_funnel_overview` (cross-stage Spend→Lead→Appt→Deal→Revenue end-to-end con per-source split), `get_leads_by_source_day` (istogramma), `get_email_campaign_kpis` (open/click rate aggregati), `get_portfolio_kpis(brand_ids[])` (cross-brand vista system).
❌ `lead_events` non in publication realtime (utile per istogramma live).
❌ Indici: `lead_events(brand_id, received_at desc, source)` e `appointments(brand_id, status, scheduled_at)`.

## Sprint plan (5 sprint, ~6-8 giorni effort)

### Sprint M1 — Backend foundation (1.5 giorni BE)
Owner: BE. Output: 4 RPC nuove + 2 indici + realtime su `lead_events`.

**Migration unica**:
- `get_funnel_overview(p_brand_ids uuid[], p_from, p_to, p_sources text[]?)` → restituisce per stage `{stage_id, stage_label, count, conversion_rate_from_prev, drop_off_pct, avg_velocity_hours}` + opzionale split per source.
- `get_leads_by_source_day(p_brand_ids uuid[], p_from, p_to, p_granularity text)` → bucket day/week/hour × source × campaign con `lead_count`, ritorna anche totale periodo per sorgente (per legenda).
- `get_email_campaign_kpis(p_brand_id uuid, p_from, p_to)` → aggregato da `email_send_log` con sent/delivered/opened/clicked/bounced/unsubscribed.
- `get_portfolio_kpis(p_brand_ids uuid[], p_from, p_to)` → wrapper che cicla brand_ids e ritorna riga per brand con KPI core (spend, lead, deal_won, revenue, ROAS, CPL).
- Indici: `idx_lead_events_brand_received_source`, `idx_appointments_brand_status_scheduled`.
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_events`.

**Sicurezza**: tutte RPC `SECURITY DEFINER`, `search_path=public`, `assert_brand_access` per ogni brand_id, grant `authenticated`.

### Sprint M2 — Funnel cross-stage component (1.5 giorni FE)
Owner: FE.

- Hook `useFunnelOverview(brandIds, from, to, sources?)` con TanStack Query, staleTime 60s.
- Componente `<FunnelCrossStage>` orizzontale (Spend → Lead → Appt → Deal → Revenue) con barre proporzionali, conversion% tra step, drop-off pct sotto. Toggle "split per source" che apre layout multi-row.
- Click su stage → side-panel drill (riusa `MarketingMiniFunnel` per pattern).
- Telemetria: `marketing.funnel.stage_hovered/clicked`.
- Sostituisce `MarketingMiniFunnel` nella tab Overview.

### Sprint M3 — Stacked histogram lead-by-source (1.5 giorni FE + 0.5 BE)
Owner: FE + BE.

- Hook `useLeadsBySourceDay(brandIds, from, to, granularity)`.
- Componente `<LeadsHistogram>` recharts stacked bar: x=bucket, y=lead_count, stack=source. Tooltip custom mostra breakdown campaign live (lazy fetch on hover via secondary query).
- Toggle granularità day/week/hour. Legenda con totali periodo per sorgente.
- Click su barra → propaga filtro sorgente al context globale Filters.
- Realtime: subscribe a `lead_events` (post Sprint M1) → invalidate query su INSERT.
- Telemetria: `marketing.histogram.live_lead_received`, `granularity_changed`.

### Sprint M4 — Gallery creativi + Email/Automation donut (1.5 giorni FE)
Owner: FE.

- `<CreativesGallery>`: griglia card creative best-performing (riusa `get_ad_creative_stats`), thumbnail + KPI (CTR, CPL, Spend, Lead). Sort dropdown per CTR/CPL/Spend/Lead. Click → modal con dettaglio + breakdown adset.
- `<EmailCampaignsCard>`: tabella template con sent/delivered/open rate/click rate (open=opened/delivered standard ESP). Click template → modal dettaglio invii (recipient hash mascherato `t***@dom.it`).
- `<AutomationDonut>`: usa `automation_jobs` aggregato (RPC nuovo o query inline) per success/failed/DLQ. Click "failed" → link admin DLQ (gated su `admin`).
- Aggiungo nuova tab `Email & Automation` o sezione in Overview (decido a vista, default: nuova tab).

### Sprint M5 — Portfolio cross-brand + polish + telemetria (1 giorno FE + 0.5 QA)
Owner: FE.

- Quando `currentBrand.id === SYSTEM_BRAND_ID`: mostra vista "Azienda Intera" con tabella `<PortfolioBrandTable>` (riga per brand: spend, lead, ROAS, CPL, mini-sparkline trend). Click brand → switch brand + redirect a `/marketing` di quel brand.
- Toggle "vs periodo precedente" e "vs YoY" su KPI cards (delta colorati verde/rosso, freccia).
- Empty states puliti (zero spesa, zero lead) per ogni card.
- Telemetria centralizzata via hook esistente (CSP-safe, no PII).
- Test: smoke E2E (login MM → naviga `/marketing` → cambio range → drill su stage funnel).
- Documentazione: `/docs/marketing-metrics.md` con formule (CPL = spend/lead, ROAS = revenue/spend, CPA = spend/deal_won).

## Vincoli safety (ricordati ad ogni sprint)

- **NO modifiche** a tabelle business (lead_events, contacts, deals, appointments, email_send_log) — solo SELECT via RPC.
- Tutte nuove RPC aggregano e ritornano numeri, **mai PII raw**. Email mascherate via helper.
- Brand isolation HARD: ogni RPC valida `assert_brand_access(brand_id)` per ogni brand passato.
- Performance: query a 90gg < 800 ms. Se sforano → indice o materialized view.
- Realtime publication su `lead_events`: monitorare CPU dopo M1 (memo: appena ridotta del 35% — verifico non risalga sopra soglia).
- Niente feature flag (rollout diretto per tua scelta).

## Definition of Done globale

- `/marketing` carica < 2s su 30gg, < 4s su 90gg.
- Funnel + histogram + creatives + email + automation tutti funzionanti su brand singolo e system brand.
- Numeri totali coincidono tra funnel (Lead step) e histogram (somma bucket) entro ±1%.
- Memory aggiornata: nuova entry `mem://features/marketing-dashboard-v1`.
- Zero security warning nuovi nel linter.

## Domande prima di partire

1. **Email/Automation in nuova tab o sezione Overview?** Spec dice card; io propongo nuova tab `Email & Automation` (Overview è già pieno). OK?
2. **Portfolio cross-brand**: ti serve già nella v1 (Sprint M5) o lo possiamo posticipare a v1.1? Sblocco 1 giorno se posticipato.
3. **Avvio**: parto subito con **Sprint M1 (backend)** in questo turno?
