import { useState, useMemo } from "react";
import { Check, Plus, X, AlertCircle } from "lucide-react";
import { useClinicalTopics, useUpsertClinicalTopics } from "@/hooks/useClinicalTopics";
import type { ClinicalTopic } from "@/types/database";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ClinicalTopicsSelectorProps {
  selectedTopicIds: string[];
  onSelectionChange: (topicIds: string[]) => void;
  disabled?: boolean;
}

export function ClinicalTopicsSelector({
  selectedTopicIds,
  onSelectionChange,
  disabled = false,
}: ClinicalTopicsSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);
  const [newTopicText, setNewTopicText] = useState("");

  const { data: topics = [], isLoading } = useClinicalTopics();
  const upsertTopics = useUpsertClinicalTopics();

  const selectedTopics = useMemo(() => {
    return topics.filter((t) => selectedTopicIds.includes(t.id));
  }, [topics, selectedTopicIds]);

  const filteredTopics = useMemo(() => {
    if (!searchValue) return topics;
    const lower = searchValue.toLowerCase();
    return topics.filter((t) =>
      t.canonical_name.toLowerCase().includes(lower) ||
      t.slug.includes(lower)
    );
  }, [topics, searchValue]);

  const handleSelect = (topic: ClinicalTopic) => {
    if (selectedTopicIds.includes(topic.id)) {
      onSelectionChange(selectedTopicIds.filter((id) => id !== topic.id));
    } else {
      onSelectionChange([...selectedTopicIds, topic.id]);
    }
  };

  const handleRemove = (topicId: string) => {
    onSelectionChange(selectedTopicIds.filter((id) => id !== topicId));
  };

  const handleAddNew = async () => {
    if (!newTopicText.trim()) return;

    try {
      const newIds = await upsertTopics.mutateAsync({
        strings: [newTopicText.trim()],
        createdBy: "user",
      });

      if (newIds && newIds.length > 0) {
        onSelectionChange([...selectedTopicIds, newIds[0]]);
        toast.success("Interesse clinico aggiunto");
      }

      setNewTopicText("");
      setShowNewInput(false);
    } catch (error) {
      toast.error("Errore nell'aggiunta dell'interesse");
    }
  };

  return (
    <div className="space-y-2">
      {/* Selected topics */}
      <div className="flex flex-wrap gap-1.5">
        {selectedTopics.map((topic) => (
          <Badge
            key={topic.id}
            variant={topic.needs_review ? "outline" : "secondary"}
            className="flex items-center gap-1 pr-1"
          >
            {topic.needs_review && (
              <AlertCircle className="h-3 w-3 text-warning" />
            )}
            {topic.canonical_name}
            <button
              type="button"
              onClick={() => handleRemove(topic.id)}
              className="ml-1 rounded-full hover:bg-muted p-0.5"
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Selector */}
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={disabled || isLoading}
            >
              <Plus className="h-3 w-3 mr-1" />
              Aggiungi interesse
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[250px]" align="start">
            <Command>
              <CommandInput
                placeholder="Cerca interesse..."
                value={searchValue}
                onValueChange={setSearchValue}
              />
              <CommandList>
                <CommandEmpty>
                  <div className="p-2 text-center">
                    <p className="text-sm text-muted-foreground mb-2">
                      Nessun risultato
                    </p>
                    {searchValue && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNewTopicText(searchValue);
                          setShowNewInput(true);
                          setOpen(false);
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Proponi "{searchValue}"
                      </Button>
                    )}
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {filteredTopics.map((topic) => (
                    <CommandItem
                      key={topic.id}
                      value={topic.canonical_name}
                      onSelect={() => handleSelect(topic)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedTopicIds.includes(topic.id)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <span className="flex-1">{topic.canonical_name}</span>
                      {topic.needs_review && (
                        <AlertCircle className="h-3 w-3 text-warning ml-1" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {showNewInput && (
          <div className="flex gap-1 flex-1">
            <Input
              value={newTopicText}
              onChange={(e) => setNewTopicText(e.target.value)}
              placeholder="Nome interesse..."
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddNew();
                }
              }}
            />
            <Button
              size="sm"
              className="h-8"
              onClick={handleAddNew}
              disabled={!newTopicText.trim() || upsertTopics.isPending}
            >
              {upsertTopics.isPending ? "..." : "Aggiungi"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setShowNewInput(false);
                setNewTopicText("");
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {selectedTopics.some((t) => t.needs_review) && (
        <p className="text-xs text-warning flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Alcuni interessi sono in attesa di revisione
        </p>
      )}
    </div>
  );
}
