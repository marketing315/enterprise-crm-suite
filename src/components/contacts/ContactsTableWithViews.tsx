import { useState, useEffect } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Phone, Mail, MapPin, Eye, Building2, Settings2, Save } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ContactStatusBadge } from "./ContactStatusBadge";
import { ContactDetailSheet } from "./ContactDetailSheet";
import { TableViewSelector } from "./views/TableViewSelector";
import { SaveViewDialog } from "./views/SaveViewDialog";
import { EditViewDialog } from "./views/EditViewDialog";
import { ColumnManager } from "./views/ColumnManager";
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
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);
  const [editingView, setEditingView] = useState<ContactTableView | null>(null);
  
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
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            {getPrimaryPhone(contact)}
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
          <div className="flex items-center gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {contact.city}
            {contact.cap && ` (${contact.cap})`}
          </div>
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

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              {visibleColumns.map((col) => (
                <TableHead key={col.key} className="min-w-[100px]">
                  {col.label}
                </TableHead>
              ))}
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                {visibleColumns.map((col) => (
                  <TableCell key={col.key}>{renderCell(contact, col.key)}</TableCell>
                ))}
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
    </>
  );
}
