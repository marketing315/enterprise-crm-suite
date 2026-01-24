import { useState } from "react";
import { toast } from "sonner";
import { TagBadge } from "./TagBadge";
import { TagSelector } from "./TagSelector";
import { 
  useEntityTags, 
  useAssignTag, 
  useRemoveTag,
  type TagAssignment 
} from "@/hooks/useTags";
import type { TagScope } from "@/types/database";

interface EntityTagListProps {
  entityType: "contact" | "event" | "deal";
  entityId: string;
  scope?: TagScope;
  editable?: boolean;
  size?: "sm" | "md";
}

export function EntityTagList({
  entityType,
  entityId,
  scope,
  editable = true,
  size = "md",
}: EntityTagListProps) {
  const { data: assignments = [], isLoading } = useEntityTags(entityType, entityId);
  const assignTag = useAssignTag();
  const removeTag = useRemoveTag();

  const selectedTagIds = assignments.map((a) => a.tag_id);

  const handleSelect = async (tagId: string) => {
    try {
      await assignTag.mutateAsync({
        tagId,
        entityType,
        entityId,
      });
      toast.success("Tag aggiunto");
    } catch {
      toast.error("Errore nell'aggiunta del tag");
    }
  };

  const handleDeselect = async (tagId: string) => {
    const assignment = assignments.find((a) => a.tag_id === tagId);
    if (!assignment) return;

    try {
      await removeTag.mutateAsync({
        assignmentId: assignment.id,
        entityType,
        entityId,
      });
      toast.success("Tag rimosso");
    } catch {
      toast.error("Errore nella rimozione del tag");
    }
  };

  const handleRemove = async (assignment: TagAssignment) => {
    try {
      await removeTag.mutateAsync({
        assignmentId: assignment.id,
        entityType,
        entityId,
      });
      toast.success("Tag rimosso");
    } catch {
      toast.error("Errore nella rimozione del tag");
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-1.5 flex-wrap">
        <div className="h-6 w-16 bg-muted animate-pulse rounded-full" />
        <div className="h-6 w-20 bg-muted animate-pulse rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      {assignments.map((assignment) => (
        <TagBadge
          key={assignment.id}
          name={assignment.tag?.name || "..."}
          color={assignment.tag?.color}
          size={size}
          onRemove={editable ? () => handleRemove(assignment) : undefined}
        />
      ))}
      
      {editable && (
        <TagSelector
          selectedTagIds={selectedTagIds}
          onSelect={handleSelect}
          onDeselect={handleDeselect}
          scope={scope}
          disabled={assignTag.isPending || removeTag.isPending}
        />
      )}
      
      {!editable && assignments.length === 0 && (
        <span className="text-sm text-muted-foreground">Nessun tag</span>
      )}
    </div>
  );
}
