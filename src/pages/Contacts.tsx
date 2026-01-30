import { useState } from 'react';
import { Users, Filter, SlidersHorizontal, Building2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ContactsTableWithViews } from '@/components/contacts/ContactsTableWithViews';
import { NewContactDialog } from '@/components/contacts/NewContactDialog';
import { ContactSearch } from '@/components/contacts/ContactSearch';
import { ContactDetailSheet } from '@/components/contacts/ContactDetailSheet';
import { TagFilter } from '@/components/tags/TagFilter';
import { useContactSearch } from '@/hooks/useContactSearch';
import { useBrand } from '@/contexts/BrandContext';
import { useIsMobile } from '@/hooks/use-mobile';
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
  const isMobile = useIsMobile();
  const { currentBrand, isAllBrandsSelected, brands } = useBrand();
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>('all');
  
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
  // Include brand_name lookup for cross-brand view
  const contactsForTable = contacts
    .filter(c => {
      // Apply brand filter in all-brands mode
      if (isAllBrandsSelected && brandFilter !== 'all') {
        return c.id.startsWith(brandFilter); // Simplified - should match brand_id
      }
      return true;
    })
    .map((c) => {
      const brand = brands.find(b => b.id === (c as unknown as { brand_id?: string }).brand_id);
      return {
        ...c,
        brand_id: '',
        brand_name: brand?.name || '',
        address: null as string | null,
        contact_phones: c.primary_phone 
          ? [{ id: '', brand_id: '', contact_id: c.id, phone_raw: c.primary_phone, phone_normalized: c.primary_phone, country_code: 'IT', assumed_country: true, is_primary: true, is_active: true, created_at: '' }]
          : [],
      };
    });

  const activeFiltersCount = (statusFilter !== 'all' ? 1 : 0) + (selectedTagIds.length > 0 ? 1 : 0);

  const FiltersContent = () => (
    <div className="space-y-4">
      {isAllBrandsSelected && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Brand</label>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filtra per brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i brand</SelectItem>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Stato</label>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ContactStatus | 'all')}
        >
          <SelectTrigger className="w-full">
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
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Tag</label>
        <TagFilter
          selectedTagIds={selectedTagIds}
          onTagsChange={setSelectedTagIds}
          scope="contact"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-semibold">Contatti</h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                {contacts.length} {searchQuery ? 'trovati' : 'totali'}
              </p>
            </div>
          </div>
          <NewContactDialog
            onContactCreated={handleContactCreated}
            onDuplicateFound={handleDuplicateFound}
          />
        </div>

        {/* Search + Filters */}
        <div className="flex gap-2">
          <div className="flex-1">
            <ContactSearch
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </div>
          
          {isMobile ? (
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="relative shrink-0">
                  <SlidersHorizontal className="h-4 w-4" />
                  {activeFiltersCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                      {activeFiltersCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[50vh]">
                <SheetHeader>
                  <SheetTitle>Filtri</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <FiltersContent />
                </div>
              </SheetContent>
            </Sheet>
          ) : (
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
              <TagFilter
                selectedTagIds={selectedTagIds}
                onTagsChange={setSelectedTagIds}
                scope="contact"
              />
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <ContactsTableWithViews 
        contacts={contactsForTable} 
        isLoading={isLoading} 
        showBrandColumn={isAllBrandsSelected}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailSheet
        contactId={selectedContactId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
