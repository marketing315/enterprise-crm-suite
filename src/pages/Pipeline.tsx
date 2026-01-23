import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { useBrand } from "@/contexts/BrandContext";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Pipeline() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const navigate = useNavigate();

  const handleDealClick = (dealId: string) => {
    // Navigate to contact detail in future
    console.log("Deal clicked:", dealId);
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
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-muted-foreground">
          Gestisci i tuoi deal in {currentBrand?.name}
        </p>
      </div>

      <KanbanBoard onDealClick={handleDealClick} />
    </div>
  );
}
