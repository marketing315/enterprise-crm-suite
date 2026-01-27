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
import { usePipelineStages, useDeals, useUpdateDealStage } from "@/hooks/usePipeline";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import type { DealWithContact } from "@/types/database";

interface KanbanBoardProps {
  onDealClick?: (dealId: string) => void;
  filterTagIds?: string[];
}

export function KanbanBoard({ onDealClick, filterTagIds = [] }: KanbanBoardProps) {
  const { data: stages, isLoading: stagesLoading } = usePipelineStages();
  const { data: deals, isLoading: dealsLoading } = useDeals("open");
  const updateStage = useUpdateDealStage();

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
    const grouped: Record<string, DealWithContact[]> = {};
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
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 p-4 overflow-x-auto min-h-[calc(100vh-12rem)]">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            deals={dealsByStage[stage.id] || []}
            onDealClick={onDealClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal && <KanbanCard deal={activeDeal} />}
      </DragOverlay>
    </DndContext>
  );
}
