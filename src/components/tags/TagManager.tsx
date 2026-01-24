import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronRight, Palette } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useTags,
  useTagTree,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  type Tag,
  type TagTreeItem,
} from "@/hooks/useTags";
import type { TagScope } from "@/types/database";

const SCOPE_OPTIONS: { value: TagScope; label: string }[] = [
  { value: "mixed", label: "Tutti" },
  { value: "contact", label: "Solo Contatti" },
  { value: "event", label: "Solo Eventi" },
  { value: "deal", label: "Solo Deal" },
];

const COLOR_PRESETS = [
  "#6366f1", // Indigo
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#14b8a6", // Teal
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
];

export function TagManager() {
  const { data: tags = [] } = useTags();
  const { data: tagTree = [] } = useTagTree();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-medium">Gestione Tag</CardTitle>
        <CreateTagDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          tags={tags}
          onCreate={async (data) => {
            try {
              await createTag.mutateAsync(data);
              toast.success("Tag creato");
              setCreateOpen(false);
            } catch {
              toast.error("Errore nella creazione del tag");
            }
          }}
          isLoading={createTag.isPending}
        />
      </CardHeader>
      <CardContent>
        {tagTree.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nessun tag configurato</p>
            <p className="text-sm mt-1">Crea il primo tag per iniziare</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-1">
              {tagTree.map((tag) => (
                <TagTreeRow
                  key={tag.id}
                  tag={tag}
                  depth={0}
                  onEdit={setEditTag}
                  onDelete={async (id) => {
                    try {
                      await deleteTag.mutateAsync(id);
                      toast.success("Tag eliminato");
                    } catch {
                      toast.error("Errore nell'eliminazione del tag");
                    }
                  }}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Edit Dialog */}
      {editTag && (
        <EditTagDialog
          tag={editTag}
          tags={tags}
          open={!!editTag}
          onOpenChange={(open) => !open && setEditTag(null)}
          onUpdate={async (id, updates) => {
            try {
              await updateTag.mutateAsync({ id, updates });
              toast.success("Tag aggiornato");
              setEditTag(null);
            } catch {
              toast.error("Errore nell'aggiornamento del tag");
            }
          }}
          isLoading={updateTag.isPending}
        />
      )}
    </Card>
  );
}

interface TagTreeRowProps {
  tag: TagTreeItem;
  depth: number;
  onEdit: (tag: Tag) => void;
  onDelete: (id: string) => void;
}

function TagTreeRow({ tag, depth, onEdit, onDelete }: TagTreeRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = tag.children && tag.children.length > 0;

  return (
    <div>
      <div
        className="group flex items-center gap-2 py-2 px-2 rounded-md hover:bg-accent transition-colors"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 hover:bg-muted rounded"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                expanded && "rotate-90"
              )}
            />
          </button>
        ) : (
          <div className="w-5" />
        )}

        <span
          className="w-4 h-4 rounded-full shrink-0"
          style={{ backgroundColor: tag.color }}
        />

        <span className="flex-1 font-medium">{tag.name}</span>

        <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">
          {SCOPE_OPTIONS.find((s) => s.value === tag.scope)?.label || tag.scope}
        </span>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(tag as Tag)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminare "{tag.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  Questa azione non può essere annullata. Tutti i tag figli e le
                  assegnazioni saranno eliminate.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(tag.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Elimina
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {hasChildren && expanded && (
        <div>
          {tag.children!.map((child) => (
            <TagTreeRow
              key={child.id}
              tag={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CreateTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: Tag[];
  onCreate: (data: {
    name: string;
    parent_id?: string | null;
    description?: string;
    color?: string;
    scope?: TagScope;
  }) => Promise<void>;
  isLoading: boolean;
}

function CreateTagDialog({
  open,
  onOpenChange,
  tags,
  onCreate,
  isLoading,
}: CreateTagDialogProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [scope, setScope] = useState<TagScope>("mixed");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await onCreate({
      name: name.trim(),
      parent_id: parentId === "none" ? null : parentId,
      description: description.trim() || undefined,
      color,
      scope,
    });

    // Reset form
    setName("");
    setParentId("none");
    setDescription("");
    setColor(COLOR_PRESETS[0]);
    setScope("mixed");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          Nuovo Tag
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Crea Nuovo Tag</DialogTitle>
            <DialogDescription>
              Aggiungi un nuovo tag per organizzare contatti, eventi e deal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="es. Lead Caldo"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parent">Tag Padre (opzionale)</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nessun padre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun padre (root)</SelectItem>
                  {tags
                    .filter((t) => t.is_active)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scope">Ambito</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as TagScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Colore</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-8 h-8 rounded-full transition-all",
                      color === c && "ring-2 ring-offset-2 ring-primary"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione (opzionale)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descrizione del tag"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? "Creazione..." : "Crea Tag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EditTagDialogProps {
  tag: Tag;
  tags: Tag[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (
    id: string,
    updates: Partial<{
      name: string;
      parent_id: string | null;
      description: string;
      color: string;
      scope: TagScope;
    }>
  ) => Promise<void>;
  isLoading: boolean;
}

function EditTagDialog({
  tag,
  tags,
  open,
  onOpenChange,
  onUpdate,
  isLoading,
}: EditTagDialogProps) {
  const [name, setName] = useState(tag.name);
  const [parentId, setParentId] = useState<string>(tag.parent_id || "none");
  const [description, setDescription] = useState(tag.description || "");
  const [color, setColor] = useState(tag.color);
  const [scope, setScope] = useState<TagScope>(tag.scope);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await onUpdate(tag.id, {
      name: name.trim(),
      parent_id: parentId === "none" ? null : parentId,
      description: description.trim() || undefined,
      color,
      scope,
    });
  };

  // Filter out self and descendants from parent options
  const availableParents = tags.filter((t) => t.id !== tag.id && t.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Modifica Tag</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-parent">Tag Padre</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nessun padre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun padre (root)</SelectItem>
                  {availableParents.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-scope">Ambito</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as TagScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Colore</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-8 h-8 rounded-full transition-all",
                      color === c && "ring-2 ring-offset-2 ring-primary"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrizione</Label>
              <Input
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
