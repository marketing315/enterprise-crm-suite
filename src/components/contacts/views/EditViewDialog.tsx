import { useState, useEffect, useMemo, forwardRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Tag,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { ContactTableView, TableColumn } from "@/hooks/useTableViews";

/* ------------------------------------------------------------------ */
/*  Sortable column row (reused from ColumnManager pattern)           */
/* ------------------------------------------------------------------ */

interface SortableColumnItemProps {
  column: TableColumn;
  onToggle: (key: string) => void;
}

const SortableColumnItem = forwardRef<HTMLDivElement, SortableColumnItemProps>(
  function SortableColumnItem({ column, onToggle }, _ref) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: column.key });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const isCustomField = column.key.startsWith("cf_");
    const isNameColumn = column.key === "full_name";

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-3 p-3 bg-background border rounded-lg touch-none"
      >
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 -m-1"
          aria-label="Trascina per riordinare"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="flex-1 flex items-center gap-2">
          <span className={column.visible ? "font-medium" : "text-muted-foreground"}>
            {column.label}
          </span>
          {isCustomField && (
            <Badge variant="outline" className="text-xs gap-1">
              <Tag className="h-3 w-3" />
              Custom
            </Badge>
          )}
        </div>

        <Switch
          checked={column.visible}
          onCheckedChange={() => onToggle(column.key)}
          disabled={isNameColumn}
          aria-label={column.visible ? "Nascondi colonna" : "Mostra colonna"}
        />
      </div>
    );
  }
);

/* ------------------------------------------------------------------ */
/*  EditViewDialog – full edit sheet with columns management          */
/* ------------------------------------------------------------------ */

interface EditViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: ContactTableView | null;
  onUpdate: (
    id: string,
    updates: { name?: string; is_default?: boolean; columns?: TableColumn[] }
  ) => void;
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
  const [columns, setColumns] = useState<TableColumn[]>(view?.columns || []);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync state when view changes
  useEffect(() => {
    if (view) {
      setName(view.name);
      setIsDefault(view.is_default);
      setColumns(view.columns);
    }
  }, [view]);

  /* ---------- DnD sensors ---------- */
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumns((prev) => {
        const oldIndex = prev.findIndex((c) => c.key === active.id);
        const newIndex = prev.findIndex((c) => c.key === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const toggleColumn = (key: string) => {
    setColumns((prev) =>
      prev.map((col) =>
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const showAllColumns = () => {
    setColumns((prev) => prev.map((col) => ({ ...col, visible: true })));
  };

  const hideOptionalColumns = () => {
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        visible: col.key === "full_name" || col.key === "primary_phone",
      }))
    );
  };

  const visibleCount = columns.filter((c) => c.visible).length;
  const columnIds = useMemo(() => columns.map((c) => c.key), [columns]);

  /* ---------- Actions ---------- */
  const handleSave = () => {
    if (!view || !name.trim()) return;
    onUpdate(view.id, {
      name: name.trim(),
      is_default: isDefault,
      columns,
    });
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
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Modifica vista
            </SheetTitle>
            <SheetDescription>
              Modifica nome, colonne e impostazioni della vista.
            </SheetDescription>
          </SheetHeader>

          {/* Name + Settings */}
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-view-name">Nome vista</Label>
              <Input
                id="edit-view-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
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

          <Separator className="my-4" />

          {/* Columns section */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {visibleCount} di {columns.length} colonne visibili
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={hideOptionalColumns}>
                <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                Minimizza
              </Button>
              <Button variant="outline" size="sm" onClick={showAllColumns}>
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Tutte
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 mt-3 pr-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={columnIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {columns.map((column) => (
                    <SortableColumnItem
                      key={column.key}
                      column={column}
                      onToggle={toggleColumn}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </ScrollArea>

          {/* Footer actions */}
          <div className="flex items-center gap-2 pt-4 border-t mt-4">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Elimina
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Annulla
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!name.trim() || isPending}
            >
              {isPending ? "Salvataggio..." : "Salva modifiche"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa vista?</AlertDialogTitle>
            <AlertDialogDescription>
              La vista &quot;{view.name}&quot; verrà eliminata definitivamente.
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
