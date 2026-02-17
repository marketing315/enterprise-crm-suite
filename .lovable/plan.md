
## Caricamento automatico contatti (Infinite Scroll)

Sostituire il pulsante "Carica altri contatti" con un meccanismo di scroll infinito che carica automaticamente la pagina successiva quando l'utente si avvicina al fondo della lista.

### Cosa cambia

**`src/components/contacts/ContactsTableWithViews.tsx`**
- Rimuovere il pulsante manuale "Carica altri contatti"
- Aggiungere un elemento sentinella invisibile in fondo alla tabella
- Usare `IntersectionObserver` per rilevare quando la sentinella entra nel viewport
- Quando visibile e ci sono altri dati (`hasMore = true`) e non si sta gia caricando, chiamare `onLoadMore()` automaticamente
- Mostrare uno spinner/testo "Caricamento..." mentre i nuovi dati arrivano

### Dettagli tecnici

- Si usa un `useEffect` + `useRef` con `IntersectionObserver` nativo (nessuna dipendenza aggiuntiva)
- Il `rootMargin` viene impostato a `200px` per pre-caricare prima che l'utente raggiunga il fondo esatto
- L'observer si disconnette quando `hasMore` diventa `false` o il componente si smonta
- La sentinella e un semplice `<div ref={sentinelRef} />` posizionato dopo la tabella
