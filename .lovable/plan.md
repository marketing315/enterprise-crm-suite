

## Problema: Cache CDN su richieste GET

### Diagnosi

Il flusso è: **Keplero → CDN Supabase → Edge Function**

Le richieste GET con URL identico (stesso telefono, brand, secret) possono essere servite dalla cache CDN senza mai raggiungere la Edge Function. Gli header `Cache-Control` nella risposta controllano il browser, ma il CDN potrebbe già aver intercettato la richiesta prima.

Il numero test `3333333333` funziona perché genera dati random — ma se il CDN serve una risposta cachata, i dati saranno identici tra chiamate ravvicinate.

### Soluzione

Tre interventi combinati:

**1. Aggiungere header `CDN-Cache-Control` e `Vary`**
Nella Edge Function `keplero-contact-lookup/index.ts`, aggiungere header specifici per il CDN:
```
CDN-Cache-Control: no-store
Vary: *
```
Questi istruiscono esplicitamente il CDN (non solo il browser) a non cachare.

**2. Aggiungere un timestamp anti-cache nella risposta**
Includere `_nocache_ts` nel JSON di risposta per ogni chiamata (non solo il test number), così Keplero può verificare che ogni risposta è fresca.

**3. Documentare per Keplero l'uso di cache-buster**
Consigliare a Keplero di aggiungere un parametro `&_t={timestamp}` alla query string per forzare URL unici ad ogni richiesta. Questo è il metodo più affidabile per bypassare qualsiasi layer di cache.

### File da modificare

- `supabase/functions/keplero-contact-lookup/index.ts` — aggiornare `corsHeaders` con header anti-cache CDN, aggiungere `_nocache_ts` alla risposta

