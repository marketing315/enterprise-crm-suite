import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KanbanCard } from "./KanbanCard";
import type { PipelineStage, DealWithContact } from "@/types/database";

interface MobileKanbanViewProps {
  stages: PipelineStage[];
  dealsByStage: Record<string, DealWithContact[]>;
  onDealClick?: (dealId: string) => void;
}

export function MobileKanbanView({ 
  stages, 
  dealsByStage, 
  onDealClick 
}: MobileKanbanViewProps) {
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const activeStage = stages[activeStageIndex];
  const activeDeals = activeStage ? dealsByStage[activeStage.id] || [] : [];

  // Handle swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50; // minimum swipe distance

    if (Math.abs(diff) > threshold) {
      if (diff > 0 && activeStageIndex < stages.length - 1) {
        // Swipe left - next stage
        setActiveStageIndex(prev => prev + 1);
      } else if (diff < 0 && activeStageIndex > 0) {
        // Swipe right - previous stage
        setActiveStageIndex(prev => prev - 1);
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  const goToPrevStage = () => {
    if (activeStageIndex > 0) {
      setActiveStageIndex(prev => prev - 1);
    }
  };

  const goToNextStage = () => {
    if (activeStageIndex < stages.length - 1) {
      setActiveStageIndex(prev => prev + 1);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Stage Tabs - Scrollable horizontal tabs */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-1 p-2 min-w-max">
            {stages.map((stage, index) => {
              const stageDeals = dealsByStage[stage.id] || [];
              const isActive = index === activeStageIndex;
              
              return (
                <button
                  key={stage.id}
                  onClick={() => setActiveStageIndex(index)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                    transition-all duration-200 whitespace-nowrap shrink-0
                    ${isActive 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }
                  `}
                >
                  <div 
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isActive ? "currentColor" : (stage.color || "hsl(var(--primary))") }}
                  />
                  <span className="max-w-[100px] truncate">{stage.name}</span>
                  <Badge 
                    variant={isActive ? "secondary" : "outline"}
                    className="h-5 min-w-[20px] text-xs"
                  >
                    {stageDeals.length}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPrevStage}
          disabled={activeStageIndex === 0}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">Prec.</span>
        </Button>
        
        <div className="flex items-center gap-2 text-sm">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: activeStage?.color || "hsl(var(--primary))" }}
          />
          <span className="font-semibold">{activeStage?.name}</span>
          <span className="text-muted-foreground">
            ({activeDeals.length} deal{activeDeals.length !== 1 ? "s" : ""})
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={goToNextStage}
          disabled={activeStageIndex === stages.length - 1}
          className="gap-1"
        >
          <span className="sr-only sm:not-sr-only">Succ.</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Stage indicator dots */}
      <div className="flex justify-center gap-1.5 py-2 bg-muted/20">
        {stages.map((stage, index) => (
          <button
            key={stage.id}
            onClick={() => setActiveStageIndex(index)}
            className={`
              w-2 h-2 rounded-full transition-all duration-200
              ${index === activeStageIndex 
                ? "w-6 bg-primary" 
                : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }
            `}
            aria-label={`Go to ${stage.name}`}
          />
        ))}
      </div>

      {/* Cards Container with Swipe */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <ScrollArea className="h-full">
          <div className="p-3 space-y-3">
            {activeDeals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div 
                  className="w-12 h-12 rounded-full mb-4 opacity-20"
                  style={{ backgroundColor: activeStage?.color || "hsl(var(--primary))" }}
                />
                <p className="text-muted-foreground text-sm">
                  Nessun deal in "{activeStage?.name}"
                </p>
                <p className="text-muted-foreground/60 text-xs mt-1">
                  Scorri per vedere altre colonne
                </p>
              </div>
            ) : (
              activeDeals.map((deal) => (
                <KanbanCard
                  key={deal.id}
                  deal={deal}
                  onClick={() => onDealClick?.(deal.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Swipe hint for first-time users */}
      <div className="text-center py-2 text-xs text-muted-foreground/60 border-t bg-muted/20">
        ← Scorri per cambiare colonna →
      </div>
    </div>
  );
}
