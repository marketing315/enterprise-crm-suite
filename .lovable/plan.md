
## Fix: Infinite Scroll per i Contatti

L'infinite scroll non funziona per due motivi tecnici che vanno corretti insieme.

### Problema 1 — La query ignora l'offset

Il hook `useContactSearch` accetta un parametro `offset` ma non lo usa nella query senza testo di ricerca (il caso piu comune). Il risultato: ogni "pagina" restituisce sempre gli stessi primi 50 contatti, e il hook `usePaginatedContactSearch` non accumula mai nuovi dati.

**Correzione in `src/hooks/useContactSearch.ts`:**
- Aggiungere `.range(offset, offset + limit - 1)` alla query Supabase nella modalita "no search query" (riga 76-84), sostituendo il semplice `.limit(limit)`.

### Problema 2 — La sentinella e fuori dal container scrollabile

La sentinella (`<div ref={sentinelRef}>`) e posizionata **dopo** il `<div>` con `overflow-y-auto`. Siccome il container della tabella ha una altezza massima e scroll interno, la sentinella si trova nello spazio della pagina sempre visibile, e non viene raggiunta dallo scroll della tabella.

**Correzione in `src/components/contacts/ContactsTableWithViews.tsx`:**
- Spostare la sentinella **dentro** il container scrollabile, dopo il `</Table>` ma prima della chiusura del `<div>` con `overflow-y-auto`.
- In questo modo l'IntersectionObserver si attiva correttamente quando l'utente scrolla la tabella fino in fondo.
- Aggiungere `root` all'observer per usare il container scrollabile come viewport di riferimento.

### Dettagli tecnici

**File: `src/hooks/useContactSearch.ts`**
- Alla riga 84, sostituire `.limit(limit)` con `.range(offset, offset + limit - 1)` per supportare la paginazione con offset.

**File: `src/components/contacts/ContactsTableWithViews.tsx`**
- Spostare `<div ref={sentinelRef} className="h-1" />` e il messaggio "Caricamento..." dentro il div scrollabile (quello con classe `rounded-md border max-h-[...]`), subito dopo `</Table>`.
- Aggiungere un `ref` al container scrollabile e passarlo come opzione `root` all'`IntersectionObserver`, cosi l'observer rileva la sentinella rispetto al container anziche alla finestra.
