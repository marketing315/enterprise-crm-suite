import { useMemo } from "react";
import { Search, Filter, UserCircle, Bot, Hand } from "lucide-react";
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

interface TicketFiltersProps {
  // Search
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
  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca per nome, email, telefono, titolo..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
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
            <UserCircle className="h-4 w-4 text-muted-foreground" />
            <Select value={assigneeFilter} onValueChange={onAssigneeChange}>
              <SelectTrigger className="w-[180px]">
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
        <div className="flex items-center gap-2 border-l pl-4">
          <Button
            variant={assignmentTypeFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onAssignmentTypeChange("all")}
          >
            Tutti
          </Button>
          <Button
            variant={assignmentTypeFilter === "auto" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onAssignmentTypeChange("auto")}
            className="gap-1.5"
          >
            <Bot className="h-3.5 w-3.5" />
            Auto ({autoCount})
          </Button>
          <Button
            variant={assignmentTypeFilter === "manual" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onAssignmentTypeChange("manual")}
            className="gap-1.5"
          >
            <Hand className="h-3.5 w-3.5" />
            Manuali ({manualCount})
          </Button>
        </div>
      </div>
    </div>
  );
}
