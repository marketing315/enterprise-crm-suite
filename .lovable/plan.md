

# Scansione Debug Completa - Contatti Infinite Scroll

## Bug Identificati

### Bug 1 (CRITICO): `loadTriggeredRef` viene resettato prematuramente
In `usePaginatedContactSearch.ts`, linea 56, `loadTriggeredRef.current = false` viene eseguito **incondizionatamente** alla fine dell'`useEffect`. Quando `page` cambia (es. da 0 a 1), React Query crea una nuova query e temporaneamente `pageData` diventa `[]`. L'effetto scatta, nessun branch viene eseguito, ma la guardia viene comunque resettata. Questo permette a `loadMore` di scattare di nuovo prima che i dati della pagina corrente arrivino, saltando pagine.

### Bug 2 (MEDIO): Ordine di dichiarazione `handleScrollRef` / `scrollContainerCallbackRef`
In `ContactsTableWithViews.tsx`, `scrollContainerCallbackRef` (linea 212) fa riferimento a `handleScrollRef.current` (linea 225) che e' dichiarato DOPO. Funziona per via delle closure JS, ma e' fragile e puo' causare problemi con HMR.

### Bug 3 (MINORE): Warning `forwardRef` su AlertDialog
Il console log mostra warning di `Function components cannot be given refs` su AlertDialog. Non blocca il funzionamento ma indica un componente non aggiornato.

---

## Piano di Fix

### Step 1: Fix `usePaginatedContactSearch.ts`
- Spostare `loadTriggeredRef.current = false` DENTRO il branch `if (pageData.length > 0)` o dopo la conferma che i dati sono effettivamente arrivati per la pagina corrente
- Aggiungere un `pageRef` per tracciare quale pagina ha triggerato il load e resettare la guardia solo quando arrivano i dati per quella specifica pagina

```text
Logica corretta:
1. loadMore() -> loadTriggeredRef = true, setPage(p+1)
2. Query parte con nuovo offset
3. pageData arriva (length > 0) -> appende a allResults -> loadTriggeredRef = false
4. pageData vuoto (fine lista) -> hasMore = false -> scroll handler bloccato
```

### Step 2: Riordinare dichiarazioni in `ContactsTableWithViews.tsx`
- Spostare `handleScrollRef` PRIMA di `scrollContainerCallbackRef` per eliminare la dipendenza da hoisting delle closure
- Nessun cambiamento di logica, solo ordine piu' sicuro

### Step 3: (Opzionale) Fix warning AlertDialog
- Verificare se `AlertDialogContent` nel file `alert-dialog.tsx` necessita di `React.forwardRef`

---

## Dettaglio Tecnico - Fix Principale

Il fix chiave in `usePaginatedContactSearch.ts`:

```text
// PRIMA (buggy):
useEffect(() => {
  if (pageData.length > 0) {
    // append...
  } else if (page === 0) {
    setAllResults([]);
  }
  loadTriggeredRef.current = false;  // <-- SEMPRE resettato
}, [pageData, page]);

// DOPO (corretto):
useEffect(() => {
  if (pageData.length > 0) {
    // append...
    loadTriggeredRef.current = false;  // <-- solo quando dati arrivano
  } else if (page === 0) {
    setAllResults([]);
    loadTriggeredRef.current = false;  // <-- reset iniziale OK
  }
  // NON resettare qui per pagine > 0 senza dati (ancora in caricamento)
}, [pageData, page]);
```

Questo impedisce che il guard venga rimosso durante il transitorio di caricamento, prevenendo il salto di pagine.

