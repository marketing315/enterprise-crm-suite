import { useState } from "react";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { DealDetailSheet } from "@/components/pipeline/DealDetailSheet";
import { TagFilter } from "@/components/tags/TagFilter";
import { useBrand } from "@/contexts/BrandContext";
import { useDeals } from "@/hooks/usePipeline";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Pipeline() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  const { data: deals } = useDeals("open");
  const selectedDeal = deals?.find((d) => d.id === selectedDealId) || null;

  const handleDealClick = (dealId: string) => {
    setSelectedDealId(dealId);
  };

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare la pipeline.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="p-3 md:p-4 border-b space-y-3 shrink-0 overflow-hidden">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Pipeline</h1>
          <p className="text-sm text-muted-foreground truncate">
            Gestisci i tuoi deal in {currentBrand?.name}
          </p>
        </div>
        
        {/* Tag Filter */}
        <TagFilter
          selectedTagIds={selectedTagIds}
          onTagsChange={setSelectedTagIds}
          scope="deal"
        />
      </div>

      <div className="flex-1 overflow-hidden">
        <KanbanBoard 
          onDealClick={handleDealClick}
          filterTagIds={selectedTagIds}
        />
      </div>

      {/* Deal Detail Sheet */}
      <DealDetailSheet
        deal={selectedDeal}
        open={!!selectedDealId}
        onOpenChange={(open) => !open && setSelectedDealId(null)}
      />
    </div>
  );
}
