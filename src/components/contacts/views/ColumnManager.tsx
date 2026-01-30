import { useMemo } from "react";
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
import { GripVertical, Eye, EyeOff, Tag } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TableColumn } from "@/hooks/useTableViews";

interface ColumnManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: TableColumn[];
  onColumnsChange: (columns: TableColumn[]) => void;
}

interface SortableColumnItemProps {
  column: TableColumn;
  onToggle: (key: string) => void;
}

function SortableColumnItem({ column, onToggle }: SortableColumnItemProps) {
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
      className="flex items-center gap-3 p-3 bg-background border rounded-lg"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
        aria-label="Trascina per riordinare"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

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

export function ColumnManager({
  open,
  onOpenChange,
  columns,
  onColumnsChange,
}: ColumnManagerProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = columns.findIndex((c) => c.key === active.id);
      const newIndex = columns.findIndex((c) => c.key === over.id);
      onColumnsChange(arrayMove(columns, oldIndex, newIndex));
    }
  };

  const toggleColumn = (key: string) => {
    onColumnsChange(
      columns.map((col) =>
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const showAllColumns = () => {
    onColumnsChange(columns.map((col) => ({ ...col, visible: true })));
  };

  const hideOptionalColumns = () => {
    onColumnsChange(
      columns.map((col) => ({
        ...col,
        visible: col.key === "full_name" || col.key === "primary_phone",
      }))
    );
  };

  const visibleCount = columns.filter((c) => c.visible).length;
  const columnIds = useMemo(() => columns.map((c) => c.key), [columns]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Gestisci colonne
          </SheetTitle>
          <SheetDescription>
            Trascina per riordinare, usa gli switch per mostrare/nascondere.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between py-4 border-b">
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
              Mostra tutte
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-220px)] mt-4 pr-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={columnIds} strategy={verticalListSortingStrategy}>
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
      </SheetContent>
    </Sheet>
  );
}
