import { useState } from "react";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { DealDetailSheet } from "@/components/pipeline/DealDetailSheet";
import { TagFilter } from "@/components/tags/TagFilter";
import { useBrand, SYSTEM_BRAND_ID } from "@/contexts/BrandContext";
import { useDeals } from "@/hooks/usePipeline";
import { AlertCircle, Globe } from "lucide-react";
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

  // Check if system brand (Azienda Intera) is selected
  const isSystemBrand = currentBrand?.id === SYSTEM_BRAND_ID;

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
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold">Pipeline</h1>
            {isSystemBrand && (
              <div className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                <Globe className="h-3 w-3" />
                <span>Tutti i brand</span>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {isSystemBrand 
              ? "Vista globale di tutti i deal aziendali"
              : `Gestisci i tuoi deal in ${currentBrand?.name}`
            }
          </p>
        </div>
        
        {/* Tag Filter - only show for single brand */}
        {!isSystemBrand && (
          <TagFilter
            selectedTagIds={selectedTagIds}
            onTagsChange={setSelectedTagIds}
            scope="deal"
          />
        )}
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
