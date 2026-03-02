

# Piano: Sincronizzazione Google Ads a prova di errore

## Problema
Il token OAuth e' scaduto il 27 febbraio e la sync ha smesso di importare dati. Nessun allarme e' stato generato e il gap e' stato scoperto solo confrontando manualmente i totali.

## Soluzione: 3 miglioramenti

### 1. Tabella `ad_sync_log` per tracciare ogni esecuzione
Creare una tabella che registra ogni ciclo di sync con esito (success/failure), date coperte e messaggio di errore. Questo permette di rilevare automaticamente i gap.

### 2. Auto-backfill intelligente
Prima di sincronizzare, la funzione controlla l'ultimo sync riuscito dalla tabella `ad_sync_log`. Se sono passati piu' di 4 giorni dall'ultima sync riuscita, estende automaticamente la finestra di lookback fino a coprire tutto il periodo mancante (max 30 giorni). Cosi' anche dopo giorni di errori, il primo ciclo riuscito recupera tutto.

### 3. Refresh proattivo del token
Invece di aspettare che il token sia scaduto, rinnovarlo quando mancano meno di 10 minuti alla scadenza. Questo elimina la finestra in cui il token e' gia' scaduto ma non ancora refreshato.

---

## Dettagli tecnici

### Migration SQL
```sql
CREATE TABLE public.ad_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,         -- 'google' | 'meta'
  account_id TEXT NOT NULL,
  brand_id UUID REFERENCES brands(id),
  success BOOLEAN NOT NULL,
  campaigns_synced INT DEFAULT 0,
  sync_from DATE NOT NULL,
  sync_to DATE NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ad_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON ad_sync_log FOR ALL USING (false);
```

### Modifiche a `google-ads-sync/index.ts`

1. **Dopo l'auth check**, query `ad_sync_log` per trovare l'ultimo sync riuscito per ogni account:
   ```typescript
   const { data: lastSync } = await supabase
     .from("ad_sync_log")
     .select("sync_to")
     .eq("provider", "google")
     .eq("account_id", customerId)
     .eq("success", true)
     .order("created_at", { ascending: false })
     .limit(1)
     .maybeSingle();
   ```

2. **Calcolo lookback dinamico**: se `lastSync.sync_to` e' piu' vecchio di 4 giorni fa, usa quello come `sinceDate` (cap a 30 giorni).

3. **Refresh proattivo**: cambiare la condizione da `expires_at <= now` a `expires_at <= now + 10min`:
   ```typescript
   const bufferMs = 10 * 60 * 1000; // 10 minuti
   if (new Date(oauthToken.expires_at).getTime() <= Date.now() + bufferMs) {
     // refresh token...
   }
   ```

4. **Log ogni esecuzione** (successo o fallimento) nella tabella `ad_sync_log` alla fine di ogni account.

### File modificati
- `supabase/functions/google-ads-sync/index.ts` - logica auto-backfill, refresh proattivo, scrittura log
- 1 migration SQL per la tabella `ad_sync_log`

