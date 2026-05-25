## Obiettivo
Chiudere i punti aperti del rollout Dashboard Performance (spec v6 §6, §5.1, §4.3, §9) sviluppando 5 work-stream paralleli ma indipendenti. Tutte le modifiche DB sono **additive** (no drop/truncate), retro-compatibili e gated da feature-flag dove cambiano semantica utente-visibile.

---

## WS-A · F5.8 — Cohort-based % consegne + scorporo IVA per riga

### A.1 Modello dati (additive)
- `sales_orders.signed_at timestamptz` (nullable, default `confirmed_at` se NULL via trigger backfill soft). Identifica la **data di firma** dell'ordine = chiave della coorte. Già esistono `confirmed_at`/`created_at`, ma il nome è esplicito per evitare ambiguità.
- View `v_sales_orders_with_taxable` che espone, oltre alle colonne esistenti:
  - `taxable_amount_flat` = `total_amount / 1.22` (compat foglio storico)
  - `taxable_amount_itemized` = `Σ items.amount / (1 + items.vat_rate)` quando **tutte** le `sales_order_items` di un ordine hanno `vat_rate NOT NULL`; altrimenti `NULL` (fallback flat).
  - `taxable_amount_effective` = COALESCE(itemized, flat). È la colonna usata di default; UI mostra badge "per-riga" o "scorporo 22%" in base a quale ha vinto.
- Nessuna modifica a `sales_orders.taxable_amount` esistente (resta come override manuale di Amministrazione, max priorità).

### A.2 RPC `get_salesperson_kpis_v2` — nuovi output
Aggiungere (senza rimuovere) le colonne:
- `delivered_count_period` (corrente: consegne con `delivered_at ∈ P`)
- `delivered_amount_period`
- `delivered_count_cohort` (consegne dove `signed_at ∈ P AND delivered_at ≤ as_of_date`)
- `delivered_amount_cohort`
- `cohort_orders_count` (denominatore coorte = ordini firmati in P)
- `pct_delivered_on_sold_period` = `delivered_count_period / orders_count` (formula attuale, foglio)
- `pct_delivered_on_sold_cohort` = `delivered_count_cohort / cohort_orders_count`
- `taxable_basis` ('flat_22' | 'itemized' | 'mixed') — info per UI

Idem per `get_salesperson_kpis_aggregate` (riga TOTALI).

Parametro nuovo opzionale `p_taxable_mode text default 'effective'` ∈ {`effective`, `flat`, `itemized`}.

