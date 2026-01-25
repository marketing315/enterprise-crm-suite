import { useState } from "react";
import { X, Hand, ArrowRightLeft, Flag, Tag, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TicketStatus } from "@/hooks/useTickets";
import { BrandOperator } from "@/hooks/useBrandOperators";
import { useTags } from "@/hooks/useTags";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Aperto" },
  { value: "in_progress", label: "In lavorazione" },
  { value: "resolved", label: "Risolto" },
  { value: "closed", label: "Chiuso" },
  { value: "reopened", label: "Riaperto" },
];

const PRIORITY_OPTIONS = [
  { value: 1, label: "P1 - Critica", color: "text-destructive" },
  { value: 2, label: "P2 - Alta", color: "text-orange-600" },
  { value: 3, label: "P3 - Media", color: "text-yellow-600" },
  { value: 4, label: "P4 - Bassa", color: "text-blue-600" },
  { value: 5, label: "P5 - Minima", color: "text-muted-foreground" },
];

interface TicketBulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onAssignToMe: () => void;
  onAssignTo: (userId: string) => void;
  onChangeStatus: (status: TicketStatus) => void;
  onChangePriority: (priority: number) => void;
  onChangeCategory: (tagId: string | null) => void;
  operators: BrandOperator[];
  isLoading?: boolean;
}

export function TicketBulkActionsBar({
  selectedCount,
  onClearSelection,
  onAssignToMe,
  onAssignTo,
  onChangeStatus,
  onChangePriority,
  onChangeCategory,
  operators,
  isLoading = false,
}: TicketBulkActionsBarProps) {
  const { data: tags = [] } = useTags("ticket");

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 bg-background border rounded-lg shadow-lg px-4 py-3">
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}

        <Badge variant="secondary" className="gap-1.5">
          {selectedCount} selezionati
        </Badge>

        <Separator orientation="vertical" className="h-6" />

        {/* Assign to me */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onAssignToMe}
          disabled={isLoading}
          className="gap-1.5"
        >
          <Hand className="h-4 w-4" />
          Prendi in carico
        </Button>

        {/* Assign to specific operator */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isLoading} className="gap-1.5">
              <User className="h-4 w-4" />
              Assegna a
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={() => onAssignTo("")}>
              <span className="text-muted-foreground">Rimuovi assegnazione</span>
            </DropdownMenuItem>
            {operators.map((op) => (
              <DropdownMenuItem key={op.user_id} onClick={() => onAssignTo(op.user_id)}>
                {op.full_name || op.email}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-6" />

        {/* Change status */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isLoading} className="gap-1.5">
              <ArrowRightLeft className="h-4 w-4" />
              Stato
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            {STATUS_OPTIONS.map((opt) => (
              <DropdownMenuItem key={opt.value} onClick={() => onChangeStatus(opt.value)}>
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Change priority */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isLoading} className="gap-1.5">
              <Flag className="h-4 w-4" />
              Priorità
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            {PRIORITY_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => onChangePriority(opt.value)}
                className={cn(opt.color)}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Change category */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isLoading} className="gap-1.5">
              <Tag className="h-4 w-4" />
              Categoria
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="max-h-[300px] overflow-y-auto">
            <DropdownMenuItem onClick={() => onChangeCategory(null)}>
              <span className="text-muted-foreground">Rimuovi categoria</span>
            </DropdownMenuItem>
            {tags.map((tag) => (
              <DropdownMenuItem key={tag.id} onClick={() => onChangeCategory(tag.id)}>
                <span
                  className="w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-6" />

        {/* Clear selection */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isLoading}
          className="gap-1.5 text-muted-foreground"
        >
          <X className="h-4 w-4" />
          Deseleziona
        </Button>
      </div>
    </div>
  );
}
