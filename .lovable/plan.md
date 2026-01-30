
# Piano: Editor Avanzato Viste Tabella Contatti

## Obiettivo
Permettere agli utenti di personalizzare la tabella contatti con:
- Selezione tra viste salvate
- Salvataggio configurazione corrente come nuova vista
- Modifica/eliminazione viste esistenti
- Colonne custom fields dinamiche
- Riordino colonne con drag & drop

## Architettura della Soluzione

### Flusso Utente

```text
+---------------------------+
|  [Vista: Default v]       |  <- Selector viste salvate
+---------------------------+
|  [Colonne] [Salva vista]  |  <- Toolbar azioni
+---------------------------+
| Nome | Tel | Email | ...  |  <- Tabella con colonne configurabili
+---------------------------+
```

## Componenti da Creare

### 1. TableViewSelector
Dropdown per scegliere tra viste salvate:
- Mostra lista viste dell'utente
- Indica vista corrente attiva
- Azione rapida "Nuova vista"

### 2. SaveViewDialog
Dialog per salvare la configurazione attuale:
- Input nome vista
- Checkbox "Imposta come predefinita"
- Salva colonne + filtri attivi

### 3. EditViewDialog  
Dialog per modificare/eliminare vista:
- Rinomina
- Imposta come default
- Elimina (con conferma)

### 4. ColumnReorderPanel
Pannello avanzato per gestire colonne:
- Lista colonne con drag & drop
- Toggle visibilità per colonna
- Mostra anche custom fields disponibili

## Modifiche ai File Esistenti

### ContactsTableWithViews.tsx
- Aggiungere stato per vista selezionata
- Integrare custom fields come colonne opzionali
- Connettere il selector e le azioni di salvataggio

### useTableViews.ts
- Aggiungere hook per gestire lo stato della vista attiva
- Merge colonne default + custom fields

## Schema UI Finale

```text
┌────────────────────────────────────────────────────┐
│ Vista: [Sales view ▼]    [⚙ Colonne] [💾 Salva]    │
├────────────────────────────────────────────────────┤
│ Nome       │ Telefono │ Email │ [custom1] │ Data  │
├────────────┼──────────┼───────┼───────────┼───────┤
│ Mario R.   │ 333...   │ m@... │ valore    │ 29 gen│
└────────────────────────────────────────────────────┘
```

## File da Creare

| File | Descrizione |
|------|-------------|
| `src/components/contacts/views/TableViewSelector.tsx` | Dropdown selezione vista |
| `src/components/contacts/views/SaveViewDialog.tsx` | Dialog salvataggio nuova vista |
| `src/components/contacts/views/EditViewDialog.tsx` | Dialog modifica/elimina vista |
| `src/components/contacts/views/ColumnManager.tsx` | Pannello gestione colonne con drag & drop |

## File da Modificare

| File | Modifiche |
|------|-----------|
| `src/components/contacts/ContactsTableWithViews.tsx` | Integrare selector, custom fields, salvataggio |
| `src/hooks/useTableViews.ts` | Aggiungere hook per merging con custom fields |

## Dettaglio Tecnico

### Integrazione Custom Fields nelle Colonne
I custom fields (da `useFieldDefinitions`) vengono convertiti in `TableColumn`:

```typescript
const customFieldColumns: TableColumn[] = fieldDefinitions.map(f => ({
  key: `cf_${f.key}`,
  label: f.label,
  visible: false, // nascosti di default
  isCustomField: true,
  fieldDefinitionId: f.id,
}));
```

### Rendering Custom Fields nella Tabella
Il `renderCell` viene esteso per gestire `cf_*` keys:

```typescript
case key.startsWith('cf_'):
  const fieldKey = key.replace('cf_', '');
  const fieldValue = contactCustomFields[fieldKey];
  return <span>{fieldValue ?? '-'}</span>;
```

### Persistenza Vista Attiva
La vista selezionata viene salvata in localStorage per persistere tra sessioni:

```typescript
const [activeViewId, setActiveViewId] = useLocalStorage('contacts-view', 'default');
```

## Comportamento Mobile

Su mobile:
- Il selector vista diventa un full-width dropdown
- Il pannello colonne si apre come Sheet dal basso
- Drag & drop usa `@dnd-kit/sortable` (già installato)

## Sequenza Implementazione

1. Creare `TableViewSelector` per switching tra viste
2. Creare `SaveViewDialog` per salvare nuove viste  
3. Modificare `ContactsTableWithViews` per integrare selector e actions
4. Creare `ColumnManager` con drag & drop
5. Integrare custom fields come colonne dinamiche
6. Aggiungere `EditViewDialog` per modifica/eliminazione
7. Testare il flusso completo
