import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings2, Trash2, RotateCcw, Plus } from "lucide-react";
import { 
  usePipelineStagesAdmin,
  useDeactivatePipelineStage,
  useReactivatePipelineStage,
  useDeletePipelineStagePermanently,
  useAddPipelineStage,
} from "@/hooks/usePipelineStagesAdmin";
import { Skeleton } from "@/components/ui/skeleton";
import type { PipelineStage } from "@/types/database";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ManageStagesDialogProps {
  trigger?: React.ReactNode;
}

export function ManageStagesDialog({ trigger }: ManageStagesDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: stages, isLoading } = usePipelineStagesAdmin();
  const deactivateStage = useDeactivatePipelineStage();
  const reactivateStage = useReactivatePipelineStage();
  const deleteStage = useDeletePipelineStagePermanently();
  const addStage = useAddPipelineStage();

  const [stageToDeactivate, setStageToDeactivate] = useState<PipelineStage | null>(null);
  const [fallbackStageId, setFallbackStageId] = useState<string>("");
  const [stageToDeletePermanently, setStageToDeletePermanently] = useState<PipelineStage | null>(null);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#6366f1");

  const activeStages = stages?.filter(s => s.is_active) || [];
  const inactiveStages = stages?.filter(s => !s.is_active) || [];

  const handleAddStage = async () => {
    if (!newStageName.trim()) return;
    await addStage.mutateAsync({ name: newStageName.trim(), color: newStageColor });
    setNewStageName("");
    setNewStageColor("#6366f1");
  };

  const openDeactivateDialog = (stage: PipelineStage) => {
    setStageToDeactivate(stage);
    const available = activeStages.filter(s => s.id !== stage.id);
    if (available.length > 0) {
      setFallbackStageId(available[0].id);
    }
  };

  const handleDeactivate = async () => {
    if (!stageToDeactivate || !fallbackStageId) return;
    
    await deactivateStage.mutateAsync({
      stageId: stageToDeactivate.id,
      fallbackStageId,
    });
    setStageToDeactivate(null);
    setFallbackStageId("");
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button size="sm" variant="ghost">
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gestisci Fasi</DialogTitle>
            <DialogDescription>
              Disattiva o elimina le fasi della pipeline.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Add new stage */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Aggiungi Fase
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newStageColor}
                  onChange={(e) => setNewStageColor(e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer shrink-0"
                />
                <Input
                  placeholder="Nome nuova fase..."
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddStage()}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleAddStage}
                  disabled={!newStageName.trim() || addStage.isPending}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <>
                {/* Active stages */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Fasi Attive
                  </Label>
                  {activeStages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessuna fase attiva</p>
                  ) : (
                    <div className="space-y-1">
                      {activeStages.map((stage) => (
                        <div
                          key={stage.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: stage.color || "#6366f1" }}
                            />
                            <span className="text-sm font-medium">{stage.name}</span>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => openDeactivateDialog(stage)}
                                disabled={activeStages.length <= 1}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {activeStages.length <= 1 
                                ? "Deve rimanere almeno una fase attiva"
                                : "Disattiva fase"
                              }
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inactive stages */}
                {inactiveStages.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Fasi Disattivate
                    </Label>
                    <div className="space-y-1">
                      {inactiveStages.map((stage) => (
                        <div
                          key={stage.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full shrink-0 opacity-50"
                              style={{ backgroundColor: stage.color || "#6366f1" }}
                            />
                            <span className="text-sm text-muted-foreground">
                              {stage.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => reactivateStage.mutate(stage.id)}
                                  disabled={reactivateStage.isPending}
                                >
                                  <RotateCcw className="h-4 w-4 text-primary" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Riattiva fase</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setStageToDeletePermanently(stage)}
                                  disabled={deleteStage.isPending}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Elimina definitivamente</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Deactivate Stage Dialog */}
      <AlertDialog 
        open={!!stageToDeactivate} 
        onOpenChange={(open) => !open && setStageToDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disattiva "{stageToDeactivate?.name}"?</AlertDialogTitle>
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
                      .filter(s => s.id !== stageToDeactivate?.id)
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
              onClick={handleDeactivate}
              disabled={!fallbackStageId || deactivateStage.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deactivateStage.isPending ? "Disattivazione..." : "Disattiva"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Permanently Dialog */}
      <AlertDialog
        open={!!stageToDeletePermanently}
        onOpenChange={(open) => !open && setStageToDeletePermanently(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Elimina definitivamente "{stageToDeletePermanently?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <p className="mb-2">
                Questa azione è <strong>irreversibile</strong>. La fase verrà eliminata permanentemente.
              </p>
              <p className="text-sm text-muted-foreground">
                L'eliminazione è possibile solo se nessun deal è associato a questa fase.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (stageToDeletePermanently) {
                  deleteStage.mutate(stageToDeletePermanently.id);
                  setStageToDeletePermanently(null);
                }
              }}
              disabled={deleteStage.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteStage.isPending ? "Eliminazione..." : "Elimina definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
