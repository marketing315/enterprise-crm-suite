

## Piano: Aggiungere selezione fase pipeline per sorgente webhook

### Obiettivo
Permettere agli admin di configurare, per ogni sorgente inbound, in quale fase della pipeline il lead deve entrare (es. "Nuovo Lead", "Fissato", ecc.) invece di usare sempre la fase di default.

### Come funziona oggi
- La tabella `webhook_sources` ha un campo `handler` (es. `keplero`) e `counts_as_new_lead` (boolean), ma **non** un campo per specificare la fase pipeline iniziale.
- La fase iniziale viene decisa dall'AI classifier (`ai-classify`) o hardcoded nel handler Keplero.
- Nel form di modifica sorgente (`InboundSourceFormDrawer`) non c'è modo di scegliere la fase.

### Cosa farò

**1. Migration: aggiungere colonna `default_pipeline_stage_id`**
```sql
ALTER TABLE webhook_sources 
ADD COLUMN default_pipeline_stage_id uuid 
REFERENCES pipeline_stages(id) ON DELETE SET NULL;
```

**2. Aggiornare il form `InboundSourceFormDrawer`**
- Aggiungere un campo `Select` con le fasi pipeline attive (query da `pipeline_stages` con `is_active = true`)
- Label: "Fase pipeline iniziale"
- Descrizione: "Fase in cui verrà inserito il deal quando arriva un lead da questa sorgente. Se non specificata, verrà usata la classificazione automatica."
- Valore opzionale (nullable) — se non selezionato, comportamento invariato

**3. Aggiornare `webhook-ingest` edge function**
- Dopo aver caricato la `source`, leggere `default_pipeline_stage_id`
- Se presente, passarlo al flusso di creazione deal come stage iniziale, bypassando la classificazione AI per la fase
- Se assente, comportamento invariato (AI classifier decide)

**4. Aggiornare `InboundSourceList`**
- Mostrare un badge con il nome della fase configurata accanto a ogni sorgente nella lista

### File modificati
- `supabase/functions/webhook-ingest/index.ts` — usare `default_pipeline_stage_id` se presente
- `src/components/settings/inbound/InboundSourceFormDrawer.tsx` — nuovo campo select con fasi pipeline
- `src/components/settings/inbound/InboundSourceList.tsx` — badge fase nella lista
- `src/hooks/useInboundSources.ts` — includere `default_pipeline_stage_id` nella query
- Migration SQL per la nuova colonna

