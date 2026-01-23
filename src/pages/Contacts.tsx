import { useState } from 'react';
import { Users, Filter } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { NewContactDialog } from '@/components/contacts/NewContactDialog';
import { ContactSearch } from '@/components/contacts/ContactSearch';
import { ContactDetailSheet } from '@/components/contacts/ContactDetailSheet';
import { useContactSearch } from '@/hooks/useContactSearch';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  
  const { data: contacts = [], isLoading } = useContactSearch(
    searchQuery,
    statusFilter === 'all' ? undefined : statusFilter
  );

  const handleContactCreated = (contactId: string) => {
    setSelectedContactId(contactId);
    setSheetOpen(true);
  };

  const handleDuplicateFound = (contactId: string) => {
    setSelectedContactId(contactId);
    setSheetOpen(true);
  };

  // Transform SearchResult to ContactWithPhones format for the table
  const contactsForTable = contacts.map((c) => ({
    ...c,
    brand_id: '',
    contact_phones: c.primary_phone 
      ? [{ id: '', brand_id: '', contact_id: c.id, phone_raw: c.primary_phone, phone_normalized: '', country_code: 'IT', assumed_country: true, is_primary: true, is_active: true, created_at: '' }]
      : [],
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Contatti</h1>
            <p className="text-sm text-muted-foreground">
              {contacts.length} contatti {searchQuery ? 'trovati' : 'totali'}
            </p>
          </div>
        </div>
        <NewContactDialog
          onContactCreated={handleContactCreated}
          onDuplicateFound={handleDuplicateFound}
        />
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <ContactSearch
          value={searchQuery}
          onChange={setSearchQuery}
        />
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
      <ContactsTable contacts={contactsForTable} isLoading={isLoading} />

      {/* Contact Detail Sheet */}
      <ContactDetailSheet
        contactId={selectedContactId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