### A.3 UI Foglio Venditori
- `SalesPerformanceSheet`: aggiungere toggle "Metrica consegne" con 3 valori: **Di periodo** (default attuale), **Di coorte** (firma in P), **Entrambe** (mostra 2 colonne affiancate #16a / #16b con tooltip esplicativo).
- Aggiungere toggle "IVA": `Auto (per-riga se disponibile)` / `Flat 22%` / `Per riga`.
- Badge in header tabella che indica il `taxable_basis` aggregato del dataset corrente.
- `SalespersonDrilldown`: mostra esplicitamente le due % consegne e l'ageing della coorte (firmati ma non consegnati a oggi).

### A.4 Docs
- `mem://features/f5-8-cohort-delivery-vat`
- Aggiornare `docs/admin-runbook.md` §F5.8 con esempi BITTO (2 consegnati su 0 ordini di coorte → "—" anziché 0%, eliminando il famoso #DIV/0 del foglio).

---

## WS-B · F6 — Wallboard live VoiSpeed (realtime vero)

### B.1 Modello dati (additive)
```sql
CREATE TABLE public.voispeed_agent_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  user_id uuid REFERENCES public.users(id),
  voispeed_ext text NOT NULL,
  status text NOT NULL CHECK (status IN ('available','on_call','paused','wrap_up','offline','ringing','dnd')),
  queue_name text,
  since timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, voispeed_ext)
);

CREATE TABLE public.voispeed_queue_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  queue_name text NOT NULL,
  stat_ts timestamptz NOT NULL DEFAULT now(),
  calls_waiting int DEFAULT 0,
  longest_wait_seconds int DEFAULT 0,
  agents_available int DEFAULT 0,
  agents_busy int DEFAULT 0,
  service_level_pct numeric(5,2),
  abandoned_15m int DEFAULT 0
);

CREATE INDEX ON public.voispeed_queue_stats (brand_id, queue_name, stat_ts DESC);
```
- RLS: brand-scoped via `has_brand_access`; insert solo da `service_role` / `INTERNAL_SERVICE_TOKEN` (edge fn).
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.voispeed_agent_status, public.voispeed_queue_stats;`
- `voispeed_agent_status` con `REPLICA IDENTITY FULL` per realtime diff.

### B.2 Edge function `voispeed-events-webhook` (estensione)
Già esiste per DID enrichment su `call_logs`. Aggiungere handler per nuovi event_type:
- `agent_state_changed` → upsert `voispeed_agent_status` (chiave `brand_id+voispeed_ext`), aggiornando `since` solo a cambio stato.
- `queue_stats` → INSERT in `voispeed_queue_stats` (append-only, retention 7gg via cron).
- `call_ringing` → upsert su `incoming_calls` esistente (rumore minimo).
- HMAC + replay-guard già attivi (C8).

### B.3 Cron retention (`cron-relay`)
- Cleanup giornaliero `voispeed_queue_stats` >7gg.
- Snapshot riassuntivo orario in `voispeed_queue_stats_hourly` (opzionale F6.1, fuori scope MVP).

### B.4 UI `/callcenter/wallboard`
- Sostituire il polling 15-60s con `useGlobalRealtime` su `voispeed_agent_status` + `voispeed_queue_stats`.
- Mantenere comunque un `refetchInterval` di fallback (5min) per gli aggregati KPI da `get_operator_kpis` (che restano polling).
- Nuovo pannello **"Stato operatori live"**: lista venditori call center con badge stato colorato (verde=available, blu=on_call, giallo=paused, rosso=offline) + `since` (es. "in chiamata da 02:14").
- Nuovo pannello **"Code in tempo reale"**: una card per `queue_name` con `calls_waiting`, `longest_wait_seconds` (timer live), `agents_available`, mini-grafico ultimi 30min.
- Toggle "Modalità TV" (fullscreen, font XL, refresh visivo ogni 1s) per uso su monitor sala.

### B.5 Connessione VoiSpeed reale
- L'implementazione lato CRM **non assume** che VoiSpeed pushi spontaneamente: predisporre anche un **polling adapter** lato edge (`voispeed-status-poll`, cron 10s con `cron-relay` short-tick) che chiama `/agents/status` e `/queues/stats` se l'account VoiSpeed non supporta webhook real-time. Toggle via `voispeed_configs.enable_realtime_webhook bool`.
- Documentare in `docs/voispeed-integration.md` §F6 le due modalità.

---

## WS-C · Centralino avanzato VoiSpeed (IVR + instradamento)

Estensione naturale di WS-B:

### C.1 Modello dati
```sql
CREATE TABLE public.voispeed_ivr_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  voispeed_ivr_id text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.voispeed_ivr_nodes(id),
  routes_to_queue text,
  routes_to_ext text,
  synced_at timestamptz DEFAULT now(),
  UNIQUE (brand_id, voispeed_ivr_id)
);

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS queue_name text,
  ADD COLUMN IF NOT EXISTS wait_seconds int,
  ADD COLUMN IF NOT EXISTS talk_seconds int,
  ADD COLUMN IF NOT EXISTS ivr_path text;  -- breadcrumb es. "Menu>Vendite>Lombardia"
```

### C.2 Edge `voispeed-ivr-sync` (cron giornaliero)
- Pull configurazione IVR + code da VoiSpeed (`/ivr`, `/queues`).
- Upsert in `voispeed_ivr_nodes`.
- Append-only log in `ad_sync_log` con outcome.

### C.3 UI Settings `/settings/voispeed` (nuova sub-tab "Centralino")
- Albero IVR navigabile (read-only, sync da VoiSpeed).
- Tabella code con `tracking_numbers` collegati (matching su `queue_name`).
- Pulsante "Risincronizza ora" (admin only, rate-limited 1/min).

---

## WS-D · Multi-touch attribution (foundation)

Non sostituisce single-touch first-touch; **affianca** un layer pesato. Resta opt-in per brand (feature flag `brand_settings.attribution_mode ∈ {single_touch, multi_touch}`).

### D.1 Modello dati
```sql
ALTER TABLE public.lead_campaign_attribution
  ADD COLUMN touch_index int NOT NULL DEFAULT 1,            -- 1=first, n=ultimo
  ADD COLUMN touch_weight numeric(5,4) NOT NULL DEFAULT 1.0,-- 0..1, somma per lead=1
  ADD COLUMN touch_type text DEFAULT 'first',               -- first|middle|last
  ADD COLUMN attribution_model text DEFAULT 'first_touch';  -- first_touch|last_touch|linear|u_shape|time_decay

CREATE INDEX IF NOT EXISTS ix_lca_lead_touch ON public.lead_campaign_attribution (lead_event_id, touch_index);
```
- Backfill no-op: tutte le righe esistenti già `touch_index=1, weight=1.0, model=first_touch`.

### D.2 RPC `recompute_lead_attribution(p_brand_id, p_model, p_from, p_to)`
- Riproduce le righe applicando il modello scelto (linear=1/n, u_shape=40/20/40, time_decay=exp(-λ·days_ago)) su tutti i touch raccolti per ogni lead (sorgente dati: `contact_tracking` + `meta_lead_sources` + chiamate inbound).
- Idempotente: cancella e riscrive solo righe del periodo con `attribution_model != 'first_touch'` (preserva il baseline).
- Append-only audit su `audit_events`.

### D.3 UI `/marketing/performance`
- Toggle modello attribuzione (visibile solo CEO/Admin/Amministrazione).
- Badge "Modello: first_touch (default)" / "linear" / etc.
- I numeri CPL/CAC restano "ufficiali" su first_touch; il modello scelto è una vista alternativa con disclaimer.

### D.4 Limiti dichiarati
- Non tocca `v_lead_cost` (continua single-touch); il multi-touch è disponibile via nuova RPC `get_channel_performance_weighted`.
- Le ricostruzioni storiche profonde (>90gg) sono on-demand, non in cron.

---

## WS-E · GDPR consent capture (CTI/IVR attivo)

### E.1 Modello dati
```sql
CREATE TABLE public.call_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  call_log_id uuid REFERENCES public.call_logs(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id),
  consent_action text NOT NULL CHECK (consent_action IN (
    'ivr_announcement_played',     -- avviso registrazione riprodotto
    'ivr_consent_given',           -- DTMF 1 = acconsento
    'ivr_consent_denied',          -- DTMF 2 = nego
    'verbal_consent_logged',       -- operatore ha registrato consenso verbale
    'consent_withdrawn',           -- ritiro consenso post-chiamata
    'recording_disabled_by_consent'
  )),
  source text NOT NULL CHECK (source IN ('ivr','operator','self_service','admin')),
  evidence_url text,               -- snippet audio dell'avviso/risposta
  dtmf_input text,
  legal_basis text DEFAULT 'consent',  -- consent|legitimate_interest
  policy_version text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid REFERENCES public.users(id)
);

