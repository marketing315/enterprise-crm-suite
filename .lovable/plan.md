

# Fix: Bug in queue_capi_purchase_event

## Problema

La funzione `queue_capi_purchase_event()` contiene lo stesso bug gia' corretto in `queue_capi_lead_event()`: referenzia la colonna inesistente `mle.created_at` nella tabella `meta_lead_events`. La colonna corretta e' `mle.received_at`.

**Impatto**: quando un deal viene spostato nello stage "Vinta" e il contatto proviene da Meta, il trigger crasha e il deal update viene annullato (rollback). Questo impedisce sia la chiusura del deal sia l'invio dell'evento Purchase a Meta CAPI.

## Intervento

Una singola migrazione SQL che ricrea la funzione `queue_capi_purchase_event()` sostituendo:

```
ORDER BY mle.created_at DESC
```

con:

```
ORDER BY mle.received_at DESC
```

Nessuna altra modifica necessaria — il resto della logica e' corretto.

## Sezione tecnica

- **Tipo**: migrazione SQL (CREATE OR REPLACE FUNCTION)
- **Funzione**: `public.queue_capi_purchase_event()`
- **Trigger associato**: scatta su UPDATE della tabella `deals` quando `stage_name` diventa `'Vinta'`
- **Rischio**: zero — la funzione attuale e' gia' rotta per i contatti Meta, il fix la rende funzionante
- **File coinvolti**: solo nuova migrazione SQL, nessun file frontend/edge function modificato

