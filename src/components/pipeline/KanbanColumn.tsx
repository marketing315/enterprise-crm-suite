import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { KanbanCard } from "./KanbanCard";
import type { PipelineStage, DealWithContact } from "@/types/database";

interface KanbanColumnProps {
  stage: PipelineStage;
  deals: DealWithContact[];
  onDealClick?: (dealId: string) => void;
}

export function KanbanColumn({ stage, deals, onDealClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  const dealIds = deals.map((d) => d.id);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-[240px] sm:w-64 md:w-72 shrink-0 bg-muted/30 rounded-lg border transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <div
            className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 rounded-full shrink-0"
            style={{ backgroundColor: stage.color || "#6366f1" }}
          />
          <h3 className="font-semibold text-xs sm:text-sm truncate">{stage.name}</h3>
        </div>
        <Badge variant="secondary" className="text-[10px] sm:text-xs ml-1 shrink-0">
          {deals.length}
        </Badge>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1 p-2">
        <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 min-h-[100px]">
            {deals.map((deal) => (
              <KanbanCard
                key={deal.id}
                deal={deal}
                onClick={() => onDealClick?.(deal.id)}
              />
            ))}
            {deals.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Nessun deal
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}
