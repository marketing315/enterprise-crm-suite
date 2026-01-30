

# Piano di Fix: Creazione Contatti per Meta Lead Ads

## Problema

Il lead di test Meta è stato creato correttamente nella tabella `lead_events`, ma il contatto non compare nella sezione Contatti perché:

1. L'edge function `meta-leads-webhook` non chiama la RPC `find_or_create_contact` 
2. Il `lead_event` viene inserito con `contact_id: null`
3. La pagina Contatti mostra solo record dalla tabella `contacts`, non `lead_events`

## Soluzione

Modificare `meta-leads-webhook` per allinearla al pattern di `webhook-ingest`:

1. **Normalizzare il telefono** usando la stessa logica di `webhook-ingest`
2. **Chiamare `find_or_create_contact`** per creare/recuperare il contatto
3. **Chiamare `find_or_create_deal`** per gestire la pipeline
4. **Aggiornare `lead_event`** con il `contact_id` corretto
5. **Aggiornare `meta_lead_events`** con il `contact_id`

## Dettaglio Tecnico

### File da modificare

`supabase/functions/meta-leads-webhook/index.ts`

### Modifiche richieste

1. **Aggiungere funzione `normalizePhone`** (copia da webhook-ingest)
   - Normalizza i numeri rimuovendo prefissi internazionali
   - Rileva automaticamente il paese

2. **Dopo aver mappato i dati del lead** (dopo linea 225), aggiungere:
   ```text
   - Normalizzare il telefono se presente
   - Chiamare RPC find_or_create_contact con i campi estratti
   - Chiamare RPC find_or_create_deal 
   - Passare contact_id e deal_id all'INSERT di lead_events
   ```

3. **Aggiornare meta_lead_events** con il contact_id

4. **Gestire edge case**: se manca il telefono, loggare un warning ma continuare (il lead viene comunque registrato)

### Comportamento atteso post-fix

| Flusso | Prima | Dopo |
|--------|-------|------|
| Lead Meta ricevuto | Solo `lead_event` creato | `contact` + `deal` + `lead_event` creati |
| `lead_event.contact_id` | `null` | UUID del contatto |
| Contatto visibile | No | Si |
| Deal in pipeline | No | Si |

## Compatibilità

Il fix è compatibile con la logica esistente di deduplicazione:
- `find_or_create_contact` usa il telefono normalizzato come chiave
- Se un contatto esiste già, viene riutilizzato
- I lead duplicati vengono già gestiti via `leadgen_id` unique constraint

