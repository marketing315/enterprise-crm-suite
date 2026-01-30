import { useState } from "react";
import { Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { TableColumn, TableFilters } from "@/hooks/useTableViews";

interface SaveViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: TableColumn[];
  filters: TableFilters;
  onSave: (params: { name: string; is_default: boolean }) => void;
  isPending?: boolean;
}

export function SaveViewDialog({
  open,
  onOpenChange,
  columns,
  filters,
  onSave,
  isPending,
}: SaveViewDialogProps) {
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), is_default: isDefault });
    setName("");
    setIsDefault(false);
  };

  const visibleColumnsCount = columns.filter((c) => c.visible).length;
  const activeFiltersCount = Object.keys(filters).filter(
    (k) => filters[k] !== undefined && filters[k] !== null
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            Salva vista
          </DialogTitle>
          <DialogDescription>
            Salva la configurazione attuale della tabella come nuova vista.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="view-name">Nome vista</Label>
            <Input
              id="view-name"
              placeholder="Es. Vista vendite, Contatti qualificati..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-default"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked === true)}
            />
            <Label htmlFor="is-default" className="text-sm font-normal">
              Imposta come vista predefinita
            </Label>
          </div>

          <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Colonne visibili</span>
              <span className="font-medium">{visibleColumnsCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Filtri attivi</span>
              <span className="font-medium">{activeFiltersCount}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isPending}>
            {isPending ? "Salvataggio..." : "Salva vista"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
