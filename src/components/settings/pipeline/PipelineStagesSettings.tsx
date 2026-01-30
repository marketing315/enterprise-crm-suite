import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableStageItem } from "./SortableStageItem";
import { 
  usePipelineStagesAdmin, 
  useCreatePipelineStage, 
  useReorderPipelineStages,
  useDeactivatePipelineStage,
} from "@/hooks/usePipelineStagesAdmin";
import { GitBranch, Plus, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PipelineStage } from "@/types/database";

const STAGE_COLORS = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Viola" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#ef4444", label: "Rosso" },
  { value: "#f97316", label: "Arancione" },
  { value: "#eab308", label: "Giallo" },
  { value: "#22c55e", label: "Verde" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#3b82f6", label: "Blu" },
  { value: "#64748b", label: "Grigio" },
];

export function PipelineStagesSettings() {
  const { data: stages, isLoading } = usePipelineStagesAdmin();
  const createStage = useCreatePipelineStage();
  const reorderStages = useReorderPipelineStages();
  const deactivateStage = useDeactivatePipelineStage();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#6366f1");
  
  const [stageToDelete, setStageToDelete] = useState<PipelineStage | null>(null);
  const [fallbackStageId, setFallbackStageId] = useState<string>("");

  const activeStages = stages?.filter(s => s.is_active) || [];
  const inactiveStages = stages?.filter(s => !s.is_active) || [];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activeStages.findIndex((s) => s.id === active.id);
      const newIndex = activeStages.findIndex((s) => s.id === over.id);
      
      const newOrder = arrayMove(activeStages, oldIndex, newIndex);
      reorderStages.mutate(newOrder.map(s => s.id));
    }
  };

  const handleCreateStage = async () => {
    if (!newStageName.trim()) return;
    
    await createStage.mutateAsync({ name: newStageName, color: newStageColor });
    setNewStageName("");
    setNewStageColor("#6366f1");
    setIsAddDialogOpen(false);
  };

  const handleDeactivateStage = async () => {
    if (!stageToDelete || !fallbackStageId) return;
    
    await deactivateStage.mutateAsync({
      stageId: stageToDelete.id,
      fallbackStageId,
    });
    setStageToDelete(null);
    setFallbackStageId("");
  };

  const openDeleteDialog = (stage: PipelineStage) => {
    setStageToDelete(stage);
    // Pre-select first available stage as fallback
    const available = activeStages.filter(s => s.id !== stage.id);
    if (available.length > 0) {
      setFallbackStageId(available[0].id);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Fasi Pipeline
              </CardTitle>
              <CardDescription>
                Configura le fasi della pipeline di vendita. Trascina per riordinare.
              </CardDescription>
            </div>
            <Button onClick={() => setIsAddDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Aggiungi fase
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activeStages.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Nessuna fase pipeline configurata. Aggiungi la prima fase per iniziare.
              </AlertDescription>
            </Alert>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={activeStages.map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {activeStages.map((stage, index) => (
                    <SortableStageItem
                      key={stage.id}
                      stage={stage}
                      index={index}
                      onDelete={() => openDeleteDialog(stage)}
                      canDelete={activeStages.length > 1}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Inactive stages */}
      {inactiveStages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Fasi Disattivate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {inactiveStages.map((stage) => (
                <Badge key={stage.id} variant="secondary" className="opacity-60">
                  <div 
                    className="w-2 h-2 rounded-full mr-1.5" 
                    style={{ backgroundColor: stage.color || "#6366f1" }} 
                  />
                  {stage.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Stage Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuova Fase Pipeline</DialogTitle>
            <DialogDescription>
              Aggiungi una nuova fase alla pipeline di vendita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stage-name">Nome fase</Label>
              <Input
                id="stage-name"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="es. Primo Contatto"
                onKeyDown={(e) => e.key === "Enter" && handleCreateStage()}
              />
            </div>
            <div className="space-y-2">
              <Label>Colore</Label>
              <div className="flex flex-wrap gap-2">
                {STAGE_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      newStageColor === color.value
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setNewStageColor(color.value)}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Annulla
            </Button>
            <Button 
              onClick={handleCreateStage} 
              disabled={!newStageName.trim() || createStage.isPending}
            >
              {createStage.isPending ? "Creazione..." : "Crea fase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Stage Dialog */}
      <AlertDialog open={!!stageToDelete} onOpenChange={(open) => !open && setStageToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disattiva "{stageToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Questa azione disattiverà la fase. I deal attualmente in questa fase 
                verranno spostati nella fase di fallback selezionata.
              </p>
              <div className="space-y-2">
                <Label>Sposta i deal in:</Label>
                <Select value={fallbackStageId} onValueChange={setFallbackStageId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona fase di fallback" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeStages
                      .filter(s => s.id !== stageToDelete?.id)
                      .map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: stage.color || "#6366f1" }} 
                            />
                            {stage.name}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivateStage}
              disabled={!fallbackStageId || deactivateStage.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deactivateStage.isPending ? "Disattivazione..." : "Disattiva"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
