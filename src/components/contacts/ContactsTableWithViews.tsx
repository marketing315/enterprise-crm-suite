import { useState, useEffect, useMemo } from "react";
import { format, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { Mail, Eye, Building2, Settings2, Save, Trash2, ShoppingCart } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteContact } from "@/hooks/useContacts";
import { useContactsSalesTotals } from "@/hooks/useContactsSales";
import { toast } from "sonner";
import { ContactStatusBadge } from "./ContactStatusBadge";
import { ContactDetailSheet } from "./ContactDetailSheet";
import { ContactsBulkActionsBar } from "./ContactsBulkActionsBar";
import { ClickToCallButton } from "./ClickToCallButton";
import { TableViewSelector } from "./views/TableViewSelector";
import { SaveViewDialog } from "./views/SaveViewDialog";
import { EditViewDialog } from "./views/EditViewDialog";
import { ColumnManager } from "./views/ColumnManager";
import { SortableFilterableHeader, type SortConfig, type DateFilter } from "./SortableFilterableHeader";
import { useBrand } from "@/contexts/BrandContext";
import { useActiveTableView } from "@/hooks/useActiveTableView";
import {
  useCreateTableView,
  useUpdateTableView,
  useDeleteTableView,
  type TableColumn,
  type ContactTableView,
  type TableFilters,
} from "@/hooks/useTableViews";
import type { ContactWithPhones } from "@/types/database";

interface ContactWithBrand extends ContactWithPhones {
  brand_name?: string;
  customFieldValues?: Record<string, string | number | boolean | null>;
}

interface ContactsTableProps {
  contacts: ContactWithBrand[];
  isLoading: boolean;
  showBrandColumn?: boolean;
  filters?: TableFilters;
}

