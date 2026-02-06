

# Correzione Bug Silenziosi + RLS contact_table_views

## Bug #13 (NUOVO) -- RLS `contact_table_views`: INSERT bloccato

### Problema
La policy attuale e':
```
FOR ALL, roles: {public}, USING (owner_user_id = auth.uid()), WITH CHECK: (nessuno)
```

Il target `{public}` include il ruolo `anon`. Se il token JWT scade o la sessione non viene rinnovata correttamente, il client ricade sul ruolo `anon`, `auth.uid()` restituisce `null`, e l'INSERT fallisce con "new row violates row-level security policy". Inoltre, manca un `WITH CHECK` esplicito, rendendo la policy fragile.

### Soluzione
Eliminare la policy generica `ALL` e creare 4 policy separate per il ruolo `authenticated`:
- **SELECT**: `USING (owner_user_id = auth.uid())`
- **INSERT**: `WITH CHECK (owner_user_id = auth.uid())`
- **UPDATE**: `USING (owner_user_id = auth.uid())` + `WITH CHECK (owner_user_id = auth.uid())`
- **DELETE**: `USING (owner_user_id = auth.uid())`

---

## Riepilogo completo -- 13 bug da correggere

### CRITICI (perdita dati / funzionalita' rotta)

| # | Funzione | Problema | Fix |
|---|----------|----------|-----|
| 1 | `meta-leads-webhook` | `marketing_consent` aggiornato prima del controllo errore su `contactResult` | Spostare dentro il ramo di successo |
| 2 | `voispeed-events-webhook` | Normalizzazione telefono E.164 non compatibile con formato `contact_phones` | Allineare formato normalizzazione |
| 3 | `voispeed-events-webhook` | Errori DB su update/insert completamente ignorati | Aggiungere error logging |
| 4 | `keplero-webhook` | Errore `find_or_create_deal` destrutturato via | Aggiungere `error` e loggare |
| 5 | `keplero-webhook` | Update indirizzo contatto senza verifica errore | Aggiungere `{ error }` e loggare |
| 13 | `contact_table_views` RLS | Policy ALL su ruolo `public` senza WITH CHECK esplicito, INSERT fallisce | Sostituire con 4 policy per ruolo `authenticated` |

### MEDI (dati incompleti / comportamento inatteso)

| # | Funzione | Problema | Fix |
|---|----------|----------|-----|
| 6 | `meta-leads-webhook` | lead_event creato con contact_id=null quando manca il telefono, status "ingested" maschera il problema | Aggiungere status "ingested_no_contact" e warning log |
| 7 | `ai-classify` | Update su lead_events e deals non verificati, job marcato completed anche se update fallisce | Verificare `{ error }` |
| 8 | `ai-classify` | `logAIDecision` insert senza controllo errore | Controllare risultato e loggare |
| 9 | `automation-runner` | Tag upsert senza verifica errore | Aggiungere `{ error }` e throw |
| 10 | `webhook-ingest` | lead_event insert error ritorna comunque success: true | Segnalare errore nel response body |

### BASSO IMPATTO (osservabilita')

| # | Funzione | Problema | Fix |
|---|----------|----------|-----|
| 11 | `keplero-webhook` | `add_contact_phone` errore catturato con `console.warn` poco visibile | Usare `console.error` |
| 12 | `ads-stats-meta` | Errori Meta API non persistiti in DB | Loggare con `console.error` strutturato |

---

## Dettaglio Tecnico

### Migrazione DB (Bug #13)
```sql
-- 1. Rimuovere la policy esistente
DROP POLICY "Users can manage their own table views" 
  ON contact_table_views;

-- 2. Creare policy granulari per authenticated
CREATE POLICY "Users can view own table views"
  ON contact_table_views FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "Users can insert own table views"
  ON contact_table_views FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Users can update own table views"
  ON contact_table_views FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Users can delete own table views"
  ON contact_table_views FOR DELETE
  TO authenticated
  USING (owner_user_id = auth.uid());
```

### Edge Function -- Pattern di fix per errori DB ignorati
Ogni operazione DB critica seguira' questo pattern:
```typescript
const { error: updateError } = await supabase
  .from("table")
  .update({ ... })
  .eq("id", entityId);

if (updateError) {
  console.error("[FUNCTION_NAME] Failed to update table:", {
    entity_id: entityId,
    error: updateError.message,
  });
}
```

### File da modificare
1. **Migrazione SQL**: nuova migrazione per le policy `contact_table_views`
2. **`supabase/functions/meta-leads-webhook/index.ts`**: fix bug #1 e #6
3. **`supabase/functions/voispeed-events-webhook/index.ts`**: fix bug #2 e #3
4. **`supabase/functions/keplero-webhook/index.ts`**: fix bug #4, #5, #11
5. **`supabase/functions/ai-classify/index.ts`**: fix bug #7 e #8
6. **`supabase/functions/automation-runner/index.ts`**: fix bug #9
7. **`supabase/functions/webhook-ingest/index.ts`**: fix bug #10
8. **`supabase/functions/ads-stats-meta/index.ts`**: fix bug #12

### Ordine di esecuzione
1. Migrazione DB (RLS policy)
2. Fix Edge Function critici (#1-5)
3. Fix Edge Function medi (#6-10)
4. Fix osservabilita' (#11-12)
5. Deploy di tutte le funzioni modificate

