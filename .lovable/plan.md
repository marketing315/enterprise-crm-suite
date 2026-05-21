## Spec Dashboard Performance — Piano di consegna

Lo spec v0.2 (655 righe) descrive 3 moduli grandi (A: Canali & Costi, B: Call Center/VoiSpeed, C: Venditori) su una **dimensione "Fonte" unica condivisa**. Lo spec stesso indica una roadmap a 6 fasi (F0→F5) e lascia **12 domande aperte** che bloccano parti significative dell'implementazione. Non è un singolo loop: sono settimane di lavoro. Procediamo a fasi, ognuna in preview prima del publish.

---

### Roadmap proposta (sequenza dello spec §11)

| Fase | Contenuto | Note |
|------|-----------|------|
| **F0** | Fondamenta fonte: `tracking_numbers`, `source_groups` generalizzati (`group_kind`, `channel_ids`, `tracking_number_ids`), estensioni `lead_campaign_attribution` (`phone`/`webhook`), `webhook_sources.attribution_mode`, componente `<SourceFilterBar/>` | Sbloccante per tutto il resto |
| **F1** | Modulo A — Canali & Costi: `marketing_costs` esteso, vista `v_channel_spend_daily`, `v_lead_cost`, RPC `get_channel_performance`, UI `/marketing/performance` (header filtri, KPI cards, tabella canali, CRUD numeri, import CSV costi) | Risponde priorità #1 CEO |
| **F2** | Modulo B base — VoiSpeed events: edge `voispeed-webhook`, estensioni `call_logs` (`tracking_number_id`, `queue_name`, `wait_seconds`, `talk_seconds`, `booked_appointment_id`), wallboard + tab Telefonia, KPI operatori | Dipende da F0 |
| **F3** | Trascrizione + Sentiment: `voispeed-recording-fetch`, `call-transcribe` (batch), `call-sentiment` (per-speaker), estensioni `call_transcripts`, UI player+trascrizione | **Bloccato** finché non si decide STT provider + GDPR |
| **F4** | Modulo C — Venditori: enum `order_lifecycle_status` + campi su `sales_orders`, `sales_bonus_tiers`, RPC `get_salesperson_kpis_v2` + `_aggregate`, UI "vista Foglio" che replica 1:1 il report "ESITO APPUNTAMENTI" | Dipende da F0; parallelizzabile a F2 |
| **F5** | Rifiniture: viste materializzate, confronti A/B avanzati, alert/anomalie, export Sheets, DPIA |  |

Ad ogni fine fase: preview, verifica con te, poi publish (clic tuo su Update).

---

### Domande aperte da chiarire PRIMA di partire

Lo spec §12 elenca 12 punti. I 5 bloccanti per F0-F1-F4 (le fasi che vorrei iniziare subito) sono:

1. **% cons su vend (Modulo C #16)** — di periodo, di coorte, o entrambe?
2. **Imponibile (#19)** — scorporo flat 22% (come nel foglio) o calcolo per riga `vat_rate`?
3. **Premi venditori** — base lorda o imponibile? Versionare scaglioni con `valid_from/valid_to`?
4. **Stato ordine (`lifecycle_status`)** — chi lo imposta? Amministrazione manuale, workflow, o import da gestionale esterno?
5. **Visibilità costi/CPL/CAC** — solo CEO/Admin/Amministrazione, o anche Resp. venditori vedono CPL?

I bloccanti per F3 (trascrizione/sentiment, posso iniziarla dopo F2):

6. **Provider STT** italiano + diarizzazione: Whisper self-host o API esterna (es. AssemblyAI/Deepgram)?
7. **GDPR**: consenso esplicito IVR vs legittimo interesse; retention audio + trascrizioni.

I bloccanti per F2 (call center base):

8. **VoiSpeed**: disponibilità webhook eventi (ring/answer/hangup/recording-ready) e API code/agent status. Da verificare con l'account VoiSpeed.

Senza queste risposte costruisco con assunzioni che probabilmente andranno rifatte.

---

### Proposta operativa

**Opzione A (consigliata):** rispondi ai 5 bloccanti F0-F1-F4 (sopra) e parto con **F0 + F1 in un loop** (priorità #1 dello spec). Le altre domande le chiudiamo prima di F2/F3.

**Opzione B:** rispondi a tutte e 12 in blocco, ti consegno un piano dettagliato per ogni fase con stime e dipendenze, e poi parto.

**Opzione C:** parto subito con **solo F0** (fondamenta DB + componente filtro, nessuna UI di moduli) — è puramente strutturale, non dipende da nessuna delle 12 risposte. Mentre lavoro F0, tu rispondi ai bloccanti per F1.

---

### Dettagli tecnici (per riferimento)

- **Migrazioni**: tutte additive (nullable+default), zero `DROP`/`TRUNCATE` su tabelle business — rispetto vincolo `mem://constraint/appointments-data-safety`.
- **RLS**: ogni nuova tabella (`tracking_numbers`, `voispeed_agent_status`, `sales_bonus_tiers`, ecc.) con policy brand-scoped via `get_user_id(auth.uid())` + `has_role`.
- **RPC**: `SECURITY DEFINER`, `search_path = public`, parametro `p_source_filter jsonb` standardizzato sui 3 moduli.
- **Edge functions**: `voispeed-webhook`/`call-transcribe`/`call-sentiment` con pattern già consolidato (`Deno.serve`, `corsHeaders`, `INTERNAL_SERVICE_TOKEN`, idempotency, AI quota cap, redact PII).
- **Realtime**: wallboard centralino via `useGlobalRealtime` (no polling).
- **UI**: `<SourceFilterBar/>` come componente shared in `src/components/shared/`; "vista Foglio" Modulo C replica 1:1 le 20 colonne del report aziendale.
- **Gate CI**: ogni fase passa tsc/build/test prima del publish (zero-exception policy).

---

**Quale opzione (A / B / C) preferisci?** Se A o B, allega le risposte ai bloccanti; se C, confermo e parto subito con F0.