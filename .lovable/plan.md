

## Piano: Aggiungere "+ Aggiungi Brand" nel selettore brand

### Cosa cambia

Nel componente `BrandSelector.tsx`, aggiungeremo un pulsante "+ Aggiungi Brand" in fondo al menu a tendina del `Select`, visibile solo agli admin. Cliccandolo si aprirà un dialog per creare un nuovo brand (nome + slug), riutilizzando la stessa logica di inserimento già presente in `BrandManagementCard.tsx`.

### Dettagli tecnici

**File: `src/components/layout/BrandSelector.tsx`**
- Aggiungere stato locale per il dialog di creazione (`dialogOpen`, `newBrandName`, `newBrandSlug`)
- Aggiungere una `useMutation` per l'inserimento nella tabella `brands` (stessa logica di `BrandManagementCard`)
- Dopo la lista degli `SelectItem`, inserire un separatore e un bottone `+ Aggiungi Brand` (usando `SelectSeparator` o un elemento custom fuori dal `SelectContent` — più probabilmente un `Dialog` attivato da un bottone sotto il `Select`)
- Il bottone sarà visibile solo se `isAdmin` è `true`
- Dopo la creazione, invalidare la query `brands` e selezionare automaticamente il nuovo brand

**Approccio UI**: Siccome `Select` di Radix non supporta facilmente elementi interattivi dentro `SelectContent`, useremo un `Popover` custom al posto del `Select`, oppure aggiungeremo il bottone "+ Aggiungi Brand" subito sotto il `SelectContent` come ultimo item che chiude il select e apre un `Dialog`. L'approccio più pulito è rendere l'ultimo `SelectItem` un trigger che, una volta selezionato, apre il dialog di creazione anziché cambiare brand.

