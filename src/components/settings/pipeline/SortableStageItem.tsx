import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GripVertical, Pencil, Trash2, Check, X } from "lucide-react";
import { useUpdatePipelineStage } from "@/hooks/usePipelineStagesAdmin";
import { cn } from "@/lib/utils";
import type { PipelineStage } from "@/types/database";

// Predefined stage colors
const STAGE_COLORS = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Green", value: "#22c55e" },
  { name: "Lime", value: "#84cc16" },
  { name: "Yellow", value: "#eab308" },
  { name: "Orange", value: "#f97316" },
  { name: "Red", value: "#ef4444" },
  { name: "Pink", value: "#ec4899" },
  { name: "Purple", value: "#a855f7" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Slate", value: "#64748b" },
  { name: "Gray", value: "#6b7280" },
  { name: "Zinc", value: "#71717a" },
];

interface SortableStageItemProps {
  stage: PipelineStage;
  index: number;
  onDelete: () => void;
  canDelete: boolean;
}

export function SortableStageItem({ stage, index, onDelete, canDelete }: SortableStageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(stage.name);
  const [editColor, setEditColor] = useState(stage.color || "#6366f1");
  const updateStage = useUpdatePipelineStage();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSave = async () => {
    const nameChanged = editName.trim() && editName !== stage.name;
    const colorChanged = editColor !== (stage.color || "#6366f1");
    
    if (nameChanged || colorChanged) {
      await updateStage.mutateAsync({ 
        stageId: stage.id, 
        name: nameChanged ? editName : undefined,
        color: colorChanged ? editColor : undefined,
      });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(stage.name);
    setEditColor(stage.color || "#6366f1");
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    setEditName(stage.name);
    setEditColor(stage.color || "#6366f1");
    setIsEditing(true);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 bg-card border rounded-lg group",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Order number */}
      <span className="text-xs text-muted-foreground w-5 text-center">{index + 1}</span>

      {/* Color indicator - clickable when editing */}
      {isEditing ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-6 h-6 rounded-full shrink-0 border-2 border-border hover:border-primary transition-colors cursor-pointer"
              style={{ backgroundColor: editColor }}
              title="Cambia colore"
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-5 gap-1.5">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={cn(
                    "w-6 h-6 rounded-full transition-all hover:scale-110",
                    editColor === c.value && "ring-2 ring-offset-2 ring-primary"
                  )}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setEditColor(c.value)}
                  title={c.name}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: stage.color || "#6366f1" }}
        />
      )}

      {/* Name */}
      {isEditing ? (
        <div className="flex items-center gap-2 flex-1">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="h-8"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8" 
            onClick={handleSave}
            disabled={updateStage.isPending}
          >
            <Check className="h-4 w-4 text-primary" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCancel}>
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      ) : (
        <>
          <span className="flex-1 font-medium">{stage.name}</span>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleStartEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {canDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}