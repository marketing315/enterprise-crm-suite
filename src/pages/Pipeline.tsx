import { useState } from "react";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { DealDetailSheet } from "@/components/pipeline/DealDetailSheet";
import { TagFilter } from "@/components/tags/TagFilter";
import { AddStageDialog } from "@/components/pipeline/AddStageDialog";
import { ManageStagesDialog } from "@/components/pipeline/ManageStagesDialog";
import { useBrand, SYSTEM_BRAND_ID } from "@/contexts/BrandContext";
import { useDeals } from "@/hooks/usePipeline";
import { AlertCircle, Globe, Trophy, XCircle, Archive, Plus, Settings2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClosedDealsTable } from "@/components/pipeline/ClosedDealsTable";
import { Button } from "@/components/ui/button";

export default function Pipeline() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"open" | "won" | "lost" | "closed">("open");

  // Fetch deals based on selected tab
  const { data: openDeals } = useDeals("open", selectedTagIds.length > 0 ? selectedTagIds : undefined);
  const { data: wonDeals } = useDeals("won");
  const { data: lostDeals } = useDeals("lost");
  const { data: closedDeals } = useDeals("closed");
  
  // For deal detail sheet
  const allDeals = [...(openDeals || []), ...(wonDeals || []), ...(lostDeals || []), ...(closedDeals || [])];
  const selectedDeal = allDeals.find((d) => d.id === selectedDealId) || null;

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

  // Count for badges
  const wonCount = wonDeals?.length || 0;
  const lostCount = lostDeals?.length || 0;
  const closedCount = closedDeals?.length || 0;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="p-3 md:p-4 border-b space-y-3 shrink-0 overflow-hidden">
        <div className="flex items-start justify-between">
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
          <ManageStagesDialog
            trigger={
              <Button size="sm" variant="outline">
                <Settings2 className="h-4 w-4 mr-1" />
                Gestisci fasi
              </Button>
            }
          />
        </div>
      </div>

      {/* Tabs for Pipeline / Won / Lost / Archived */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 md:px-4 pt-2 border-b">
          <TabsList className="h-10">
            <TabsTrigger value="open" className="gap-2">
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="won" className="gap-2">
              <Trophy className="h-4 w-4 text-green-600" />
              Vinti
              {wonCount > 0 && (
                <span className="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                  {wonCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="lost" className="gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              Persi
              {lostCount > 0 && (
                <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                  {lostCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="closed" className="gap-2">
              <Archive className="h-4 w-4" />
              Archivio
              {closedCount > 0 && (
                <span className="ml-1 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                  {closedCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="open" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex flex-col">
          {/* Tag Filter - only show for single brand */}
          {!isSystemBrand && (
            <div className="px-3 md:px-4 py-2">
              <TagFilter
                selectedTagIds={selectedTagIds}
                onTagsChange={setSelectedTagIds}
                scope="deal"
              />
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <KanbanBoard 
              onDealClick={handleDealClick}
              filterTagIds={selectedTagIds}
            />
          </div>
        </TabsContent>

        <TabsContent value="won" className="flex-1 overflow-auto p-4 mt-0">
          <ClosedDealsTable
            deals={wonDeals}
            onDealClick={handleDealClick}
            showBrand={isSystemBrand}
            status="won"
            emptyMessage="Nessun deal vinto"
          />
        </TabsContent>

        <TabsContent value="lost" className="flex-1 overflow-auto p-4 mt-0">
          <ClosedDealsTable
            deals={lostDeals}
            onDealClick={handleDealClick}
            showBrand={isSystemBrand}
            status="lost"
            emptyMessage="Nessun deal perso"
          />
        </TabsContent>

        <TabsContent value="closed" className="flex-1 overflow-auto p-4 mt-0">
          <ClosedDealsTable
            deals={closedDeals}
            onDealClick={handleDealClick}
            showBrand={isSystemBrand}
            status="closed"
            emptyMessage="Nessun deal archiviato"
          />
        </TabsContent>
      </Tabs>

      {/* Deal Detail Sheet */}
      <DealDetailSheet
        deal={selectedDeal}
        open={!!selectedDealId}
        onOpenChange={(open) => !open && setSelectedDealId(null)}
      />
    </div>
  );
}
