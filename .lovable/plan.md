

## Aggiungere selettore fase pipeline inline per ogni sorgente inbound

### Situazione attuale
La fase pipeline è già configurabile nel drawer di modifica, e viene mostrata come badge statico nella lista. Il campo `default_pipeline_stage_id` esiste già nella tabella `webhook_sources`.

### Cosa cambia
Sostituire il badge statico della fase pipeline con un **Select dropdown inline** direttamente nella card di ogni sorgente, permettendo di cambiare la fase senza aprire il drawer.

### Modifiche

**File: `src/components/settings/inbound/InboundSourceList.tsx`**

1. **Aggiungere una mutation** `updatePipelineStageMutation` che aggiorna `default_pipeline_stage_id` su `webhook_sources`
2. **Sostituire il badge statico** (righe 185-192) con un `Select` inline compatto che:
   - Mostra tutte le fasi pipeline attive + opzione "Automatica (AI)"
   - Il valore selezionato riflette `source.default_pipeline_stage_id` (o "auto" se null)
   - Al cambio, esegue la mutation per aggiornare direttamente il valore
   - Stile compatto (`h-7 text-xs`) coerente con il resto della card
3. **Aggiungere import** di `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` dal componente UI

Nessuna migrazione necessaria — il campo e la logica backend esistono già.

