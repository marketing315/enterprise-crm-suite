

## Correzione bug CAPI - Piano step-by-step

Si interviene su 6 bug identificati nell'audit, raggruppati per priorita'.

---

### Step 1 — Recovery eventi stuck in "processing" (BUG 1)

**Problema**: Se l'edge function crasha dopo il claim, gli eventi restano in `processing` per sempre perche' `claim_capi_events` filtra solo `status = 'pending'`.

**Soluzione**: Modificare la funzione `claim_capi_events` per includere anche gli eventi in `processing` da piu' di 5 minuti (stale). Aggiungere la condizione:

```text
WHERE (status = 'pending' OR (status = 'processing' AND processing_at < NOW() - INTERVAL '5 minutes'))
```

Tipo: migrazione SQL (CREATE OR REPLACE FUNCTION)

---

### Step 2 — Country non hashato nel fallback (BUG 3)

**Problema**: Riga 269 del sender — quando non c'e' un contatto, `country` viene inviato come `["it"]` in chiaro invece che come hash SHA-256.

**Soluzione**: Nel file `supabase/functions/capi-event-sender/index.ts`, sostituire il fallback:

```text
// Prima (bug):
: { country: ["it"] };

// Dopo (fix):
: { country: [await sha256("it")] };
```

Questo richiede che il fallback diventi `async`. Si trasformera' il ternario in un blocco if/else.

---

### Step 3 — Token esposto nei log (BUG 4)

**Problema**: Riga 311 logga `requestBody` che contiene `access_token`.

**Soluzione**: Loggare solo il campo `data` (senza il token):

```text
// Prima:
console.log(`[CAPI] Payload:`, JSON.stringify(requestBody, null, 2).slice(0, 2000));

// Dopo:
console.log(`[CAPI] Payload:`, JSON.stringify({ data: capiData, test_event_code: requestBody.test_event_code }, null, 2).slice(0, 2000));
```

---

### Step 4 — Deal senza contact_id (BUG 5)

**Problema**: `queue_capi_purchase_event` non verifica che `NEW.contact_id` sia NOT NULL. Un deal senza contatto genera un evento CAPI inutile.

**Soluzione**: Aggiungere un early return nel trigger SQL:

```text
IF NEW.contact_id IS NULL THEN
  RETURN NEW;
END IF;
```

Tipo: migrazione SQL (CREATE OR REPLACE FUNCTION)

---

### Step 5 — Cast bigint su lead_id (BUG 6)

**Problema**: `v_lead_id::bigint` puo' crashare se `leadgen_id` contiene caratteri non numerici.

**Soluzione**: In entrambi i trigger (`queue_capi_lead_event` e `queue_capi_purchase_event`), passare `lead_id` come testo nella jsonb senza cast:

```text
// Prima:
v_user_data := jsonb_build_object('lead_id', v_lead_id::bigint);

// Dopo:
v_user_data := jsonb_build_object('lead_id', v_lead_id);
```

Meta accetta `lead_id` come stringa. Tipo: migrazione SQL.

---

### Step 6 — Default colonna action_source (BUG 2)

**Problema**: Il default della colonna e' `'website'` ma tutti i trigger usano `'system_generated'`.

**Soluzione**: Allineare il default della colonna:

```text
ALTER TABLE meta_capi_event_queue
  ALTER COLUMN action_source SET DEFAULT 'system_generated';
```

Tipo: migrazione SQL.

---

### Riepilogo file modificati

| File | Tipo modifica |
|------|--------------|
| Migrazione SQL | Ricrea `claim_capi_events` con recovery stale |
| Migrazione SQL | Ricrea `queue_capi_purchase_event` con check NULL contact_id e rimuove cast bigint |
| Migrazione SQL | Ricrea `queue_capi_lead_event` senza cast bigint |
| Migrazione SQL | Cambia default colonna `action_source` |
| `supabase/functions/capi-event-sender/index.ts` | Fix country hash fallback + rimuove token dai log |

Tutte le modifiche SQL saranno in una singola migrazione. La modifica all'edge function e' un singolo file.

