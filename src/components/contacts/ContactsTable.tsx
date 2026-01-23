import { useState } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Phone, Mail, MapPin, Eye } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ContactStatusBadge } from './ContactStatusBadge';
import { ContactDetailSheet } from './ContactDetailSheet';
import type { ContactWithPhones } from '@/types/database';

interface ContactsTableProps {
  contacts: ContactWithPhones[];
  isLoading: boolean;
}

export function ContactsTable({ contacts, isLoading }: ContactsTableProps) {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

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
    return primary?.phone_raw || contact.contact_phones?.[0]?.phone_raw || '-';
  };

  const getFullName = (contact: ContactWithPhones) => {
    const parts = [contact.first_name, contact.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Senza nome';
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Città</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedContactId(contact.id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ContactDetailSheet
        contactId={selectedContactId}
        open={!!selectedContactId}
        onOpenChange={(open) => !open && setSelectedContactId(null)}
      />
    </>
  );
}
