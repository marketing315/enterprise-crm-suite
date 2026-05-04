## Mobile-first sui flussi quotidiani

Tre interventi mirati su Contatti, Ticket e detail-sheet senza toccare la logica esistente: sotto i 768px le tabelle diventano card impilate, le CTA principali diventano sticky in fondo allo sheet, e il click-to-call resta visibile in lista.

### 1. Card mobile per la lista Contatti

Nuovo componente `src/components/contacts/ContactCardMobile.tsx`:
- Card con padding generoso (`p-4`), nome in `font-semibold` + `ContactStatusBadge` in alto a destra.
- Riga telefono = link `tel:` ben visibile + `<ClickToCallButton variant="default" size="sm" showLabel>` a destra.
- Email troncata e città/CAP su righe separate `text-sm text-muted-foreground`.
- Tap sulla card (non sui bottoni) apre `ContactDetailSheet`.
- Pulsanti azione (Vedi, Elimina) in un `DropdownMenu` "kebab" in alto a destra.

In `ContactsTableWithViews.tsx`:
- `import { useIsMobile } from "@/hooks/use-mobile"`.
- Subito dopo l'`if (isLoading)` esistente, aggiungere:
  ```tsx
  if (isMobile) {
    return (
      <div className="space-y-3">
        {sortedContacts.map(c => (
          <ContactCardMobile
            key={c.id}
            contact={c}
            onOpen={() => setSelectedContactId(c.id)}
            onDelete={() => handleDeleteClick(c)}
          />
        ))}
        {/* riusa hasMore + load more bottone esistenti */}
      </div>
    );
  }
  ```
- La `<ContactDetailSheet>` rimane montata fuori dal branch.

Stesso trattamento — ma più snello — per `ContactsTable.tsx` (versione "semplice" usata altrove): sotto 768px stampa le stesse card.

### 2. Card mobile per la lista Ticket

Nuovo componente `src/components/tickets/TicketCardMobile.tsx`:
- Card con titolo in `font-semibold`, `TicketPriorityBadge` + `TicketStatusBadge` allineati.
- Nome contatto cliccabile (`tel:` se ha telefono primario), categoria in `text-xs text-muted-foreground`.
- Riga "Aging" (riusa la logica esistente in `TicketsTable`).
- Bottone "Prendi in carico" se `onTakeOwnership` passato.
- Tap apre `TicketDetailSheet` via `onTicketClick`.

In `TicketsTable.tsx` rendere il branch mobile prima del `<Table>`:
```tsx
if (isMobile) {
  return (
    <div className="space-y-3">
      {tickets.map(t => <TicketCardMobile key={t.id} ticket={t} ... />)}
    </div>
  );
}
```

### 3. CTA sticky in `ContactDetailSheet`

In fondo a `<SheetContent>` (riga 668), prima della `</SheetContent>`, aggiungere una barra:
```tsx
{contact && (
  <div className="sticky bottom-0 -mx-6 px-6 py-3 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex gap-2">
    <ClickToCallButton
      contactId={contact.id}
      phoneNumber={getPrimaryPhone()}
      variant="default"
      size="sm"
      showLabel
      className="flex-1"
    />
    <Button variant="outline" size="sm" className="flex-1" onClick={() => setTicketDialogOpen(true)}>
      <Ticket className="h-4 w-4 mr-1.5" /> Crea ticket
    </Button>
    <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/appointments?contactId=${contact.id}`)}>
      <Calendar className="h-4 w-4 mr-1.5" /> Appuntamento
    </Button>
  </div>
)}
```
La struttura esistente del Sheet già è `flex flex-col` quindi `sticky bottom-0` funziona dentro lo `ScrollArea` parent. Verificheremo: se la `ScrollArea` interna scava, useremo invece un wrapper flex con la barra fuori dal `Tabs` e contenuto `flex-1 overflow-hidden`.

### 4. CTA sticky in `TicketDetailSheet`

Stessa logica: barra sticky con bottoni "Chiama contatto" (se ticket ha contact con phone), "Aggiungi nota" (focus chat), "Cambia stato" (apre lo `Select` esistente o un piccolo dialog). Riusiamo `ClickToCallButton`.

### 5. Verifica click-to-call in lista

Già presente in `ContactsTable.tsx` riga 128 e `ContactsTableWithViews.tsx`. Il rischio è che sulle nuove card mobile sparisca: i nuovi `ContactCardMobile` lo ri-includono in modo prominente (icona + label "Chiama"). Anche `TicketCardMobile` ha "Chiama contatto" se il contatto associato ha telefono primario.

### File toccati

**Creati**
- `src/components/contacts/ContactCardMobile.tsx`
- `src/components/tickets/TicketCardMobile.tsx`

**Modificati**
- `src/components/contacts/ContactsTable.tsx` (branch mobile)
- `src/components/contacts/ContactsTableWithViews.tsx` (branch mobile + import `useIsMobile`)
- `src/components/tickets/TicketsTable.tsx` (branch mobile + import `useIsMobile`)
- `src/components/contacts/ContactDetailSheet.tsx` (CTA sticky in fondo)
- `src/components/tickets/TicketDetailSheet.tsx` (CTA sticky in fondo)

Nessuna nuova dipendenza, nessuna migration, nessuna RLS. La logica VOIspeed/`tel:` resta invariata: passa attraverso `ClickToCallButton` che già fa fallback a `tel:` su mobile.