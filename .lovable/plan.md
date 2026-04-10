

## Piano: Ordinamento predefinito per ultima interazione + pulsante "Mostra tutti"

### Problema attuale
1. L'ordinamento predefinito è `updated_at desc` — dovrebbe essere `last_interaction_at desc`
2. La tabella carica solo 50 contatti alla volta senza modo di caricarli tutti in un colpo

### Modifiche previste

**1. Cambiare ordinamento predefinito a `last_interaction_at`**
- **File**: `src/pages/Contacts.tsx`
  - Cambiare `useState<SortField>('updated_at')` → `useState<SortField>('last_interaction_at')`
- **File**: `src/hooks/useContactSearch.ts`
  - Cambiare il default di `sortBy` da `"updated_at"` a `"last_interaction_at"` nel destructuring dei filtri
  - Gestire i null: ordinare con `nullsFirst: false` per mettere i contatti senza interazioni in fondo

**2. Aggiungere pulsante "Mostra tutti"**
- **File**: `src/pages/Contacts.tsx`
  - Aggiungere stato `showAll` (boolean)
  - Passare `showAll` al hook di paginazione
  - Mostrare il conteggio totale reale (query COUNT separata) accanto al pulsante
  - Posizionare il pulsante accanto al selettore vista nella toolbar

- **File**: `src/hooks/usePaginatedContactSearch.ts`
  - Accettare parametro `showAll`
  - Quando `showAll = true`, usare un `PAGE_SIZE` molto grande (es. 10000) per caricare tutto in una singola query
  - Mostrare indicatore di caricamento durante il fetch completo

- **File**: `src/hooks/useContactSearch.ts`
  - Aggiungere una query separata per il conteggio totale (`select('id', { count: 'exact', head: true })`) da esporre nella UI come "50 di 476"

- **File**: `src/components/contacts/ContactsTableWithViews.tsx`
  - Ricevere e mostrare `totalCount` nel header
  - Ricevere e rendere il pulsante "Mostra tutti" / "Mostra paginati" accanto alla vista

### Dettagli tecnici

- La query COUNT usa `.head: true` per non trasferire dati, solo il conteggio
- Quando "Mostra tutti" è attivo, il limit viene impostato a 10000 e offset a 0
- Il pulsante cambia testo in "Mostra paginati" quando attivo, per tornare alla modalità 50-alla-volta
- Il contatore nell'header diventa "50 di 476" invece di solo "50 caricati"

