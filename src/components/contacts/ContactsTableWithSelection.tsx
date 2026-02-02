import { useState } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Phone, Mail, MapPin, Eye, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ContactStatusBadge } from './ContactStatusBadge';
import { ContactDetailSheet } from './ContactDetailSheet';
import { ContactsBulkActionsBar } from './ContactsBulkActionsBar';
import { useDeleteContact } from '@/hooks/useContacts';
import { toast } from 'sonner';
import type { ContactWithPhones } from '@/types/database';

interface ContactsTableWithSelectionProps {
  contacts: ContactWithPhones[];
  isLoading: boolean;
}

export function ContactsTableWithSelection({ contacts, isLoading }: ContactsTableWithSelectionProps) {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<ContactWithPhones | null>(null);
  const deleteContact = useDeleteContact();

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(contacts.map(c => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectedContacts = contacts.filter(c => selectedIds.has(c.id));
  const allSelected = contacts.length > 0 && selectedIds.size === contacts.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < contacts.length;

  const handleDeleteClick = (contact: ContactWithPhones) => {
    setContactToDelete(contact);
    setDeleteDialogOpen(true);
  };

  const handleFirstConfirm = () => {
    setDeleteDialogOpen(false);
    setConfirmDeleteOpen(true);
  };

  const handleFinalDelete = async () => {
    if (!contactToDelete) return;
    
    try {
      await deleteContact.mutateAsync(contactToDelete.id);
      toast.success('Contatto eliminato');
    } catch (error: any) {
      toast.error(error.message || 'Errore durante l\'eliminazione');
    } finally {
      setConfirmDeleteOpen(false);
      setContactToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setConfirmDeleteOpen(false);
    setContactToDelete(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-lg">Nessun contatto trovato</p>
        <p className="text-sm">I contatti appariranno qui quando arriveranno via webhook</p>
      </div>
    );
  }

  const getPrimaryPhone = (contact: ContactWithPhones) => {
    const primary = contact.contact_phones?.find(p => p.is_primary && p.is_active);
    return primary?.phone_normalized || contact.contact_phones?.[0]?.phone_normalized || '-';
  };

  const getFullName = (contact: ContactWithPhones) => {
    const parts = [contact.first_name, contact.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Senza nome';
  };

  return (
    <>
      <div className="rounded-md border overflow-auto max-h-[calc(100vh-280px)]">
        <Table className="min-w-[750px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      (el as any).indeterminate = someSelected;
                    }
                  }}
                  onCheckedChange={handleSelectAll}
                  aria-label="Seleziona tutti"
                />
              </TableHead>
              <TableHead className="min-w-[120px]">Nome</TableHead>
              <TableHead className="min-w-[120px]">Telefono</TableHead>
              <TableHead className="min-w-[150px]">Email</TableHead>
              <TableHead className="w-[100px]">Città</TableHead>
              <TableHead className="w-[90px]">Stato</TableHead>
              <TableHead className="w-[90px]">Data</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow 
                key={contact.id}
                className={selectedIds.has(contact.id) ? "bg-muted/50" : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(contact.id)}
                    onCheckedChange={(checked) => handleSelectOne(contact.id, !!checked)}
                    aria-label={`Seleziona ${getFullName(contact)}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {getFullName(contact)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {getPrimaryPhone(contact)}
                  </div>
                </TableCell>
                <TableCell>
                  {contact.email ? (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="max-w-[180px] truncate">{contact.email}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {contact.city ? (
                    <div className="flex items-center gap-1.5 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {contact.city}
                      {contact.cap && ` (${contact.cap})`}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <ContactStatusBadge status={contact.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(contact.created_at), 'dd MMM yyyy', { locale: it })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedContactId(contact.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteClick(contact)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Bulk actions bar */}
      <ContactsBulkActionsBar
        selectedContacts={selectedContacts}
        onClearSelection={handleClearSelection}
        allContacts={contacts}
      />

      <ContactDetailSheet
        contactId={selectedContactId}
        open={!!selectedContactId}
        onOpenChange={(open) => !open && setSelectedContactId(null)}
      />

      {/* First confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo contatto?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare <strong>{contactToDelete ? [contactToDelete.first_name, contactToDelete.last_name].filter(Boolean).join(' ') || 'questo contatto' : ''}</strong>.
              Questa azione richiede una doppia conferma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFirstConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continua
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second confirmation dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Conferma eliminazione definitiva</AlertDialogTitle>
            <AlertDialogDescription>
              Sei assolutamente sicuro? Il contatto <strong>{contactToDelete ? [contactToDelete.first_name, contactToDelete.last_name].filter(Boolean).join(' ') || 'selezionato' : ''}</strong> e tutti i dati associati verranno eliminati permanentemente. 
              <br /><br />
              <span className="font-semibold text-destructive">Questa azione è irreversibile.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFinalDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteContact.isPending}
            >
              {deleteContact.isPending ? 'Eliminazione...' : 'Elimina definitivamente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
