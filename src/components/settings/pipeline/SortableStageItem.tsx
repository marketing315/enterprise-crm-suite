import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GripVertical, Pencil, Trash2, Check, X } from "lucide-react";
import { useUpdatePipelineStage } from "@/hooks/usePipelineStagesAdmin";
import type { PipelineStage } from "@/types/database";

interface SortableStageItemProps {
  stage: PipelineStage;
  index: number;
  onDelete: () => void;
  canDelete: boolean;
}

export function SortableStageItem({ stage, index, onDelete, canDelete }: SortableStageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(stage.name);
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
    if (editName.trim() && editName !== stage.name) {
      await updateStage.mutateAsync({ stageId: stage.id, name: editName });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(stage.name);
    setIsEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-card border rounded-lg group ${
        isDragging ? "opacity-50 shadow-lg" : ""
      }`}
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

      {/* Color indicator */}
      <div
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: stage.color || "#6366f1" }}
      />

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
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSave}>
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
              onClick={() => setIsEditing(true)}
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
