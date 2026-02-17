import { useState } from "react";
import { Trash2, Tags, Download, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useTags } from "@/hooks/useTags";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ContactWithPhones } from "@/types/database";

interface ContactsBulkActionsBarProps {
  selectedContacts: ContactWithPhones[];
  onClearSelection: () => void;
  allContacts: ContactWithPhones[];
}

export function ContactsBulkActionsBar({
  selectedContacts,
  onClearSelection,
  allContacts,
}: ContactsBulkActionsBarProps) {
  const { currentBrand } = useBrand();
  const { data: tags = [] } = useTags("contact");
  const queryClient = useQueryClient();
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [isTagging, setIsTagging] = useState(false);

  const count = selectedContacts.length;

  // Delete handlers
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleFirstConfirm = () => {
    setDeleteDialogOpen(false);
    setConfirmDeleteOpen(true);
  };

  const handleFinalDelete = async () => {
    setIsDeleting(true);
    try {
      const ids = selectedContacts.map(c => c.id);
      const { error } = await supabase
        .from("contacts")
        .delete()
        .in("id", ids);
      
      if (error) throw error;
      
      toast.success(`${count} contatti eliminati`);
      onClearSelection();
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    } catch (error: any) {
      toast.error(error.message || "Errore durante l'eliminazione");
    } finally {
      setIsDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  // Tag handlers
  const handleApplyTags = async () => {
    if (selectedTagIds.size === 0) {
      toast.error("Seleziona almeno un tag");
      return;
    }
    
    setIsTagging(true);
    try {
      const contactIds = selectedContacts.map(c => c.id);
      const tagIds = Array.from(selectedTagIds);
      
      // R03 FIX: Use each contact's own brand_id instead of currentBrand.id
      // to avoid writing system brand or wrong brand in all-brands view
      const contactBrandMap = new Map(selectedContacts.map(c => [c.id, c.brand_id]));
      const assignments = contactIds.flatMap(contactId =>
        tagIds.map(tagId => ({
          brand_id: contactBrandMap.get(contactId) || currentBrand!.id,
          contact_id: contactId,
          tag_id: tagId,
          assigned_by: "user" as const,
        }))
      );

      // Use upsert with the actual unique constraint
      const { error } = await supabase
        .from("tag_assignments")
        .upsert(assignments, { 
          onConflict: "tag_id,contact_id",
          ignoreDuplicates: true 
        });
      
      if (error) throw error;
      
      toast.success(`Tag applicati a ${count} contatti`);
      setTagPopoverOpen(false);
      setSelectedTagIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    } catch (error: any) {
      toast.error(error.message || "Errore durante l'applicazione dei tag");
    } finally {
      setIsTagging(false);
    }
  };

  // Export handler
  const handleExport = () => {
    const headers = ["Nome", "Cognome", "Email", "Telefono", "Città", "CAP", "Stato", "Creato il"];
    const rows = selectedContacts.map(c => {
      const phone = c.contact_phones?.find(p => p.is_primary)?.phone_normalized || 
                    c.contact_phones?.[0]?.phone_normalized || "";
      return [
        c.first_name || "",
        c.last_name || "",
        c.email || "",
        phone,
        c.city || "",
        c.cap || "",
        c.status,
        new Date(c.created_at).toLocaleDateString("it-IT"),
      ];
    });

    const csv = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contatti_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(`${count} contatti esportati`);
  };

  if (count === 0) return null;

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-lg rounded-lg px-4 py-3 flex items-center gap-3">
        <Badge variant="secondary" className="text-sm">
          {count} selezionati
        </Badge>

        <div className="flex items-center gap-2">
          {/* Tag button */}
          <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Tags className="h-4 w-4" />
                Tag
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="center">
              <div className="space-y-3">
                <p className="text-sm font-medium">Applica tag</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {tags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessun tag disponibile</p>
                  ) : (
                    tags.map(tag => (
                      <div key={tag.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`tag-${tag.id}`}
                          checked={selectedTagIds.has(tag.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedTagIds);
                            if (checked) {
                              next.add(tag.id);
                            } else {
                              next.delete(tag.id);
                            }
                            setSelectedTagIds(next);
                          }}
                        />
                        <label 
                          htmlFor={`tag-${tag.id}`}
                          className="text-sm flex items-center gap-2 cursor-pointer"
                        >
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
                <Button 
                  size="sm" 
                  className="w-full" 
                  onClick={handleApplyTags}
                  disabled={isTagging || selectedTagIds.size === 0}
                >
                  {isTagging ? "Applicazione..." : "Applica"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Export button */}
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Esporta
          </Button>

          {/* Delete button */}
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2 text-destructive hover:text-destructive"
            onClick={handleDeleteClick}
          >
            <Trash2 className="h-4 w-4" />
            Elimina
          </Button>
        </div>

        {/* Clear selection */}
        <Button variant="ghost" size="icon" onClick={onClearSelection}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* First confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Eliminare {count} contatti?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare <strong>{count}</strong> contatti selezionati.
              Questa azione richiede una doppia conferma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel asChild>
              <Button variant="outline">Annulla</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={handleFirstConfirm}
              >
                Continua
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second confirmation dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              ⚠️ Conferma eliminazione definitiva
            </AlertDialogTitle>
            <AlertDialogDescription>
              Sei assolutamente sicuro? <strong>{count}</strong> contatti e tutti i dati 
              associati (eventi, deal, ticket) verranno eliminati permanentemente.
              <br /><br />
              <span className="font-semibold text-destructive">
                Questa azione è irreversibile.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel asChild>
              <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
                Annulla
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={handleFinalDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Eliminazione..." : "Elimina definitivamente"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
