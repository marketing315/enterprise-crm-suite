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

| **F2** Call Center base (Modulo B) | ✅ Consegnato | `call_logs.dnis+tracking_number_id`, RPC `get_operator_kpis` + `get_tracking_number_performance`, `voispeed-events-webhook` DID enrichment, pagina `/callcenter/wallboard` (poll 30s), sezione "Performance per numero verde" su `/marketing/performance` |
| **F3** Trascrizione + Sentiment | ✅ Consegnato | `call_transcripts` esteso (sentiment/outcome/intent/decision/objection/clinical_interest/quality/keywords/consent/stt_status), edge `call-transcribe` (Whisper API + Gemini tool-call), RPC `list_call_transcripts` + `enqueue_call_transcript`, cron sweeper ogni 5min, pagina `/callcenter/transcripts` con filtri (sentiment/esito/periodo/full-text italiano) + sheet di dettaglio, sezione contatto arricchita con badge sentiment/esito. Consenso: flag `granted/denied/unknown` (processa sempre). Retention configurabile. |
| **F4** Venditori (Modulo C) | ✅ Consegnato | Enum `order_lifecycle_status` (multi-attore CC/Venditore/Amministrazione/Bot AI), `sales_orders` esteso (`lifecycle_status`/`lifecycle_actor_role`/`signed_at`/`delivered_at`), tabella append-only `sales_order_lifecycle_events`, `sales_bonus_tiers` versionati (valid_from/to) brand-scoped, helper `compute_bonus_for_amount`, RPC `get_salesperson_kpis_v2`+`get_salesperson_kpis_aggregate` (vista Foglio: programmati/eseguiti/no-show/cancellati/% esecuzione/ordini/% vendita/lordo/imponibile lordo÷1,22/% consegne/bonus tier). Pagina `/sales/performance-sheet` con tabella 1:1 ESITO APPUNTAMENTI, footer aggregato brand, dialog admin tiers, export CSV. |
| **F5** Rifiniture | 🟡 In corso | ✅ 1-4 (MV channel/salesperson daily + cron 15min, badge freshness, A/B compare marketing, per-fonte sales, drill-down venditore con funnel+trend). ⏳ 5-7 alert/anomalie + export Sheets + DPIA |

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
