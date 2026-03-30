

## Problema

Keplero chiama il nostro endpoint via GET con URL identico ogni volta. Se un qualsiasi layer intermedio (CDN Supabase, proxy, ecc.) cacha la risposta, Keplero riceve dati stale — ad esempio il campo `ha_appuntamento` non aggiornato dopo che il deal cambia fase.

Abbiamo già aggiunto header `Cache-Control`, `CDN-Cache-Control`, `Vary`, ecc., ma non possiamo garantire che tutti i proxy li rispettino. Keplero non può modificare la loro chiamata.

## Soluzione: Redirect con cache-buster automatico

Quando l'endpoint riceve una richiesta GET **senza** un parametro `_t` (timestamp), rispondiamo con un **302 redirect** verso lo stesso URL con `_t={timestamp}` aggiunto. Questo forza un URL unico ad ogni chiamata, rendendo impossibile il caching a qualsiasi livello.

Il flusso diventa:
```text
Keplero → GET ...?phone=X&brand_slug=Y&secret=Z
  ← 302 → GET ...?phone=X&brand_slug=Y&secret=Z&_t=1711812345678
  ← 200 JSON (dati freschi)
```

Se il parametro `_t` è già presente, la funzione procede normalmente e restituisce i dati.

## Modifica

**File:** `supabase/functions/keplero-contact-lookup/index.ts`

Subito dopo il check OPTIONS e il check del metodo (riga ~41, prima di qualsiasi logica), aggiungere:

```typescript
// Auto cache-buster: redirect GET senza _t per forzare URL unico
if (req.method === "GET") {
  const incomingUrl = new URL(req.url);
  if (!incomingUrl.searchParams.has("_t")) {
    incomingUrl.searchParams.set("_t", Date.now().toString());
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, "Location": incomingUrl.toString() },
    });
  }
}
```

Nessuna modifica richiesta da parte di Keplero. Il redirect è trasparente per il loro client HTTP.

