import { useMemo, useState } from "react";
import { Check, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useTags, type Tag } from "@/hooks/useTags";
import type { TagScope } from "@/types/database";
import { cn } from "@/lib/utils";

interface TagFilterProps {
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
  scope?: TagScope;
}

export function TagFilter({ selectedTagIds, onTagsChange, scope }: TagFilterProps) {
  const [open, setOpen] = useState(false);
  const { data: tags = [] } = useTags(scope);

  const handleToggle = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onTagsChange([...selectedTagIds, tagId]);
    }
  };

  const handleClear = () => {
    onTagsChange([]);
  };

  const selectedTags = useMemo(() => {
    return tags.filter((t) => selectedTagIds.includes(t.id));
  }, [tags, selectedTagIds]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            <span>Filtra per tag</span>
            {selectedTagIds.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {selectedTagIds.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <div className="p-2 border-b">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Filtra per Tag</span>
              {selectedTagIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={handleClear}
                >
                  Rimuovi tutti
                </Button>
              )}
            </div>
          </div>
          <ScrollArea className="h-[200px]">
            {tags.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Nessun tag disponibile
              </div>
            ) : (
              <div className="p-1">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleToggle(tag.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors",
                      selectedTagIds.includes(tag.id) && "bg-accent"
                    )}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 text-left truncate">{tag.name}</span>
                    {selectedTagIds.includes(tag.id) && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Selected tags as badges */}
      {selectedTags.map((tag) => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="gap-1 cursor-pointer"
          style={{
            backgroundColor: `${tag.color}20`,
            color: tag.color,
            borderColor: `${tag.color}40`,
          }}
          onClick={() => handleToggle(tag.id)}
        >
          {tag.name}
          <X className="h-3 w-3" />
        </Badge>
      ))}
    </div>
  );
}
