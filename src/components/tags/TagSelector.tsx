import { useState, useMemo } from "react";
import { Check, ChevronRight, Plus, Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTags, useTagTree, type Tag, type TagTreeItem } from "@/hooks/useTags";
import type { TagScope } from "@/types/database";

interface TagSelectorProps {
  selectedTagIds: string[];
  onSelect: (tagId: string) => void;
  onDeselect: (tagId: string) => void;
  scope?: TagScope;
  placeholder?: string;
  disabled?: boolean;
}

export function TagSelector({
  selectedTagIds,
  onSelect,
  onDeselect,
  scope,
  placeholder = "Aggiungi tag...",
  disabled = false,
}: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: tags = [] } = useTags(scope);
  const { data: tagTree = [] } = useTagTree();

  // Filter tags based on search
  const filteredTags = useMemo(() => {
    if (!search.trim()) return tags;
    const lower = search.toLowerCase();
    return tags.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.description?.toLowerCase().includes(lower)
    );
  }, [tags, search]);

  const handleToggle = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onDeselect(tagId);
    } else {
      onSelect(tagId);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          {placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca tag..."
              className="h-8 pl-8"
            />
          </div>
        </div>
        <ScrollArea className="h-[200px]">
          {filteredTags.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nessun tag trovato
            </div>
          ) : (
            <div className="p-1">
              {filteredTags.map((tag) => (
                <TagItem
                  key={tag.id}
                  tag={tag}
                  isSelected={selectedTagIds.includes(tag.id)}
                  onToggle={() => handleToggle(tag.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

interface TagItemProps {
  tag: Tag;
  isSelected: boolean;
  onToggle: () => void;
  depth?: number;
}

function TagItem({ tag, isSelected, onToggle, depth = 0 }: TagItemProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors",
        isSelected && "bg-accent"
      )}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: tag.color }}
      />
      <span className="flex-1 text-left truncate">{tag.name}</span>
      {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
    </button>
  );
}

// Tree view for hierarchical tag display
interface TagTreeViewProps {
  tags: TagTreeItem[];
  selectedTagIds: string[];
  onToggle: (tagId: string) => void;
}

export function TagTreeView({ tags, selectedTagIds, onToggle }: TagTreeViewProps) {
  return (
    <div className="space-y-0.5">
      {tags.map((tag) => (
        <TagTreeNode
          key={tag.id}
          tag={tag}
          selectedTagIds={selectedTagIds}
          onToggle={onToggle}
          depth={0}
        />
      ))}
    </div>
  );
}

interface TagTreeNodeProps {
  tag: TagTreeItem;
  selectedTagIds: string[];
  onToggle: (tagId: string) => void;
  depth: number;
}

function TagTreeNode({ tag, selectedTagIds, onToggle, depth }: TagTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = tag.children && tag.children.length > 0;
  const isSelected = selectedTagIds.includes(tag.id);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 rounded-md hover:bg-accent transition-colors cursor-pointer",
          isSelected && "bg-accent"
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren && (
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
        )}
        {!hasChildren && <div className="w-5" />}
        
        <button
          type="button"
          onClick={() => onToggle(tag.id)}
          className="flex-1 flex items-center gap-2 text-left"
        >
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: tag.color }}
          />
          <span className="truncate">{tag.name}</span>
          {isSelected && <Check className="h-4 w-4 text-primary ml-auto" />}
        </button>
      </div>
      
      {hasChildren && expanded && (
        <div>
          {tag.children!.map((child) => (
            <TagTreeNode
              key={child.id}
              tag={child}
              selectedTagIds={selectedTagIds}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
