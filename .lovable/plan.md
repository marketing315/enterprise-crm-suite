

## Piano: Modifica inline di nome e colore delle fasi pipeline

Attualmente il dialogo "Gestisci Fasi" permette solo di riordinare, aggiungere e disattivare le fasi. Aggiungerò la possibilità di modificare **nome** e **colore** direttamente cliccando sulla fase.

### Cosa cambia

**`src/components/pipeline/ManageStagesDialog.tsx`**

1. **Click sul nome** → il testo diventa un campo `Input` editabile. Premendo Invio o perdendo il focus, il nome viene salvato tramite `useUpdatePipelineStage`.

2. **Click sul pallino colorato** → si apre un `input[type=color]` (o un popover con i colori predefiniti) per cambiare il colore della fase. Il salvataggio avviene alla selezione.

3. Il componente `SortableStageItem` riceverà una nuova prop `onUpdate` e gestirà internamente lo stato di editing (un semplice `isEditing` con stato locale).

4. L'hook `useUpdatePipelineStage` (già esistente in `usePipelineStagesAdmin.ts`) verrà importato e usato — nessuna modifica lato hook o database necessaria.

### Dettagli tecnici

- Stato locale `editingName` / `editingColor` nel componente `SortableStageItem`
- Click sul nome → `setEditingName(true)`, mostra `<Input>` con `autoFocus`, `onBlur` e `onKeyDown Enter` per salvare
- Click sul pallino → trigger di un `<input type="color">` nascosto via ref
- Chiamata `useUpdatePipelineStage().mutate({ stageId, name, color })` al salvataggio
- Stessa logica applicata anche alle fasi disattivate (sezione in basso)

File modificato: solo `ManageStagesDialog.tsx`.

