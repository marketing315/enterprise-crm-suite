# Dashboard Performance — Piano di consegna (vivo)

> Stato: F0 in corso. Aggiornato 2026-05-21.

## Decisioni vincolanti
Salvate in `mem://features/dashboard-performance/decisions`.

| Tema | Decisione |
|------|-----------|
| % cons su vend (#16) | Di periodo (consegne/ordini, individuale e totale) |
| Imponibile (#19) | Scorporo flat 22% (lordo/1,22) |
| Premi venditori | Base lorda, soglie versionate (`sales_bonus_tiers.valid_from/to`) |
| Giorni lavorati / lavorativi mese | Auto calendario IT + override manuale per brand |
| Lifecycle ordine | Multi-attore: CC, Venditore (suoi), Amministrazione, Bot AI |
| Visibilità costi/CPL/CAC | Solo CEO + Admin + Amministrazione (`has_finance_access`) |
| Attribuzione | Single-touch first-touch, precedenza Phone>Meta>UTM>Webhook>Group>Manuale>Organico |
| Naming campagne | Alias interno `marketing_campaigns.name` editabile (ext_id read-only) |
| Costi TV granularità | Per emittente / giorno + `cost_kind` (media/production/agency/other) |
| Provider STT | OpenAI Whisper API via Lovable AI Gateway |
| GDPR registrazione | Decisione rimandata a F3 (campo `consent_status` pronto) |
| Retention audio/trascrizioni | NESSUN limite hard-coded, configurabile da Impostazioni |

## Roadmap

| Fase | Stato | Contenuto |
|------|-------|-----------|
| **F0** Fondamenta fonte | ✅ Migration applicata + pagina `/admin/tracking-numbers` live | `tracking_numbers` + estensioni `marketing_campaign_groups`/`lead_campaign_attribution`/`webhook_sources`/`marketing_costs` + CRUD numeri |
| **F1** Canali & Costi (Modulo A) | ✅ Consegnato | Viste `v_channel_spend_daily` + `v_lead_cost`, RPC `get_channel_performance` (RLS via `has_finance_access`), pagina `/marketing/performance` con KPI roll-up + tabella canale + tree-picker (categoria/canale/campagna) + import CSV costi (granularità giorno × cost_kind × emittente) |

| **F2** Call Center base (Modulo B) | ⏳ Dopo F1 | Edge `voispeed-webhook`, estensioni `call_logs`, wallboard, tab Telefonia, KPI operatori |
| **F4** Venditori (Modulo C) | ⏳ Parallelo a F2 | Enum `order_lifecycle_status`, `sales_bonus_tiers`, RPC `get_salesperson_kpis_v2`+`_aggregate`, UI "vista Foglio" 1:1 ESITO APPUNTAMENTI |
| **F3** Trascrizione + Sentiment | ⏳ Dopo F2 | Whisper API, `call-transcribe`, `call-sentiment`, estensioni `call_transcripts`, UI player+trascrizione, decisione GDPR |
| **F5** Rifiniture | ⏳ Finale | Viste materializzate, confronti A/B avanzati, alert/anomalie, export Sheets, DPIA |

## Convenzioni cross-cutting
- Tutte le migrations sono additive (rispetta `mem://constraint/appointments-data-safety`).
- `p_source_filter jsonb` con shape `{ category?, channel_id?, campaign_id?, group_id?, tracking_number_id? }` su ogni RPC dei 3 moduli — validato lato client con `SourceFilterSchema` (Zod).
- RLS brand-scoped via `has_finance_access(get_user_id(auth.uid()), brand_id)` per dati sensibili (costi/CPL).
- Ogni fase: preview → review utente → publish manuale.

## File modificati F0
- `supabase/migrations/*` — nuova tabella `tracking_numbers` + estensioni 4 tabelle esistenti
- `src/components/shared/SourceFilterBar.tsx` — componente + Zod schema condiviso
- `mem://features/dashboard-performance/decisions.md` — decisioni vincolanti
- `mem://index.md` — riferimento alle decisioni
