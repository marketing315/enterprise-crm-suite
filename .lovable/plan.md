
# Piano: Supporto "Tutti i brand" per Contatti

## Obiettivo
Quando viene selezionato "Tutti i brand", la sezione Contatti deve aggregare i contatti di tutti i brand accessibili all'utente. L'unica differenza rispetto alla vista singolo brand è la presenza di una colonna "Brand" che indica a quale brand appartiene ogni contatto.

## Problema attuale
L'hook `useContactSearch` filtra sempre per `currentBrand.id` singolo, non supportando l'aggregazione multi-brand tramite `.in("brand_id", allBrandIds)` come fanno altri hook (es. `useNotifications`).

## Modifiche necessarie

### 1. Hook `useContactSearch` (`src/hooks/useContactSearch.ts`)

Aggiungere il supporto per la modalita "All Brands":

- Importare `isAllBrandsSelected` e `allBrandIds` da `useBrand()`
- Nella query senza ricerca testuale:
  - Se `isAllBrandsSelected`: usare `.in("brand_id", allBrandIds)` invece di `.eq("brand_id", currentBrand.id)`
- Nella query con ricerca (RPC `search_contacts`):
  - Passare `null` come `p_brand_id` o modificare la RPC per accettare un array di brand IDs
- Aggiungere `brand_id` al tipo `SearchResult` e ai dati restituiti
- Aggiornare la `queryKey` per includere `isAllBrandsSelected`

### 2. Pagina Contatti (`src/pages/Contacts.tsx`)

Il file gestisce gia correttamente la visualizzazione:
- Passa `showBrandColumn={isAllBrandsSelected}` alla tabella
- Ha un filtro per brand quando "Tutti i brand" e attivo
- Mappa i contatti con `brand_name` cercando nel array `brands`

Problema: il mapping `brand_name` attuale non funziona perche `SearchResult` non include `brand_id`. Devo:
- Aggiungere `brand_id` al tipo e ai dati in `useContactSearch`
- Correggere il mapping in `Contacts.tsx` per usare il vero `brand_id`

### 3. (Opzionale) RPC `search_contacts`

Se la RPC e usata per la ricerca testuale, potrebbe essere necessario modificarla per accettare un array di brand IDs o `NULL` per tutti i brand accessibili.

## Schema della soluzione

```text
useContactSearch()
     |
     v
isAllBrandsSelected?
     |
   +---+---+
   |       |
  YES      NO
   |       |
   v       v
.in()   .eq()
   |       |
   +---+---+
       |
       v
  Risultati con brand_id
       |
       v
  Contacts.tsx mappa brand_name
       |
       v
  ContactsTableWithViews mostra colonna Brand
```

## Dettaglio tecnico

### Modifica a `SearchResult` in `useContactSearch.ts`:
```typescript
export interface SearchResult {
  id: string;
  brand_id: string;        // <-- NUOVO
  first_name: string | null;
  // ... resto invariato
}
```

### Modifica alla query senza ricerca:
```typescript
const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

let queryBuilder = supabase
  .from("contacts")
  .select(`
    id, brand_id, first_name, ...  // <-- aggiunto brand_id
  `)
  .order("updated_at", { ascending: false })
  .limit(limit);

// Filtro brand
if (isAllBrandsSelected) {
  queryBuilder = queryBuilder.in("brand_id", allBrandIds);
} else if (currentBrand) {
  queryBuilder = queryBuilder.eq("brand_id", currentBrand.id);
}
```

### Modifica al mapping in `Contacts.tsx`:
```typescript
const contactsForTable = contacts.map((c) => {
  const brand = brands.find(b => b.id === c.brand_id);
  return {
    ...c,
    brand_name: brand?.name || '',
    // ... resto invariato
  };
});
```

## File da modificare

| File | Modifiche |
|------|-----------|
| `src/hooks/useContactSearch.ts` | Supporto multi-brand, aggiunta `brand_id` ai risultati |
| `src/pages/Contacts.tsx` | Correzione mapping `brand_name` usando `c.brand_id` |

## Risultato atteso

1. Selezionando "Tutti i brand", la lista contatti mostra tutti i contatti di tutti i brand accessibili
2. La colonna "Brand" appare automaticamente, mostrando il nome del brand per ogni contatto
3. Il filtro per brand (gia presente) permette di restringere la vista a un singolo brand
4. La ricerca testuale funziona anche in modalita multi-brand
