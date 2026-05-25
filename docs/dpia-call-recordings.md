# DPIA — Registrazioni chiamate e trascrizioni

**Versione**: 1.0 · **Ultimo aggiornamento**: 2026-05-25

## 1. Trattamenti coinvolti
- **Registrazione audio chiamate** (`call_logs.recording_url`, `call_transcripts.recording_url`):
  audio della telefonata, conservato sul provider (VoiSpeed) e referenziato in CRM.
- **Trascrizioni** (`call_transcripts.full_text`, `summary`, `keywords`):
  testo della conversazione + sintesi prodotti da Whisper + Gemini.
- **Sentiment / metadati AI** (`sentiment`, `call_outcome`, `clinical_interest`, ...):
  inferenze automatiche per finalità di qualità, coaching e KPI di vendita.

## 2. Basi giuridiche
- Esecuzione del contratto / interesse legittimo per la gestione del rapporto commerciale (Art. 6.1.b/f GDPR).
- Consenso esplicito dell'interlocutore per registrazione e analisi AI (Art. 6.1.a + Art. 9 quando rilevano dati sanitari).
- Il flag `consent_status` su `call_transcripts` tracciapresenza/assenza/sconosciuto del consenso.

## 3. Minimizzazione & retention
La retention NON è hard-coded. Ogni brand definisce in `brand_data_retention_config` la
durata massima per ciascuna categoria. I valori `NULL` rappresentano "nessun limite";
in tal caso l'admin deve documentare in `notes` la motivazione e la base giuridica.

| Categoria              | Sorgente                                          | Default consigliato |
|------------------------|---------------------------------------------------|---------------------|
| Audio (URL)            | `call_logs.recording_url`, `call_transcripts.recording_url` | 90 giorni       |
| Trascrizioni testuali  | `call_transcripts` (intera riga)                  | 365 giorni          |
| Eventi alert performance | `performance_alert_events`                      | 180 giorni          |
| Log export Sheets      | `sheets_export_logs`                              | 30 giorni           |

Il cleanup viene eseguito:
- automaticamente ogni giorno alle **03:30 IT** via `pg_cron` (`data-retention-cleanup-daily`);
- manualmente da `/admin/data-retention` (dry-run e applicazione).

L'anonimizzazione dell'audio consiste nel rimuovere il riferimento URL dal CRM
(`recording_url = NULL`). La cancellazione fisica del file presso il provider è demandata
alla retention configurata su VoiSpeed.

## 4. Diritti dell'interessato
- Accesso/copia: estrazione tramite contatto associato.
- Rettifica: aggiornamento note/riassunto della trascrizione.
- Cancellazione anticipata: usare l'azione "Esegui ora" filtrata per brand o eliminare
  manualmente il `call_transcripts.id` corrispondente.

## 5. Misure tecniche
- RLS attiva su `call_transcripts`, `call_logs`, `brand_data_retention_config`,
  `data_retention_runs`.
- Accesso alle pagine di configurazione retention limitato a ruoli `admin`, `ceo`,
  `amministrazione`.
- Log immutabile delle esecuzioni (`data_retention_runs`, auto-purge a 90 gg).
- Le RPC `upsert_brand_retention_config` e `run_data_retention_cleanup` sono
  `SECURITY DEFINER` con `REVOKE` per `anon` e `GRANT` solo a `authenticated`.

## 6. Registro modifiche
- 1.0 — 2026-05-25 — Versione iniziale (F5.7).
