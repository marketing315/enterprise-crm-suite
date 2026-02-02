import { useState, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { usePipelineStages, useDeals, useUpdateDealStage, type DealWithContactAndTags } from "@/hooks/usePipeline";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCardPreview } from "./KanbanCardPreview";
import { MobileKanbanView } from "./MobileKanbanView";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCanEditDeals } from "@/hooks/useCanEditDeals";

interface KanbanBoardProps {
  onDealClick?: (dealId: string) => void;
  filterTagIds?: string[];
}

export function KanbanBoard({ onDealClick, filterTagIds = [] }: KanbanBoardProps) {
  const { data: stages, isLoading: stagesLoading } = usePipelineStages();
  const { data: deals, isLoading: dealsLoading } = useDeals(
    "open",
    filterTagIds.length > 0 ? filterTagIds : undefined
  );
  const updateStage = useUpdateDealStage();
  const isMobile = useIsMobile();
  const canEditDeals = useCanEditDeals();

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Group deals by stage
  const dealsByStage = useMemo(() => {
    const grouped: Record<string, DealWithContactAndTags[]> = {};
    stages?.forEach((stage) => {
      grouped[stage.id] = [];
    });
    deals?.forEach((deal) => {
      if (deal.current_stage_id && grouped[deal.current_stage_id]) {
        grouped[deal.current_stage_id].push(deal);
      } else if (stages?.[0]) {
        // Fallback to first stage if no stage assigned
        grouped[stages[0].id]?.push(deal);
      }
    });
    return grouped;
  }, [stages, deals]);

  const activeDeal = useMemo(() => {
    if (!activeId || !deals) return null;
    return deals.find((d) => d.id === activeId) || null;
  }, [activeId, deals]);

  const handleDragStart = (event: DragStartEvent) => {
    if (!canEditDeals) return; // Prevent drag for read-only users
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !canEditDeals) return; // Prevent drop for read-only users

    const dealId = active.id as string;
    const overId = over.id as string;

    // Determine if we dropped on a stage or a deal
    // If overId is a stage ID, use it directly; otherwise find the stage of the target deal
    const isStageId = stages?.some((s) => s.id === overId);
    let newStageId: string;
    
    if (isStageId) {
      newStageId = overId;
    } else {
      // Dropped on another deal - find its stage
      const targetDeal = deals?.find((d) => d.id === overId);
      if (!targetDeal?.current_stage_id) return;
      newStageId = targetDeal.current_stage_id;
    }

    // Check if dropping on a different stage
    const deal = deals?.find((d) => d.id === dealId);
    if (!deal || deal.current_stage_id === newStageId) return;

    // Optimistic update
    updateStage.mutate(
      { dealId, stageId: newStageId },
      {
        onSuccess: () => {
          const stageName = stages?.find((s) => s.id === newStageId)?.name;
          toast.success(`Deal spostato in "${stageName}"`);
        },
        onError: (error) => {
          console.error("Stage update error:", error);
          toast.error("Errore nello spostamento del deal");
        },
      }
    );
  };

  if (stagesLoading || dealsLoading) {
    return (
      <div className="flex gap-4 p-4 overflow-x-auto">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-72 shrink-0 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!stages?.length) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Nessuno stage pipeline configurato. Contatta un amministratore.
        </AlertDescription>
      </Alert>
    );
  }

  // Mobile: Show tab-based single-column view
  if (isMobile) {
    return (
      <MobileKanbanView
        stages={stages}
        dealsByStage={dealsByStage}
        onDealClick={onDealClick}
        readOnly={!canEditDeals}
      />
    );
  }

  // Desktop: Full drag-and-drop Kanban (disabled for read-only users)
  return (
    <div className="relative">
      {!canEditDeals && (
        <div className="absolute top-2 right-4 z-10 flex items-center gap-2 text-sm text-muted-foreground bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border">
          <Lock className="h-3.5 w-3.5" />
          <span>Modalità sola lettura</span>
        </div>
      )}
      <DndContext
        sensors={canEditDeals ? sensors : []} // Disable sensors for read-only
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 p-4 overflow-x-auto h-full pb-6">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage[stage.id] || []}
              onDealClick={onDealClick}
              readOnly={!canEditDeals}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDeal && <KanbanCardPreview deal={activeDeal} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}