export function ContactsTableWithViews({
  contacts,
  isLoading,
  showBrandColumn,
  filters = {},
}: ContactsTableProps) {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);
  const [editingView, setEditingView] = useState<ContactTableView | null>(null);
  
  // Sorting and date filtering state
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [dateFilters, setDateFilters] = useState<Record<string, DateFilter>>({});
  
  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<ContactWithBrand | null>(null);
  const deleteContact = useDeleteContact();
  
  // Sales totals for contacts
  const { data: salesTotals } = useContactsSalesTotals();

  // Date columns for special handling
  const dateColumns = ['created_at', 'updated_at'];

  // Sort and filter contacts
  const processedContacts = useMemo(() => {
    let result = [...contacts];

    // Apply date filters
    Object.entries(dateFilters).forEach(([key, filter]) => {
      if (filter.from || filter.to) {
        result = result.filter((contact) => {
          const dateValue = contact[key as keyof ContactWithBrand];
          if (!dateValue || typeof dateValue !== 'string') return true;
          
          const contactDate = new Date(dateValue);
          
          if (filter.from && isBefore(contactDate, startOfDay(filter.from))) {
            return false;
          }
          if (filter.to && isAfter(contactDate, endOfDay(filter.to))) {
            return false;
          }
          return true;
        });
      }
    });

    // Apply sorting
    if (sortConfig?.key && sortConfig?.direction) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof ContactWithBrand];
        const bValue = b[sortConfig.key as keyof ContactWithBrand];

        // Handle null/undefined
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return sortConfig.direction === 'asc' ? 1 : -1;
        if (bValue == null) return sortConfig.direction === 'asc' ? -1 : 1;

        // Compare dates
        if (dateColumns.includes(sortConfig.key)) {
          const aDate = new Date(aValue as string).getTime();
          const bDate = new Date(bValue as string).getTime();
          return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
        }

        // Compare strings
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.localeCompare(bValue);
          return sortConfig.direction === 'asc' ? comparison : -comparison;
        }

        return 0;
      });
    }

    return result;
  }, [contacts, sortConfig, dateFilters]);

  // Sort handler
  const handleSort = (key: string, direction: SortConfig['direction']) => {
    if (direction === null) {
      setSortConfig(null);
    } else {
      setSortConfig({ key, direction });
    }
  };

  // Date filter handler
  const handleDateFilterChange = (key: string, filter: DateFilter | null) => {
    setDateFilters((prev) => {
      if (!filter) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: filter };
    });
  };

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(processedContacts.map(c => c.id)));
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

  const selectedContacts = processedContacts.filter(c => selectedIds.has(c.id));
  const allSelected = processedContacts.length > 0 && selectedIds.size === processedContacts.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < processedContacts.length;
  
  const { isAllBrandsSelected } = useBrand();
  const {
    activeViewId,
    setActiveViewId,
    activeView,
    activeColumns,
    allAvailableColumns,
    views,
  } = useActiveTableView();

  // Local columns state for unsaved changes
  const [localColumns, setLocalColumns] = useState<TableColumn[]>(activeColumns);

  // Sync local columns when active view changes
  useEffect(() => {
    setLocalColumns(activeColumns);
  }, [activeViewId, activeColumns.length]);

  const createView = useCreateTableView();
  const updateView = useUpdateTableView();
  const deleteView = useDeleteTableView();

  // Determine if brand column should show
  const shouldShowBrand = showBrandColumn ?? isAllBrandsSelected;

  // Get visible columns
  const visibleColumns = localColumns.filter((col) => {
    if (col.key === "brand_name") {
      return shouldShowBrand;
    }
    return col.visible;
  });

  const handleSaveView = (params: { name: string; is_default: boolean }) => {
    createView.mutate(
      {
        name: params.name,
        columns: localColumns,
        filters,
        is_default: params.is_default,
      },
      {
        onSuccess: () => {
          setSaveDialogOpen(false);
        },
      }
    );
  };

  const handleUpdateView = (
    id: string,
    updates: { name?: string; is_default?: boolean }
  ) => {
    updateView.mutate(
      { id, updates },
      {
        onSuccess: () => {
          setEditDialogOpen(false);
          setEditingView(null);
        },
      }
    );
  };

  const handleDeleteView = (id: string) => {
    deleteView.mutate(id, {
      onSuccess: () => {
        if (activeViewId === id) {
          setActiveViewId("default");
        }
      },
    });
  };

  const handleEditView = (view: ContactTableView) => {
    setEditingView(view);
    setEditDialogOpen(true);
  };

  // Delete handlers
  const handleDeleteClick = (contact: ContactWithBrand, e: React.MouseEvent) => {
    e.stopPropagation();
    setContactToDelete(contact);
    setDeleteDialogOpen(true);
  };

  const handleFirstConfirm = () => {
    setDeleteDialogOpen(false);
    setConfirmDeleteOpen(true);
  };

  const handleFinalDelete = () => {
    if (!contactToDelete) return;
    
    deleteContact.mutate(contactToDelete.id, {
      onSuccess: () => {
        toast.success("Contatto eliminato con successo");
        setConfirmDeleteOpen(false);
        setContactToDelete(null);
      },
      onError: (error) => {
        toast.error("Errore durante l'eliminazione del contatto");
        console.error("Delete error:", error);
      },
    });
  };

  const getContactName = (contact: ContactWithBrand | null) => {
    if (!contact) return "";
    const parts = [contact.first_name, contact.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Senza nome";
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

  const getPrimaryPhone = (contact: ContactWithBrand) => {
    const primary = contact.contact_phones?.find((p) => p.is_primary && p.is_active);
    return primary?.phone_normalized || contact.contact_phones?.[0]?.phone_normalized || "-";
  };

  const getFullName = (contact: ContactWithBrand) => {
    const parts = [contact.first_name, contact.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Senza nome";
  };

  const renderCell = (contact: ContactWithBrand, columnKey: string) => {
    // Handle custom fields
    if (columnKey.startsWith("cf_")) {
      const fieldKey = columnKey.replace("cf_", "");
      const value = contact.customFieldValues?.[fieldKey];
      if (value === null || value === undefined) {
        return <span className="text-muted-foreground">-</span>;
      }
      if (typeof value === "boolean") {
        return <Badge variant={value ? "default" : "outline"}>{value ? "Sì" : "No"}</Badge>;
      }
      return <span className="text-sm">{String(value)}</span>;
    }

    switch (columnKey) {
      case "full_name":
        return <span className="font-medium">{getFullName(contact)}</span>;

      case "primary_phone":
        return (
          <div className="flex items-center gap-1.5 text-sm">
            <ClickToCallButton
              contactId={contact.id}
              phoneNumber={getPrimaryPhone(contact)}
              size="icon"
              variant="ghost"
              className="h-6 w-6"
            />
            <span>{getPrimaryPhone(contact)}</span>
          </div>
        );

      case "email":
        return contact.email ? (
          <div className="flex items-center gap-1.5 text-sm">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="max-w-[180px] truncate">{contact.email}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        );

      case "city":
        return contact.city ? (
          <span className="text-sm">
            {contact.city}
            {contact.cap && ` (${contact.cap})`}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );

      case "status":
        return <ContactStatusBadge status={contact.status} />;

      case "brand_name":
        return contact.brand_name ? (
          <Badge variant="outline" className="flex items-center gap-1 w-fit">
            <Building2 className="h-3 w-3" />
            {contact.brand_name}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        );

      case "created_at":
        return (
          <span className="text-sm text-muted-foreground">
            {format(new Date(contact.created_at), "dd MMM yyyy", { locale: it })}
          </span>
        );

      case "updated_at":
        return contact.updated_at ? (
          <span className="text-sm text-muted-foreground">
            {format(new Date(contact.updated_at), "dd MMM yyyy HH:mm", { locale: it })}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );

      case "first_name":
        return contact.first_name ? (
          <span className="text-sm">{contact.first_name}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );

      case "last_name":
        return contact.last_name ? (
          <span className="text-sm">{contact.last_name}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );

      case "cap":
        return contact.cap ? (
          <span className="text-sm">{contact.cap}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );

      case "address":
        return contact.address ? (
          <span className="text-sm max-w-[200px] truncate" title={contact.address}>
            {contact.address}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );

      case "notes":
        return contact.notes ? (
          <span className="text-sm max-w-[200px] truncate" title={contact.notes}>
            {contact.notes}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );

      case "sales_total": {
        const salesData = salesTotals?.get(contact.id);
        if (!salesData || salesData.count === 0) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <div className="flex items-center gap-1.5 text-sm">
            <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">€{salesData.total.toLocaleString("it-IT")}</span>
            <span className="text-muted-foreground">({salesData.count})</span>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <TableViewSelector
          views={views}
          activeViewId={activeViewId}
          onViewChange={setActiveViewId}
          onNewView={() => setSaveDialogOpen(true)}
          onEditView={handleEditView}
        />

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setColumnManagerOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
            Colonne
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setSaveDialogOpen(true)}
          >
            <Save className="h-4 w-4" />
            Salva vista
          </Button>
        </div>
      </div>

      {/* Table with horizontal and vertical scroll */}
      <div className="rounded-md border max-h-[calc(100vh-280px)] overflow-y-auto">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px] w-max">
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
              {visibleColumns.map((col) => (
                <TableHead key={col.key} className="min-w-[100px]">
                  <SortableFilterableHeader
                    label={col.label}
                    columnKey={col.key}
                    isDateColumn={dateColumns.includes(col.key)}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    dateFilter={dateColumns.includes(col.key) ? dateFilters[col.key] : undefined}
                    onDateFilterChange={dateColumns.includes(col.key) ? handleDateFilterChange : undefined}
                  />
                </TableHead>
              ))}
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedContacts.map((contact) => (
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
                {visibleColumns.map((col) => (
                  <TableCell key={col.key}>{renderCell(contact, col.key)}</TableCell>
                ))}
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
                      onClick={(e) => handleDeleteClick(contact, e)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
        allContacts={processedContacts}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailSheet
        contactId={selectedContactId}
        open={!!selectedContactId}
        onOpenChange={(open) => !open && setSelectedContactId(null)}
      />

      {/* Column Manager */}
      <ColumnManager
        open={columnManagerOpen}
        onOpenChange={setColumnManagerOpen}
        columns={localColumns}
        onColumnsChange={setLocalColumns}
      />

      {/* Save View Dialog */}
      <SaveViewDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        columns={localColumns}
        filters={filters}
        onSave={handleSaveView}
        isPending={createView.isPending}
      />

      {/* Edit View Dialog */}
      <EditViewDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        view={editingView}
        onUpdate={handleUpdateView}
        onDelete={handleDeleteView}
        isPending={updateView.isPending}
      />

      {/* First Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo contatto?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare il contatto <strong>{getContactName(contactToDelete)}</strong>.
              Vuoi procedere?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleFirstConfirm}>
              Continua
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second Delete Confirmation */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Conferma eliminazione definitiva
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Attenzione:</strong> questa azione è irreversibile. 
              Il contatto <strong>{getContactName(contactToDelete)}</strong> e tutti i dati associati 
              verranno eliminati permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFinalDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteContact.isPending}
            >
              {deleteContact.isPending ? "Eliminazione..." : "Elimina definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
