import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { ContactTableView } from "@/hooks/useTableViews";

interface EditViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: ContactTableView | null;
  onUpdate: (id: string, updates: { name?: string; is_default?: boolean }) => void;
  onDelete: (id: string) => void;
  isPending?: boolean;
}

export function EditViewDialog({
  open,
  onOpenChange,
  view,
  onUpdate,
  onDelete,
  isPending,
}: EditViewDialogProps) {
  const [name, setName] = useState(view?.name || "");
  const [isDefault, setIsDefault] = useState(view?.is_default || false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync state when view changes
  useState(() => {
    if (view) {
      setName(view.name);
      setIsDefault(view.is_default);
    }
  });

  const handleSave = () => {
    if (!view || !name.trim()) return;
    onUpdate(view.id, { name: name.trim(), is_default: isDefault });
  };

  const handleDelete = () => {
    if (!view) return;
    onDelete(view.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  if (!view) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Modifica vista
            </DialogTitle>
            <DialogDescription>
              Modifica il nome o le impostazioni della vista.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-view-name">Nome vista</Label>
              <Input
                id="edit-view-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-is-default"
                checked={isDefault}
                onCheckedChange={(checked) => setIsDefault(checked === true)}
              />
              <Label htmlFor="edit-is-default" className="text-sm font-normal">
                Imposta come vista predefinita
              </Label>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              className="sm:mr-auto"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || isPending}>
              {isPending ? "Salvataggio..." : "Salva modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa vista?</AlertDialogTitle>
            <AlertDialogDescription>
              La vista "{view.name}" verrà eliminata definitivamente. Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
