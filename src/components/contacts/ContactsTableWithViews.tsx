import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Phone, Mail, MapPin, Eye, Building2, Settings2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContactStatusBadge } from "./ContactStatusBadge";
import { ContactDetailSheet } from "./ContactDetailSheet";
import { useBrand } from "@/contexts/BrandContext";
import { useDefaultTableView, type TableColumn } from "@/hooks/useTableViews";
import type { ContactWithPhones } from "@/types/database";

interface ContactWithBrand extends ContactWithPhones {
  brand_name?: string;
}

interface ContactsTableProps {
  contacts: ContactWithBrand[];
  isLoading: boolean;
  showBrandColumn?: boolean;
}

export function ContactsTableWithViews({ contacts, isLoading, showBrandColumn }: ContactsTableProps) {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const { isAllBrandsSelected } = useBrand();
  const defaultView = useDefaultTableView();
  const [localColumns, setLocalColumns] = useState<TableColumn[]>(defaultView.columns);

  // Determine if brand column should show
  const shouldShowBrand = showBrandColumn ?? isAllBrandsSelected;

  // Get visible columns
  const visibleColumns = localColumns.filter((col) => {
    if (col.key === "brand_name") {
      return shouldShowBrand;
    }
    return col.visible;
  });

  const toggleColumn = (key: string) => {
    setLocalColumns((prev) =>
      prev.map((col) =>
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
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
      <div className="flex justify-end mb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings2 className="h-4 w-4" />
              Colonne
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Mostra colonne</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {localColumns.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.key}
                checked={col.key === "brand_name" ? shouldShowBrand : col.visible}
                onCheckedChange={() => toggleColumn(col.key)}
                disabled={col.key === "full_name"} // Name is always visible
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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

      <ContactDetailSheet
        contactId={selectedContactId}
        open={!!selectedContactId}
        onOpenChange={(open) => !open && setSelectedContactId(null)}
      />
    </>
  );
}
