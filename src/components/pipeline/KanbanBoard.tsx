import { useState, useMemo, useRef, useCallback } from "react";
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
import { usePipelineStages, useDeals, useUpdateDealStage, type DealWithBrand } from "@/hooks/usePipeline";
import { recordKanbanTransition } from "@/hooks/useKanbanTransitionAudit";
import { useBrand, SYSTEM_BRAND_ID } from "@/contexts/BrandContext";
import { useBatchEntityTags, type TagAssignment } from "@/hooks/useTags";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCardPreview } from "./KanbanCardPreview";
import { MobileKanbanView } from "./MobileKanbanView";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Lock, Globe, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCanEditDeals } from "@/hooks/useCanEditDeals";
import { cn } from "@/lib/utils";

interface KanbanBoardProps {
  onDealClick?: (dealId: string) => void;
  filterTagIds?: string[];
}

export function KanbanBoard({ onDealClick, filterTagIds = [] }: KanbanBoardProps) {
  const { currentBrand } = useBrand();
  const isSystemBrand = currentBrand?.id === SYSTEM_BRAND_ID;
  
  const { data: stages, isLoading: stagesLoading } = usePipelineStages();
  const { data: deals, isLoading: dealsLoading } = useDeals(
    "open",
    filterTagIds.length > 0 ? filterTagIds : undefined
  );
  const dealIds = useMemo(() => (deals || []).map((d) => d.id), [deals]);
  const { data: tagsMap } = useBatchEntityTags("deal", dealIds);
  const updateStage = useUpdateDealStage();
  const isMobile = useIsMobile();
  const canEditDeals = useCanEditDeals();
  
  // Read-only only for users without edit permissions (e.g., 'amministrazione' role)
  const isReadOnly = !canEditDeals;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const columnsRef = useRef<HTMLDivElement>(null);

  const scrollToStage = useCallback((stageId: string) => {
    const el = document.getElementById(`stage-${stageId}`);
    if (el && columnsRef.current) {
      columnsRef.current.scrollTo({
        left: el.offsetLeft - columnsRef.current.offsetLeft - 16,
        behavior: 'smooth',
      });
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Lower distance for easier drag activation
        distance: 5,
      },
    })
  );

  // Group deals by stage (using stage name for global matching)
  const dealsByStage = useMemo(() => {
    const grouped: Record<string, DealWithBrand[]> = {};
    stages?.forEach((stage) => {
      grouped[stage.id] = [];
    });
    
    if (!stages?.length) return grouped;
    
    deals?.forEach((deal) => {
      // If deal has a valid stage ID that exists in our stages, use it
      if (deal.current_stage_id && grouped[deal.current_stage_id]) {
        grouped[deal.current_stage_id].push(deal);
      } else {
        // Fallback: assign to first stage if no stage or stage not found
        const firstStage = stages[0];
        if (firstStage) {
          grouped[firstStage.id].push(deal);
        }
      }
    });
    return grouped;
  }, [stages, deals]);

  const activeDeal = useMemo(() => {
    if (!activeId || !deals) return null;
    return deals.find((d) => d.id === activeId) || null;
  }, [activeId, deals]);

  const handleDragStart = (event: DragStartEvent) => {
    if (isReadOnly) return; // Prevent drag for read-only users
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || isReadOnly) return; // Prevent drop for read-only users

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

    // Capture previous stage info before update
    const fromStageId = deal.current_stage_id;
    const fromStageLabel = stages?.find((s) => s.id === fromStageId)?.name || null;
    const toStageLabel = stages?.find((s) => s.id === newStageId)?.name || "";

    // Sprint 4a: optimistic concurrency — pass current version; on STALE_DEAL roll back via refetch
    const expectedVersion = (deal as unknown as { version?: number | null }).version ?? null;
    updateStage.mutate(
      { dealId, stageId: newStageId, dealBrandId: deal.brand_id, expectedVersion },
      {
        onSuccess: () => {
          toast.success(`Deal spostato in "${toStageLabel}"`);
          // Fire-and-forget audit
          recordKanbanTransition({
            dealId,
            brandId: deal.brand_id,
            fromStageId: fromStageId || null,
            fromStageLabel,
            toStageId: newStageId,
            toStageLabel,
          });
        },
        onError: (error: Error) => {
          console.error("Stage update error:", error);
          if (error.message === "STALE_DEAL") {
            toast.error("Il deal è stato modificato da un altro utente. Aggiorno la vista.");
          } else {
            toast.error("Errore nello spostamento del deal");
          }
          // Rollback optimistic UI by invalidating cache
          queryClient.invalidateQueries({ queryKey: ["deals"] });
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
        readOnly={isReadOnly}
        showBrand={isSystemBrand}
        tagsMap={tagsMap}
      />
    );
  }

  // Desktop: Full drag-and-drop Kanban (disabled for read-only users or global view)
  return (
    <div className="relative flex h-full">
      {/* Vertical sidebar for stage navigation */}
      <aside
        className={cn(
          "relative shrink-0 border-r border-border bg-muted/30 transition-all duration-300 overflow-hidden",
          sidebarOpen ? "w-48" : "w-0"
        )}
      >
        <div className="w-48 p-3 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fasi</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              title="Nascondi sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          {stages.map((stage) => {
            const count = (dealsByStage[stage.id] || []).length;
            return (
              <button
                key={stage.id}
                onClick={() => scrollToStage(stage.id)}
                className="flex items-center gap-2 w-full px-2 py-2 rounded-md hover:bg-accent text-left text-sm transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color || 'hsl(var(--primary))' }} />
                <span className="flex-1 truncate text-foreground font-medium">{stage.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Toggle button when sidebar is closed */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute left-0 top-3 z-10 p-1.5 rounded-r-md border border-l-0 border-border bg-background hover:bg-accent text-muted-foreground shadow-sm"
          title="Mostra sidebar fasi"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* Main kanban area */}
      <div className="flex-1 min-w-0 relative">
        {/* Read-only indicator */}
        {isReadOnly && (
          <div className="absolute top-2 right-4 z-10 flex items-center gap-2 text-sm text-muted-foreground bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border">
            {isSystemBrand ? (
              <>
                <Globe className="h-3.5 w-3.5" />
                <span>Vista globale (sola lettura)</span>
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5" />
                <span>Modalità sola lettura</span>
              </>
            )}
          </div>
        )}
        <DndContext
          sensors={isReadOnly ? [] : sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div ref={columnsRef} className="flex gap-4 p-4 overflow-x-auto h-full pb-6">
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                deals={dealsByStage[stage.id] || []}
                onDealClick={onDealClick}
                readOnly={isReadOnly}
                showBrand={isSystemBrand}
                tagsMap={tagsMap}
                htmlId={`stage-${stage.id}`}
              />
            ))}
          </div>

          <DragOverlay>
            {activeDeal && <KanbanCardPreview deal={activeDeal} showBrand={isSystemBrand} />}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}