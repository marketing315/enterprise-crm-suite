## Stati vuoti, errori e caricamento più umani

Tre componenti riusabili + collegamento alle 3 liste principali e all'`ErrorBoundary` globale. Niente migrazioni, niente nuove dipendenze.

### 1. Nuovo componente `EmptyState` (`src/components/ui/EmptyState.tsx`)

Props: `icon: LucideIcon`, `title: string`, `description?: string`, `actionLabel?: string`, `onAction?: () => void`, `secondaryLabel?: string`, `onSecondary?: () => void`.

Layout C-Level: cerchio `bg-muted/40` con icona, titolo, descrizione `text-muted-foreground`, CTA primaria + opzionale secondaria. Sostituisce gli attuali "Nessun X trovato" testuali.

### 2. Nuovo componente `QueryErrorState` (`src/components/ui/QueryErrorState.tsx`)

Props: `error: Error | unknown`, `entityLabel?: string` (es. "i tuoi contatti"), `onRetry?: () => void`.

Mostra:
- Icona `AlertTriangle` in cerchio `bg-destructive/10`
- "Non siamo riusciti a caricare {entityLabel}." (default "i dati")
- Sotto, in piccolo: "Riprova fra un attimo. Se il problema continua, contatta l'amministratore."
- Bottoni: "Ricarica" (chiama `onRetry` o `window.location.reload()`) + link ghost "Segnala il problema" → `mailto:supporto@gruppobenessere.it?subject=Errore CRM&body=ID errore: {errorId}` con `errorId` = `crypto.randomUUID().slice(0,8)` generato al mount.
- `<details>` collassato con `error.message` (no stack), per power user.

### 3. `PageLoader` migliorato (`src/components/ui/PageLoader.tsx`)

Aggiungere due stati di cortesia:
- **>2s**: messaggio inline `text-muted-foreground` "Stiamo caricando…" sotto lo skeleton.
- **>5s**: card "Sta richiedendo più del previsto. Vuoi riprovare?" + bottoni `Ricarica` (esistente) + `Continua ad attendere` (chiude solo l'avviso).
- **>8s** resta l'attuale messaggio "Caricamento più lento del previsto" (compatibile col fallback `slowAfterMs`).

Implementazione: due `useState`+`useEffect` con timer 2000/5000ms (oltre all'attuale 8000ms).

### 4. `ErrorBoundary` globale arricchito (`src/components/ui/ErrorBoundary.tsx`)

In `getDerivedStateFromError` generare un `errorId = Math.random().toString(36).slice(2,10).toUpperCase()` e salvarlo in `state`. Nel render full-page (non `compact`):
- Mantenere icona + titolo + messaggio user-friendly ("Qualcosa è andato storto. Niente panico, i tuoi dati sono salvi.")
- Aggiungere riga "ID errore: `{errorId}`" copiabile (`navigator.clipboard.writeText` con toast).
- Aggiungere bottone "Torna alla dashboard" → `window.location.assign('/dashboard')`.
- Pulsanti finali: `Riprova` (esistente), `Torna alla dashboard` (nuovo), `Ricarica pagina` (esistente).
- `<details>` con `error.message` per supporto.

### 5. Collegamento alle 3 liste

**`src/components/contacts/ContactsTable.tsx`** (riga 84-91): sostituire empty state inline con `<EmptyState icon={Users} title="Ancora nessun contatto" description="I contatti arrivano automaticamente dai webhook marketing oppure puoi crearne uno manualmente." actionLabel="Nuovo contatto" onAction={...} />`. Per `onAction` useremo `window.dispatchEvent(new CustomEvent('contacts:new'))` oppure import del dialog se già esistente — verificheremo pattern esistente in `Contacts.tsx` durante l'implementazione.

**`src/components/tickets/TicketsTable.tsx`** (riga 262-267): sostituire la cella "Nessun ticket trovato" con `<TableRow><TableCell colSpan={colSpan}><EmptyState icon={Ticket} title="Nessun ticket aperto" description="Quando un cliente apre una richiesta apparirà qui." actionLabel="Crea ticket" onAction={...} /></TableCell></TableRow>`.

**`src/pages/Pipeline.tsx`** (righe 157/167/177): passare `<EmptyState>` come children/render prop a `ClosedDealsTable` — manteniamo `emptyMessage` come fallback se la prop ricca non è disponibile, oppure rendiamo la sostituzione direttamente in `ClosedDealsTable` (lo verifichiamo). Su Kanban (`KanbanBoard`) per ora niente cambi: già ha logica per-colonna.

### 6. Error state nelle liste

Nelle 3 pagine (`Contacts.tsx`, `Tickets.tsx`, `Pipeline.tsx`) leggere `isError`/`error`/`refetch` dagli hook esistenti (`usePaginatedContactSearch`, `useTicketsSearch`, hook deals) e, prima del render della tabella:
```tsx
if (isError) return <QueryErrorState error={error} entityLabel="i tuoi contatti" onRetry={refetch} />;
```
Verificheremo che ogni hook esponga `isError`/`refetch` (TanStack Query lo fa di default).

### File toccati

**Creati**
- `src/components/ui/EmptyState.tsx`
- `src/components/ui/QueryErrorState.tsx`

**Modificati**
- `src/components/ui/PageLoader.tsx` (timer 2s/5s)
- `src/components/ui/ErrorBoundary.tsx` (errorId + "Torna alla dashboard" + copy umana)
- `src/components/contacts/ContactsTable.tsx` (empty state)
- `src/components/tickets/TicketsTable.tsx` (empty state)
- `src/pages/Contacts.tsx` (error state)
- `src/pages/Tickets.tsx` (error state + loader inline migliorato)
- `src/pages/Pipeline.tsx` (error state e empty state per ClosedDealsTable)

Nessuna nuova dipendenza, nessuna migration, nessuna RLS.