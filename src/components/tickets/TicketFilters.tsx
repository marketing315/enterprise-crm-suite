import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Filter, UserCircle, Bot, Hand, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagFilter } from "@/components/tags/TagFilter";
import { BrandOperator } from "@/hooks/useBrandOperators";

export type AssignmentTypeFilter = "all" | "auto" | "manual";

const DEBOUNCE_DELAY = 300; // ms

interface TicketFiltersProps {
  // Search - now receives debounced value from parent
  searchQuery: string;
  onSearchChange: (query: string) => void;
  // Category tag filter
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
  // Assignee filter
  assigneeFilter: string; // "all" | user_id
  onAssigneeChange: (value: string) => void;
  operators: BrandOperator[];
  // Assignment type filter (auto vs manual)
  assignmentTypeFilter: AssignmentTypeFilter;
  onAssignmentTypeChange: (value: AssignmentTypeFilter) => void;
  // Counts for badges
  autoCount: number;
  manualCount: number;
  // Hide assignee filter when using queue tabs
  hideAssigneeFilter?: boolean;
}

export function TicketFilters({
  searchQuery,
  onSearchChange,
  selectedTagIds,
  onTagsChange,
  assigneeFilter,
  onAssigneeChange,
  operators,
  assignmentTypeFilter,
  onAssignmentTypeChange,
  autoCount,
  manualCount,
  hideAssigneeFilter = false,
}: TicketFiltersProps) {
  // Local state for immediate input feedback
  const [localValue, setLocalValue] = useState(searchQuery);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local value when parent resets (e.g., tab change)
  useEffect(() => {
    if (searchQuery !== localValue && !isDebouncing) {
      setLocalValue(searchQuery);
    }
  }, [searchQuery]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalValue(value);

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // If cleared, trigger immediately for faster UX
    if (value === "") {
      setIsDebouncing(false);
      onSearchChange(value);
      return;
    }

    setIsDebouncing(true);

    // Set new debounced callback
    timeoutRef.current = setTimeout(() => {
      setIsDebouncing(false);
      onSearchChange(value);
    }, DEBOUNCE_DELAY);
  }, [onSearchChange]);

  // Enter key = flush immediately (UX for callcenter)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setIsDebouncing(false);
      onSearchChange(localValue);
    }
  }, [localValue, onSearchChange]);

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Search bar with debounce indicator */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca..."
          value={localValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="pl-10 pr-10"
          data-testid="tickets-search"
        />
        {isDebouncing && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Filter row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-wrap">
        <div className="hidden sm:flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtri:</span>
        </div>

        {/* Tag/Category filter */}
        <TagFilter
          selectedTagIds={selectedTagIds}
          onTagsChange={onTagsChange}
          scope="ticket"
        />

        {/* Assignee filter - hidden when using queue tabs */}
        {!hideAssigneeFilter && (
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <Select value={assigneeFilter} onValueChange={onAssigneeChange}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Assegnatario" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli operatori</SelectItem>
                <SelectItem value="unassigned">Non assegnati</SelectItem>
                {operators.map((op) => (
                  <SelectItem key={op.user_id} value={op.user_id}>
                    {op.full_name || op.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Assignment type filter (Auto vs Manual) */}
        <div className="flex items-center gap-1.5 sm:gap-2 sm:border-l sm:pl-4 overflow-x-auto">
          <Button
            variant={assignmentTypeFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onAssignmentTypeChange("all")}
            className="text-xs sm:text-sm"
          >
            Tutti
          </Button>
          <Button
            variant={assignmentTypeFilter === "auto" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onAssignmentTypeChange("auto")}
            className="gap-1 sm:gap-1.5 text-xs sm:text-sm"
          >
            <Bot className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">Auto</span> ({autoCount})
          </Button>
          <Button
            variant={assignmentTypeFilter === "manual" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onAssignmentTypeChange("manual")}
            className="gap-1 sm:gap-1.5 text-xs sm:text-sm"
          >
            <Hand className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">Manuali</span> ({manualCount})
          </Button>
        </div>
      </div>
    </div>
  );
}