CREATE INDEX ON public.call_consent_events (contact_id, recorded_at DESC);
CREATE INDEX ON public.call_consent_events (call_log_id);
```
- RLS: brand-scoped read; insert via edge `voispeed-events-webhook` (IVR) o RPC `log_call_consent` (operatore).

### E.2 Pipeline
1. **IVR announcement**: VoiSpeed riproduce avviso ("la chiamata può essere registrata, premi 1 per acconsentire") → evento `ivr_announcement_played` → `voispeed-events-webhook` lo registra.
2. **DTMF**: il digit del cliente → `ivr_consent_given/denied`.
3. **Se denied**: edge fn imposta `call_logs.recording_disabled=true` + `call_transcripts.consent_status='denied'` → la pipeline `call-transcribe` **skip** (già rispetta `consent_status`).
4. **Withdrawal post-chiamata**: nuova RPC `withdraw_call_consent(p_contact_id, p_reason)` che marca consent_withdrawn e accoda cleanup audio/transcript via `run_data_retention_cleanup` (F5.7).

### E.3 Configurazione brand
- `brand_settings.recording_legal_basis text default 'consent'` (`consent` o `legitimate_interest`).
- `brand_settings.ivr_announcement_audio_url text` (URL del file audio personalizzato).
- `brand_settings.ivr_consent_required bool default false` — se `true`, NESSUNA chiamata viene registrata senza consenso esplicito.

### E.4 UI
- Nuova tab **`/settings/privacy/call-consent`** (CEO/Admin/Amministrazione):
  - Stato corrente legal basis + audio IVR.
  - Upload audio annuncio (Supabase Storage `privacy-assets/{brand_id}/ivr-consent.mp3`).
  - Versionamento `policy_version` per audit.
- Su `CallTranscriptsSection` (contatto): badge consenso ("✅ Consenso 11/05/2026 via IVR" / "❌ Negato" / "⚠️ Base: legittimo interesse").
- Pulsante "Ritira consenso" (admin/CEO) che attiva cleanup retroattivo.

### E.5 Documentazione
- Aggiornare `docs/dpia-call-recordings.md` §3 (consent capture flow) e §4 (audit evidence).
- Nuova memoria `mem://features/gdpr-call-consent-capture`.

---

## Ordine di esecuzione consigliato

1. **WS-A (F5.8)** — bassissimo rischio, sblocca discrepanze foglio (BITTO 0% vs 8%). 1 migrazione + UI toggle.
2. **WS-E (GDPR)** — prerequisito normativo prima di estendere registrazioni in F6.
3. **WS-B (F6 wallboard realtime)** — sostituisce polling.
4. **WS-C (IVR sync)** — sopra le tabelle di WS-B.
5. **WS-D (multi-touch)** — opzionale, può slittare; è infrastrutturale per evoluzioni 2026 H2.

## Fuori scope
- Auto-impostazione AI degli stati ordine (§6.2.1 "Bot AI futuro").
- Cohort per metriche non-consegna (% acconto coorte, ecc.) — solo consegne in MVP.
- Voice biometrics / identificazione speaker oltre la diarizzazione già attiva (F3).

## Conferme richieste
1. **WS-A**: ok rendere `effective` (per-riga quando disponibile) il default IVA, con flat 22% come fallback automatico + override manuale Amministrazione?
2. **WS-B**: l'account VoiSpeed supporta webhook real-time per `agent_state_changed`/`queue_stats`, oppure devo procedere direttamente con il **polling adapter** 10s come fallback unico?
3. **WS-D**: avviare già il modello multi-touch o tenerlo come scheletro DB + RPC senza UI (solo prep)?
4. **WS-E**: legal basis preferita di default — **consent esplicito DTMF** (più tutelante, può ridurre il pool registrato) o **legittimo interesse** con avviso (registra tutto, opt-out su richiesta)?