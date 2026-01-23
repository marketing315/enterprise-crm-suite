import { useState } from 'react';
import { Users, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { useContacts } from '@/hooks/useContacts';
import type { ContactStatus } from '@/types/database';

const statusOptions: { value: ContactStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tutti gli stati' },
  { value: 'new', label: 'Nuovi' },
  { value: 'active', label: 'Attivi' },
  { value: 'qualified', label: 'Qualificati' },
  { value: 'unqualified', label: 'Non qualificati' },
  { value: 'archived', label: 'Archiviati' },
];

export default function Contacts() {
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all');
  
  const { data: contacts = [], isLoading } = useContacts(
    statusFilter === 'all' ? undefined : statusFilter
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Contatti</h1>
            <p className="text-sm text-muted-foreground">
              {contacts.length} contatti totali
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as ContactStatus | 'all')}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtra per stato" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <ContactsTable contacts={contacts} isLoading={isLoading} />
    </div>
  );
}
